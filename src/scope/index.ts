import type { Container } from '../container/index.js';
import type { DisposableContainer, DisposableScope } from '../disposable/index.js';
import { ContainerError } from '../error/index.js';
// biome-ignore lint/correctness/noUnusedImports: declare の computed property に必要な型専用キー。
import type { REGISTRATION_STATE } from '../internal.js';
import { type ContainerInternals, INTERNALS } from '../internal.js';
import type { AnyMetadataKey, MetadataReader } from '../metadata/index.js';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver/index.js';
import { buildCircularPath, tokenToString } from '../resolver/index.js';

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
}

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
export function createScope(source: { readonly [INTERNALS]: ContainerInternals }, options?: ScopeOptions): Scope {
	const internals = source[INTERNALS];

	if (internals.isDisposed()) {
		throw new ContainerError('Cannot create a scope from a disposed container.');
	}

	const hooks = [...internals.beforeResolve];
	if (options?.beforeResolve) {
		hooks.push(options.beforeResolve);
	}
	return new Scope(internals.registrations, internals.singletonCache, hooks);
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
	private disposed = false;

	/**
	 * Internal state accessor for extension modules (scope, disposable).
	 *
	 * @internal
	 */
	public declare readonly [REGISTRATION_STATE]: Registrations;
	public readonly [INTERNALS]: ContainerInternals & { readonly kind: 'scope' };

	public constructor(
		registrations: Map<unknown, Registration[]>,
		singletonCache: Map<Registration, unknown>,
		beforeResolve: readonly BeforeResolve[] = [],
	) {
		this.registrations = registrations;
		this.singletonCache = singletonCache;
		this.scopedCache = new Map();
		this.beforeResolve = beforeResolve;
		this[INTERNALS] = {
			beforeResolve: this.beforeResolve,
			isDisposed: () => this.disposed,
			kind: 'scope',
			markDisposed: () => {
				this.disposed = true;
			},
			ownCache: this.scopedCache,
			registrations: this.registrations,
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
		return this.resolveToken(token, true);
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
		return this.resolveToken(token, false);
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
		return this.resolveAllTokens(token, true) as unknown[];
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
		return this.resolveAllTokens(token, false);
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
		return this.instantiate(token, registration, context);
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
		return registrations.map(registration => this.instantiate(token, registration, context));
	}
	private instantiate(token: unknown, registration: Registration, context: ResolutionContext): unknown {
		if (registration.lifetime === 'scoped' && context.singleton) {
			throw new ContainerError(
				`Captive dependency detected: scoped token "${tokenToString(token)}" cannot be resolved inside a singleton factory. Scoped instances must not be captured by singletons.`,
			);
		}
		let cache = this.scopedCache;
		if (registration.lifetime === 'singleton') {
			cache = this.singletonCache;
		}
		if (registration.lifetime !== 'transient' && cache.get(registration) !== undefined) {
			return cache.get(registration);
		}
		const construction = context.construction ?? [];
		const activeTokens = new Set(construction.filter(frame => frame.active).map(frame => frame.token));
		if (activeTokens.has(token)) {
			throw new ContainerError(`Circular dependency detected: ${buildCircularPath(activeTokens, token)}`);
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
		try {
			const instance = registration.factory(resolver as Resolver<never, never>);
			if (instance instanceof Promise) {
				void instance.then(
					() => {
						frame.active = false;
					},
					() => {
						frame.active = false;
					},
				);
				pending = true;
			}
			if (registration.lifetime !== 'transient') {
				cache.set(registration, instance);
			}
			return instance;
		} finally {
			if (!pending) {
				frame.active = false;
			}
		}
	}
}
