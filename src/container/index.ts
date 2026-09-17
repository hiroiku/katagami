import { type Callable, type EntrypointFactory, isEntrypoint } from '../entrypoint/index.js';
import { ContainerError } from '../error/index.js';
import { type ContainerInternals, INTERNALS, type REGISTRATION_STATE } from '../internal.js';
import {
	type AnyMetadataEntry,
	type AnyMetadataKey,
	type MetadataKeyOf,
	type MetadataReader,
	type RegistrationArguments,
	readMetadata,
	validateMetadataKeys,
} from '../metadata/index.js';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver/index.js';

export type RegisteredTokens<C> = C extends { readonly [REGISTRATION_STATE]: infer S }
	? S extends { readonly untracked: true }
		? never
		: S extends { readonly token: infer K }
			? K
			: never
	: never;

export interface RegistrationState {
	readonly token: unknown;
	readonly metadata: AnyMetadataKey;
	readonly callable: Callable | never;
}
type State<K, E extends readonly AnyMetadataEntry[], F = never> = {
	readonly token: K;
	readonly metadata: MetadataKeyOf<E[number]>;
	readonly callable: F;
};
type Replace<S, K, N> = (unknown extends S ? UntrackedState : Exclude<S, { readonly token: K }>) | N;
type UntrackedState<K = unknown> = {
	readonly token: K;
	readonly metadata: never;
	readonly callable: never;
	readonly untracked: true;
};
type SourceState<S, K> = unknown extends S
	? UntrackedState<K>
	: S extends { readonly untracked: true }
		? UntrackedState<K>
		: S;
type SourceTokens<S, K> = unknown extends S
	? K
	: S extends { readonly untracked: true }
		? K
		: S extends { readonly token: infer Token }
			? Token
			: never;
type Append<S, K, E extends readonly AnyMetadataEntry[], F = never> = unknown extends S
	? [MetadataKeyOf<E[number]> | F] extends [never]
		? unknown
		: UntrackedState | State<K, E, F>
	: Replace<
			S,
			K,
			{
				readonly token: K;
				readonly metadata: [Extract<S, { readonly token: K }>] extends [never]
					? MetadataKeyOf<E[number]>
					: Extract<
							Extract<S, { readonly token: K }> extends { readonly metadata: infer M } ? M : never,
							MetadataKeyOf<E[number]>
						>;
				readonly callable: F;
			}
		>;
type PolicyState<S> = S extends { readonly metadata: infer M; readonly callable: infer F }
	? [M | F] extends [never]
		? never
		: S
	: never;
type Merge<S, K, N> = unknown extends S
	? [PolicyState<N>] extends [never]
		? unknown
		: Replace<S, K, N>
	: Replace<S, K, N>;
type MissingMetadata<R, S> = unknown extends S ? R : S extends { readonly metadata: infer M } ? Exclude<R, M> : never;

/** 必須属性を指定しない既存の生成形式も維持する。 */
export function createContainer<const Required extends readonly AnyMetadataKey[]>(options: {
	readonly requiredMetadata: Required;
}): Container<Record<never, never>, never, never, Record<never, never>, never, never, Required, never>;
export function createContainer<T, ScopedT, const Required extends readonly AnyMetadataKey[]>(options: {
	readonly requiredMetadata: Required;
}): Container<T, never, never, ScopedT, never, never, Required, never>;
export function createContainer<T = Record<never, never>, ScopedT = Record<never, never>>(): Container<
	T,
	never,
	never,
	ScopedT,
	never,
	never,
	readonly [],
	[keyof T | keyof ScopedT] extends [never] ? never : unknown
>;
export function createContainer(options?: {
	readonly requiredMetadata: readonly AnyMetadataKey[];
}): Container<unknown, never, never, unknown, never, never, readonly AnyMetadataKey[]> {
	return new Container(options);
}

/** 通常の factory と lifetime を登録し、属性と公開操作の型をチェーンで保持する。 */
export class Container<
	T = Record<never, never>,
	Sync extends AbstractConstructor = never,
	Async extends AbstractConstructor = never,
	ScopedT = Record<never, never>,
	ScopedSync extends AbstractConstructor = never,
	ScopedAsync extends AbstractConstructor = never,
	Required extends readonly AnyMetadataKey[] = readonly [],
	Registrations = unknown,
> {
	private readonly registrations = new Map<unknown, Registration[]>();
	private readonly singletonCache = new Map<Registration, unknown>();
	private readonly requiredMetadata: readonly AnyMetadataKey[];
	private disposed = false;
	public declare readonly [REGISTRATION_STATE]: Registrations;
	public readonly [INTERNALS]: ContainerInternals & { readonly kind: 'container' };
	public constructor(options?: { readonly requiredMetadata: Required }) {
		this.requiredMetadata = [...(options?.requiredMetadata ?? [])];
		validateMetadataKeys(this.requiredMetadata);
		this[INTERNALS] = {
			beforeResolve: [],
			isDisposed: () => this.disposed,
			kind: 'container',
			markDisposed: () => {
				this.disposed = true;
			},
			ownCache: this.singletonCache,
			registrations: this.registrations,
			singletonCache: this.singletonCache,
		};
	}
	/** 同じ container で共有する依存を登録する。要求に依存する処理は scoped にする。 */
	public registerSingleton<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: ((resolver: Resolver<T, Sync, Async>) => F) & EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, F> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerSingleton<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, Promise<F>> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerSingleton<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => Promise<V>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async | AbstractConstructor<V>,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerSingleton<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync | AbstractConstructor<V>,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerSingleton<K extends PropertyKey, V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: K,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<Record<K, V> & T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Append<Registrations, K, E>>;
	public registerSingleton<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations | State<unknown, E>>;
	public registerSingleton(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => unknown,
		...options: readonly [{ readonly metadata?: readonly AnyMetadataEntry[] }?]
	): unknown {
		return this.addRegistration(token, factory as Registration['factory'], 'singleton', options[0]?.metadata ?? []);
	}
	/** 解決のたびに生成する依存を登録する。 */
	public registerTransient<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: ((resolver: Resolver<T, Sync, Async>) => F) & EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, F> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerTransient<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, Promise<F>> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerTransient<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => Promise<V>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async | AbstractConstructor<V>,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerTransient<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync | AbstractConstructor<V>,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerTransient<K extends PropertyKey, V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: K,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<Record<K, V> & T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Append<Registrations, K, E>>;
	public registerTransient<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations | State<unknown, E>>;
	public registerTransient(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => unknown,
		...options: readonly [{ readonly metadata?: readonly AnyMetadataEntry[] }?]
	): unknown {
		return this.addRegistration(token, factory as Registration['factory'], 'transient', options[0]?.metadata ?? []);
	}
	/** 同じ scope 内で共有する依存を登録する。 */
	public registerScoped<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: ((resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => F) &
			EntrypointFactory<Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		Record<K, F> & ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerScoped<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: EntrypointFactory<Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		Record<K, Promise<F>> & ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerScoped<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => Promise<V>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync | AbstractConstructor<V>,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerScoped<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		ScopedT,
		ScopedSync | AbstractConstructor<V>,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerScoped<K extends PropertyKey, V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: K,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, Record<K, V> & ScopedT, ScopedSync, ScopedAsync, Required, Append<Registrations, K, E>>;
	public registerScoped<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations | State<unknown, E>>;
	public registerScoped(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => unknown,
		...options: readonly [{ readonly metadata?: readonly AnyMetadataEntry[] }?]
	): unknown {
		return this.addRegistration(token, factory as Registration['factory'], 'scoped', options[0]?.metadata ?? []);
	}

	/** 登録済みの最後の属性だけを読み、factory は実行しない。 */
	public getMetadata<V>(token: AbstractConstructor<V> & (Sync | Async | ScopedSync | ScopedAsync)): MetadataReader;
	public getMetadata<K extends keyof (T & ScopedT)>(token: K): MetadataReader;
	public getMetadata(token: unknown): MetadataReader {
		const entries = this.registrations.get(token);
		if (!entries?.length) {
			throw new ContainerError('Token is not registered.');
		}
		return (entries[entries.length - 1] as Registration).metadata;
	}

	/** 属性を全件検証してから、トークンごとに登録と公開性を置き換える。 */
	public use<
		MT,
		MS extends AbstractConstructor,
		MA extends AbstractConstructor,
		MST,
		MSS extends AbstractConstructor,
		MSA extends AbstractConstructor,
		MR extends readonly AnyMetadataKey[],
		State,
	>(
		source: Container<MT, MS, MA, MST, MSS, MSA, MR, State> &
			([MissingMetadata<Required[number], State>] extends [never]
				? unknown
				: { readonly missingRequiredMetadata: never }),
	): Container<
		T & MT,
		Sync | MS,
		Async | MA,
		ScopedT & MST,
		ScopedSync | MSS,
		ScopedAsync | MSA,
		Required,
		Merge<
			Registrations,
			SourceTokens<State, keyof MT | keyof MST | MS | MA | MSS | MSA>,
			SourceState<State, keyof MT | keyof MST | MS | MA | MSS | MSA>
		>
	>;
	public use(source: { readonly [INTERNALS]: ContainerInternals }): unknown {
		if (this.disposed) {
			throw new ContainerError('Cannot register on a disposed container.');
		}
		for (const registrations of source[INTERNALS].registrations.values()) {
			for (const registration of registrations) {
				for (const key of this.requiredMetadata) {
					if (!registration.metadata.has(key)) {
						throw new ContainerError('Required metadata is missing.');
					}
				}
			}
		}
		for (const [token, registrations] of source[INTERNALS].registrations) {
			this.registrations.set(token, [...registrations]);
		}
		return this;
	}
	private addRegistration(
		token: unknown,
		factory: Registration['factory'],
		lifetime: Lifetime,
		entries: readonly AnyMetadataEntry[],
	): this {
		if (this.disposed) {
			throw new ContainerError('Cannot register on a disposed container.');
		}
		const metadata = readMetadata(entries, this.requiredMetadata);
		const registration: Registration = Object.freeze({
			entrypoint: isEntrypoint(factory),
			factory,
			lifetime,
			metadata,
		});
		const existing = this.registrations.get(token);
		if (existing) {
			existing.push(registration);
		} else {
			this.registrations.set(token, [registration]);
		}
		return this;
	}
}
