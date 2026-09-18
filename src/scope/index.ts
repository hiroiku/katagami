import type { Container } from '../container/index.js';
import { checkReturn, observe, type PolicyState } from '../container/policy.js';
import type { DisposableContainer, DisposableScope } from '../disposable/index.js';
import { ContainerError } from '../error/index.js';
import type { REGISTRATION_STATE, RunningFactory } from '../internal.js';
import {
	type ContainerInternals,
	constructing,
	creations,
	INTERNALS,
	type ScopeInternals,
	settle,
} from '../internal.js';
import type { AnyMetadataKey, MetadataReader } from '../metadata/index.js';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver/index.js';
import { buildCircularPath, tokenToString } from '../resolver/index.js';
import { type OperationsScope, type OperationsScopeOptions, operations } from './operations.js';

export interface RegistrationDescription {
	readonly token: unknown;
	readonly lifetime: Lifetime;
	readonly metadata: MetadataReader;
	readonly entrypoint: boolean;
}
export interface ResolutionEvent extends RegistrationDescription {
	readonly requester: RegistrationDescription | undefined;
	readonly path: readonly unknown[];
}
export type BeforeResolve = (event: ResolutionEvent) => void;
export interface ScopeOptions {
	readonly access?: never;
	readonly beforeResolve?: BeforeResolve;
}
interface ConstructionFrame {
	readonly token: unknown;
	active: boolean;
}
interface ResolutionContext {
	readonly construction?: readonly ConstructionFrame[];
	readonly path: readonly unknown[];
	readonly singleton: boolean;
	readonly requester?: RegistrationDescription;
	/** この面から外へ出る解決。factory が要求した解決では立てない。 */
	readonly exposed?: boolean;
}
/** 公開した解決メソッドの入口。ここから始まる解決だけが結果を外へ渡す。 */
const EXPOSED: ResolutionContext = Object.freeze({ exposed: true, path: Object.freeze([]), singleton: false });

/**
 * Create a new scope (child container) from a Container, Scope, or their disposable variants.
 *
 * The scope inherits all registrations from the source.
 * Singleton instances are shared with the parent, while scoped instances are local to the scope.
 *
 * @param source A Container, Scope, DisposableContainer, or DisposableScope to create a child scope from
 * @returns A new Scope instance
 * @throws ContainerError if the source has been disposed
 */
export function createScope<
	C extends {
		readonly [INTERNALS]: ContainerInternals;
		readonly [REGISTRATION_STATE]: unknown;
	},
>(source: C, options: OperationsScopeOptions): OperationsScope<C[typeof REGISTRATION_STATE]>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	Required extends readonly AnyMetadataKey[],
	Registrations,
>(
	source: Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations>,
	options?: ScopeOptions,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	Registrations,
>(
	source: Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>,
	options?: ScopeOptions,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	Required extends readonly AnyMetadataKey[],
	Registrations,
>(
	source: DisposableContainer<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations>,
	options?: ScopeOptions,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	Registrations,
>(
	source: DisposableScope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>,
	options?: ScopeOptions,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>;
export function createScope(
	source: { readonly [INTERNALS]: ContainerInternals },
	options?: ScopeOptions | OperationsScopeOptions,
): Scope | OperationsScope<unknown> {
	const access = options?.access;
	// 書き間違えた面の指定を、検査の少ない通常の scope として通さない。
	if (access !== undefined && access !== 'operations') {
		throw new ContainerError("Unknown scope access. Omit access or use 'operations'.");
	}
	const internals = source[INTERNALS];

	if (internals.isDisposed()) {
		throw new ContainerError('Cannot create a scope from a disposed container.');
	}

	const hooks = [...internals.beforeResolve];
	if (options?.beforeResolve) {
		hooks.push(options.beforeResolve);
	}
	const scope = new Scope(internals.registrations, internals.singletonCache, hooks, internals.policy);
	if (access === 'operations') {
		return operations(scope);
	}
	return scope;
}

/**
 * Scoped child container.
 *
 * Inherits all registrations from the parent container.
 * Singleton instances are shared with the parent, while scoped instances are local to this scope.
 * Transient instances are always newly created.
 *
 * @template T PropertyKey-based token type map
 * @template Sync Union of registered sync class constructors
 * @template Async Union of registered async class constructors
 * @template ScopedT PropertyKey-based token type map for scoped registrations
 * @template ScopedSync Union of scoped sync class constructors
 * @template ScopedAsync Union of scoped async class constructors
 */
export class Scope<
	T = Record<never, never>,
	Sync extends AbstractConstructor = never,
	Async extends AbstractConstructor = never,
	ScopedT = Record<never, never>,
	ScopedSync extends AbstractConstructor = never,
	ScopedAsync extends AbstractConstructor = never,
	Registrations = unknown,
> {
	private readonly registrations: Map<unknown, Registration[]>;
	private readonly singletonCache: Map<Registration, unknown>;
	private readonly scopedCache: Map<Registration, unknown>;
	private readonly beforeResolve: readonly BeforeResolve[];
	private readonly policy: PolicyState | undefined;
	private disposed = false;

	/**
	 * Internal state accessor for extension modules (scope, disposable).
	 *
	 * @internal
	 */
	public declare readonly [REGISTRATION_STATE]: Registrations;
	public readonly [INTERNALS]: ScopeInternals;

	public constructor(
		registrations: Map<unknown, Registration[]>,
		singletonCache: Map<Registration, unknown>,
		beforeResolve: readonly BeforeResolve[] = [],
		policy?: PolicyState,
	) {
		this.registrations = registrations;
		this.singletonCache = singletonCache;
		this.scopedCache = new Map();
		this.beforeResolve = beforeResolve;
		this.policy = policy;
		this[INTERNALS] = {
			beforeResolve: this.beforeResolve,
			isDisposed: () => this.disposed,
			kind: 'scope',
			markDisposed: () => {
				this.disposed = true;
			},
			ownCache: this.scopedCache,
			policy: this.policy,
			registrations: this.registrations,
			resolveInternal: (token: unknown) => this.resolveToken(token, true),
			singletonCache: this.singletonCache,
		};
	}

	/**
	 * Resolve an instance for the given token.
	 *
	 * - Singleton: Returns the shared instance from the parent container (creates and caches on first access).
	 * - Scoped: Returns an instance local to this scope (creates and caches on first access within the scope).
	 * - Transient: Creates a new instance on every call.
	 *
	 * @param token A registered token
	 * @returns The instance associated with the token
	 * @throws ContainerError if the token is not registered
	 */
	public resolve<V>(token: AbstractConstructor<V> & (Async | ScopedAsync)): Promise<V>;
	public resolve<V>(token: AbstractConstructor<V> & (Sync | ScopedSync)): V;
	public resolve<K extends keyof (T & ScopedT)>(token: K): (T & ScopedT)[K];
	public resolve(token: unknown): unknown {
		return this.resolveToken(token, true, this.entry());
	}

	/**
	 * Try to resolve an instance for the given token.
	 *
	 * Returns `undefined` instead of throwing when the token is not registered.
	 * Other errors (circular dependency, disposed scope) are still thrown.
	 *
	 * @param token A token to resolve
	 * @returns The instance associated with the token, or `undefined` if not registered
	 */
	public tryResolve<V>(token: AbstractConstructor<V> & (Async | ScopedAsync)): Promise<V> | undefined;
	public tryResolve<V>(token: AbstractConstructor<V> & (Sync | ScopedSync)): V | undefined;
	public tryResolve<K extends keyof (T & ScopedT)>(token: K): (T & ScopedT)[K] | undefined;
	public tryResolve<V>(token: AbstractConstructor<V>): V | Promise<V> | undefined;
	public tryResolve(token: PropertyKey): unknown;
	public tryResolve(token: unknown): unknown {
		return this.resolveToken(token, false, this.entry());
	}

	/**
	 * Resolve all instances for the given token.
	 *
	 * Returns an array of instances from all registered factories for the token,
	 * in registration order.
	 *
	 * @param token A registered token
	 * @returns An array of instances associated with the token
	 * @throws ContainerError if the token is not registered
	 */
	public resolveAll<V>(token: AbstractConstructor<V> & (Async | ScopedAsync)): Promise<V>[];
	public resolveAll<V>(token: AbstractConstructor<V> & (Sync | ScopedSync)): V[];
	public resolveAll<K extends keyof (T & ScopedT)>(token: K): (T & ScopedT)[K][];
	public resolveAll(token: unknown): unknown[] {
		return this.resolveAllTokens(token, true, this.entry()) as unknown[];
	}

	/**
	 * Try to resolve all instances for the given token.
	 *
	 * Returns `undefined` instead of throwing when the token is not registered.
	 * Other errors (circular dependency, disposed scope) are still thrown.
	 *
	 * @param token A token to resolve
	 * @returns An array of instances associated with the token, or `undefined` if not registered
	 */
	public tryResolveAll<V>(token: AbstractConstructor<V> & (Async | ScopedAsync)): Promise<V>[] | undefined;
	public tryResolveAll<V>(token: AbstractConstructor<V> & (Sync | ScopedSync)): V[] | undefined;
	public tryResolveAll<K extends keyof (T & ScopedT)>(token: K): (T & ScopedT)[K][] | undefined;
	public tryResolveAll<V>(token: AbstractConstructor<V>): (V | Promise<V>)[] | undefined;
	public tryResolveAll(token: PropertyKey): unknown;
	public tryResolveAll(token: unknown): unknown {
		return this.resolveAllTokens(token, false, this.entry());
	}

	/** The context of a call through a public method: the running factory's, or the outside of this scope. */
	private entry(): ResolutionContext {
		const running = constructing.at(-1);
		// A factory that calls the scope building it, instead of its resolver, still resolves inside its own
		// construction, so lifetime and cycle checks apply to it as well. A call that arrives through another
		// scope comes from outside.
		if (running?.scope === this) {
			return running.context as ResolutionContext;
		}
		return EXPOSED;
	}
	private describe(token: unknown, registration: Registration): RegistrationDescription {
		return Object.freeze({
			entrypoint: registration.entrypoint,
			lifetime: registration.lifetime,
			metadata: registration.metadata,
			token,
		});
	}
	private check(token: unknown, registration: Registration, context: ResolutionContext): void {
		if (this.beforeResolve.length === 0) {
			return;
		}
		const event = Object.freeze({
			...this.describe(token, registration),
			path: Object.freeze([...context.path, token]),
			requester: context.requester,
		});
		for (const hook of this.beforeResolve) {
			const result: unknown = hook(event);
			if (result !== undefined) {
				void Promise.resolve(result).catch(() => undefined);
				throw new ContainerError('beforeResolve must return undefined synchronously.');
			}
		}
	}
	private lookup(token: unknown, required: boolean): Registration[] | undefined {
		if (this.disposed) {
			throw new ContainerError('Cannot resolve from a disposed scope.');
		}
		const registrations = this.registrations.get(token);
		if (!registrations?.length) {
			if (required) {
				throw new ContainerError(`Token "${tokenToString(token)}" is not registered.`);
			}
			return undefined;
		}
		return registrations;
	}
	/** Create a value that may leave this scope; a synchronous value passes the policy's return check here. */
	private create(token: unknown, registration: Registration, context: ResolutionContext): unknown {
		const instance = this.instantiate(token, registration, context);
		if (context.exposed && !(instance instanceof Promise)) {
			checkReturn(this.policy, instance);
		}
		return instance;
	}
	/**
	 * Shape a created value for the caller.
	 *
	 * The return check runs on every resolution, so under a policy with a return check, an asynchronous
	 * creation leaving the scope is handed out as a per-call Promise that checks the resolved value. No
	 * listener is attached to a Promise already handed out. The per-call Promise is built only after every
	 * synchronous failure is ruled out, so no Promise is left without a receiver.
	 */
	private handOut(value: unknown, context: ResolutionContext): unknown {
		if (!context.exposed || !this.policy?.beforeReturn || !(value instanceof Promise)) {
			return value;
		}
		return value.then(resolved => {
			checkReturn(this.policy, resolved);
			return resolved;
		});
	}
	private resolveToken(
		token: unknown,
		required: boolean,
		context: ResolutionContext = { path: [], singleton: false },
	): unknown {
		const registrations = this.lookup(token, required);
		if (!registrations) {
			return undefined;
		}
		const registration = registrations[registrations.length - 1] as Registration;
		this.check(token, registration, context);
		return this.handOut(this.create(token, registration, context), context);
	}
	private resolveAllTokens(
		token: unknown,
		required: boolean,
		context: ResolutionContext = { path: [], singleton: false },
	): unknown[] | undefined {
		const registrations = this.lookup(token, required);
		if (!registrations) {
			return undefined;
		}
		for (const registration of registrations) {
			this.check(token, registration, context);
		}
		// すべての要素を生成して同期の検査を終えてから、呼び出し元へ渡す Promise を作る。
		const created = registrations.map(registration => this.create(token, registration, context));
		return created.map(value => this.handOut(value, context));
	}
	private instantiate(token: unknown, registration: Registration, context: ResolutionContext): unknown {
		if (registration.lifetime === 'scoped' && context.singleton) {
			throw new ContainerError(
				`Captive dependency detected: scoped token "${tokenToString(token)}" cannot be resolved inside a singleton factory. Scoped instances must not be captured by singletons.`,
			);
		}
		const construction = context.construction ?? [];
		// Only the unbroken run of unfinished constructions ending at the requester is waiting on this
		// resolution. A finished dependency's stored resolver serves later callers, not its ancestors.
		let waiting = construction.length;
		while (waiting > 0 && construction[waiting - 1]?.active) {
			waiting--;
		}
		// A pending creation in that run is the one being built: waiting for it would never settle, so the
		// cycle is reported before the cache is consulted.
		if (construction.slice(waiting).some(frame => frame.token === token)) {
			const chain = new Set(construction.slice(waiting).map(frame => frame.token));
			throw new ContainerError(`Circular dependency detected: ${buildCircularPath(chain, token)}`);
		}
		let cache = this.scopedCache;
		if (registration.lifetime === 'singleton') {
			cache = this.singletonCache;
		}
		if (registration.lifetime !== 'transient' && cache.get(registration) !== undefined) {
			const cached = cache.get(registration);
			if (!(cached instanceof Promise)) {
				observe(this.policy, registration, token, cached);
			}
			return cached;
		}
		// A factory still running synchronously is always waiting, whichever resolver or scope the call came
		// through; a singleton is shared by every scope of its container, but not by containers that copied
		// the same registration with use().
		const shares = (entry: RunningFactory) =>
			entry.scope === this ||
			(registration.lifetime === 'singleton' &&
				entry.registration === registration &&
				entry.singletons === this.singletonCache);
		if (constructing.some(entry => entry.token === token && shares(entry))) {
			const chain = new Set(constructing.filter(shares).map(entry => entry.token));
			throw new ContainerError(`Circular dependency detected: ${buildCircularPath(chain, token)}`);
		}
		const frame: ConstructionFrame = { active: true, token };
		const childContext: ResolutionContext = {
			construction: [...construction, frame],
			path: [...context.path, token],
			requester: this.describe(token, registration),
			singleton: context.singleton || registration.lifetime === 'singleton',
		};
		// 呼出元を closure に保持し、await 後の解決でも同じ方針を適用する。
		const resolver = Object.freeze({
			resolve: (target: unknown) => this.resolveToken(target, true, childContext),
			resolveAll: (target: unknown) => this.resolveAllTokens(target, true, childContext),
			tryResolve: (target: unknown) => this.resolveToken(target, false, childContext),
			tryResolveAll: (target: unknown) => this.resolveAllTokens(target, false, childContext),
		});
		let pending = false;
		constructing.push({ context: childContext, registration, scope: this, singletons: this.singletonCache, token });
		try {
			const instance = registration.factory(resolver as Resolver<never, never>);
			// 通常の thenable は依存実体として返し、解決のために購読を始めない。
			if (instance instanceof Promise) {
				pending = true;
				// 記帳は自分が作った chain の内側で済ませ、呼び出し元へ渡す Promise には listener を付けない。
				// 失敗はそのまま外へ伝え、捨てられた失敗は処理系の既定どおり現れる。
				const tracked = instance.then(
					value => {
						observe(this.policy, registration, token, value);
						frame.active = false;
						return value;
					},
					error => {
						frame.active = false;
						throw error;
					},
				);
				if (registration.lifetime !== 'transient') {
					// 破棄が閉じる対象を知るための記帳。破棄は呼び出し元へ渡した Promise ではなくこれを待つ。
					creations.set(tracked, settle(instance));
					cache.set(registration, tracked);
				}
				return tracked;
			}
			observe(this.policy, registration, token, instance);
			if (registration.lifetime !== 'transient') {
				cache.set(registration, instance);
			}
			return instance;
		} finally {
			constructing.pop();
			if (!pending) {
				frame.active = false;
			}
		}
	}
}
