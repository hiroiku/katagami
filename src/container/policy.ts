import { ContainerError } from '../error/index.js';
import { type AnyMetadataKey, type MetadataPair, validateMetadataKeys } from '../metadata/index.js';
import type { Registration } from '../resolver/index.js';
import type { RegistrationDescription } from '../scope/index.js';

export interface ReturnEvent {
	readonly registrations: readonly RegistrationDescription[];
}
export type BeforeReturn = (event: ReturnEvent) => void;

export interface ContainerPolicy<Required extends readonly AnyMetadataKey[] = readonly AnyMetadataKey[]> {
	readonly name?: string;
	readonly requiredMetadata?: Required;
	readonly beforeReturn?: BeforeReturn;
}

export type RequiredMetadata<P> = P extends { readonly requiredMetadata: infer R extends readonly AnyMetadataKey[] }
	? R
	: readonly [];

/**
 * An origin recorded for an instance.
 *
 * It holds neither the registration nor its factory. A policy outlives its containers, so holding a
 * registration would keep every per-request container and its factory closures reachable from the record.
 */
interface Origin {
	readonly description: RegistrationDescription;
	readonly pairs: readonly MetadataPair[] | undefined;
}

export interface PolicyState {
	readonly definition: ContainerPolicy;
	readonly name: string | undefined;
	readonly requiredMetadata: readonly AnyMetadataKey[];
	readonly beforeReturn: BeforeReturn | undefined;
	readonly origins: WeakMap<object, Origin[]>;
}

// 同じ配布バージョンの ESM/CJS は、元の policy 参照をキーに設定と出自だけを共有する。
// 末尾の世代は記録の形を表し、同じ版でも形の違うビルドとは記録を共有しない。
const POLICIES = Symbol.for('katagami.policy-state.4.0.0.v1');
const shared = globalThis as typeof globalThis & { [POLICIES]?: WeakMap<object, PolicyState> };
if (!shared[POLICIES]) {
	Object.defineProperty(shared, POLICIES, { value: new WeakMap<object, PolicyState>() });
}
const policies = shared[POLICIES] as WeakMap<object, PolicyState>;

/** アクセサーを実行せず、通常のデータプロパティーとして設定を読む。 */
function dataProperty(source: object, key: PropertyKey): unknown {
	let current: object | null = source;
	while (current !== null) {
		const descriptor = Object.getOwnPropertyDescriptor(current, key);
		if (descriptor) {
			if (!('value' in descriptor)) {
				throw new ContainerError('Policy settings must be data properties.');
			}
			return descriptor.value;
		}
		current = Object.getPrototypeOf(current);
	}
	return undefined;
}

export function bindPolicy(definition: ContainerPolicy | undefined): PolicyState | undefined {
	if (definition === undefined) {
		return undefined;
	}
	if (definition === null || typeof definition !== 'object') {
		throw new ContainerError('Policy must be an object.');
	}
	const name = dataProperty(definition, 'name');
	const required = dataProperty(definition, 'requiredMetadata');
	const beforeReturn = dataProperty(definition, 'beforeReturn');
	if (name !== undefined && typeof name !== 'string') {
		throw new ContainerError('Policy name must be a string.');
	}
	if (required !== undefined && !Array.isArray(required)) {
		throw new ContainerError('Required metadata must be an array.');
	}
	if (beforeReturn !== undefined && typeof beforeReturn !== 'function') {
		throw new ContainerError('beforeReturn must be a function.');
	}
	const keys: AnyMetadataKey[] = [];
	if (required !== undefined) {
		for (let index = 0; index < required.length; index++) {
			keys.push(dataProperty(required, index) as AnyMetadataKey);
		}
	}
	validateMetadataKeys(keys);
	const previous = policies.get(definition);
	if (previous) {
		if (
			previous.name !== name ||
			previous.beforeReturn !== beforeReturn ||
			previous.requiredMetadata.length !== keys.length ||
			previous.requiredMetadata.some((key, index) => key !== keys[index])
		) {
			throw new ContainerError('Policy has changed since its first use.');
		}
		return previous;
	}
	const state: PolicyState = Object.freeze({
		beforeReturn: beforeReturn as BeforeReturn | undefined,
		definition,
		name,
		origins: new WeakMap<object, Origin[]>(),
		requiredMetadata: Object.freeze(keys),
	});
	policies.set(definition, state);
	return state;
}

export function observe(
	policy: PolicyState | undefined,
	registration: Registration,
	token: unknown,
	value: unknown,
): void {
	if (!policy || value === null || (typeof value !== 'object' && typeof value !== 'function')) {
		return;
	}
	let origins = policy.origins.get(value);
	if (!origins) {
		origins = [];
		policy.origins.set(value, origins);
	}
	// 登録の同一性ではなく内容で重ねる。要求ごとに作り直した同じ内容の登録は 1 つの出自になり、
	// 記録は作ったコンテナーの数ではなく、区別できる出自の数で頭打ちになる。
	if (origins.some(origin => sameOrigin(origin, registration, token))) {
		return;
	}
	origins.push(
		Object.freeze({
			description: Object.freeze({
				entrypoint: registration.entrypoint,
				lifetime: registration.lifetime,
				metadata: registration.metadata,
				token,
			}),
			pairs: registration.metadataPairs,
		}),
	);
}

/** beforeReturn が区別できる内容（token、lifetime、entrypoint、属性）がすべて同じかどうか。 */
function sameOrigin(origin: Origin, registration: Registration, token: unknown): boolean {
	const { description } = origin;
	return (
		Object.is(description.token, token) &&
		description.lifetime === registration.lifetime &&
		description.entrypoint === registration.entrypoint &&
		(description.metadata === registration.metadata || samePairs(origin.pairs, registration.metadataPairs))
	);
}

/**
 * 属性のキーの重複は登録時に拒否しているので、同じ数の組がすべて見つかれば同じ内容になる。
 * 組を持たない登録（組を作らない別のビルドが作ったもの）は内容を比べられないので、別の出自として残す。
 */
function samePairs(left: readonly MetadataPair[] | undefined, right: readonly MetadataPair[] | undefined): boolean {
	return (
		left !== undefined &&
		right !== undefined &&
		left.length === right.length &&
		left.every(([key, value]) => right.some(([other, candidate]) => other === key && Object.is(candidate, value)))
	);
}

export function checkReturn(policy: PolicyState | undefined, value: unknown): void {
	if (!policy?.beforeReturn) {
		return;
	}
	let origins: readonly Origin[] = [];
	if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
		origins = policy.origins.get(value) ?? [];
	}
	const event: ReturnEvent = Object.freeze({
		registrations: Object.freeze(origins.map(origin => origin.description)),
	});
	const result: unknown = policy.beforeReturn(event);
	if (result !== undefined) {
		void Promise.resolve(result).catch(() => undefined);
		throw new ContainerError('beforeReturn must return undefined synchronously.');
	}
}
