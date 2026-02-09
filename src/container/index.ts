import { ContainerError } from '../error';
import { type ContainerInternals, INTERNALS } from '../internal';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver';
import { buildCircularPath, tokenToString } from '../resolver';

/**
 * Create a new DI container.
 *
 * Pass an interface as generic T to fix the PropertyKey token type map upfront (order-independent).
 * Class tokens are accumulated via registerSingleton/registerTransient method chaining (order-dependent).
 *
 * @example
 * ```ts
 * interface Services { SampleController: string }
 * const c = createContainer<Services>()
 *   .registerSingleton(TextGenerationService, () => new MastraTextGenerationService())
 *   .registerTransient(GenerateTextUseCase, r => new GenerateTextUseCase(r.resolve(TextGenerationService)));
 * ```
 */
export function createContainer<T = Record<never, never>, ScopedT = Record<never, never>>(): Container<
	T,
	never,
	never,
	ScopedT
> {
	return new Container();
}

/**
 * Lightweight DI container.
 *
 * Provides type inference through method chaining with registerSingleton/registerTransient/resolve.
 *
 * - Singleton: Creates the instance on the first resolve and returns the cached value thereafter.
 * - Transient: Creates a new instance via the factory function on every resolve.
 *
 * Registering the same token multiple times accumulates all factories.
 * `resolve()` returns the last registered instance, while `resolveAll()` returns all.
 *
 * @template T PropertyKey-based token type map (defined via interface, order-independent)
 * @template Sync Union of registered sync class constructors (accumulated via chaining, order-dependent)
 * @template Async Union of registered async class constructors (accumulated via chaining, order-dependent)
 * @template ScopedT PropertyKey-based token type map for scoped registrations
 * @template ScopedSync Union of scoped sync class constructors (accumulated via chaining, order-dependent)
 * @template ScopedAsync Union of scoped async class constructors (accumulated via chaining, order-dependent)
 */
export class Container<
	T = Record<never, never>,
	Sync extends AbstractConstructor = never,
	Async extends AbstractConstructor = never,
	ScopedT = Record<never, never>,
	ScopedSync extends AbstractConstructor = never,
	ScopedAsync extends AbstractConstructor = never,
> {
	private readonly registrations: Map<unknown, Registration[]>;
	private readonly singletonCache: Map<Registration, unknown>;
	private readonly resolvingTokens: Set<unknown>;
	private disposed = false;

	/**
	 * Internal state accessor for extension modules (scope, disposable).
	 *
	 * @internal
	 */
	public readonly [INTERNALS]: ContainerInternals;

	public constructor() {
		this.registrations = new Map();
		this.singletonCache = new Map();
		this.resolvingTokens = new Set();
		this[INTERNALS] = {
			isDisposed: () => this.disposed,
			markDisposed: () => {
				this.disposed = true;
			},
			ownCache: this.singletonCache,
			registrations: this.registrations,
			singletonCache: this.singletonCache,
		};
	}

	/**
	 * Register a factory function as a singleton for the given token.
	 *
	 * Creates the instance on the first resolve and returns the cached value thereafter.
	 * If the same token is registered multiple times, all factories are accumulated.
	 * `resolve()` returns the last registered instance; `resolveAll()` returns all.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance
	 * @returns The container for method chaining
	 */
	public registerSingleton<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => Promise<V>,
	): Container<T, Sync, Async | AbstractConstructor<V>, ScopedT, ScopedSync, ScopedAsync>;
	public registerSingleton<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
	): Container<T, Sync | AbstractConstructor<V>, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerSingleton<K extends PropertyKey, V>(
		token: K,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
	): Container<Record<K, V> & T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerSingleton<V>(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerSingleton(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => unknown,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		return this.addRegistration(token, factory, 'singleton');
	}

	/**
	 * Register a factory function as transient for the given token.
	 *
	 * Creates a new instance via the factory function on every resolve.
	 * If the same token is registered multiple times, all factories are accumulated.
	 * `resolve()` returns the last registered instance; `resolveAll()` returns all.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance
	 * @returns The container for method chaining
	 */
	public registerTransient<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => Promise<V>,
	): Container<T, Sync, Async | AbstractConstructor<V>, ScopedT, ScopedSync, ScopedAsync>;
	public registerTransient<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
	): Container<T, Sync | AbstractConstructor<V>, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerTransient<K extends PropertyKey, V>(
		token: K,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
	): Container<Record<K, V> & T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerTransient<V>(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerTransient(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => unknown,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		return this.addRegistration(token, factory, 'transient');
	}

	/**
	 * Register a factory function as scoped for the given token.
	 *
	 * Within a scope, creates the instance on the first resolve and returns the cached value thereafter.
	 * Each scope maintains its own cache, so different scopes produce different instances.
	 * Scoped tokens cannot be resolved from the root container — use createScope() first.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance
	 * @returns The container for method chaining
	 */
	public registerScoped<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => Promise<V>,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync | AbstractConstructor<V>>;
	public registerScoped<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
	): Container<T, Sync, Async, ScopedT, ScopedSync | AbstractConstructor<V>, ScopedAsync>;
	public registerScoped<K extends PropertyKey, V>(
		token: K,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
	): Container<T, Sync, Async, Record<K, V> & ScopedT, ScopedSync, ScopedAsync>;
	public registerScoped<V>(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
	public registerScoped(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => unknown,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		return this.addRegistration(token, factory, 'scoped');
	}

	/**
	 * Apply all registrations from another container (module) to this container.
	 *
	 * Copies registration entries (factory + lifetime) by replacing existing entries for each token.
	 * Singleton instance caches are not shared — each container manages its own.
	 *
	 * @param source A container whose registrations will be copied into this container
	 * @returns The container for method chaining
	 */
	public use<
		MT,
		MSync extends AbstractConstructor,
		MAsync extends AbstractConstructor,
		MScopedT,
		MScopedSync extends AbstractConstructor,
		MScopedAsync extends AbstractConstructor,
	>(
		source: Container<MT, MSync, MAsync, MScopedT, MScopedSync, MScopedAsync>,
	): Container<
		T & MT,
		Sync | MSync,
		Async | MAsync,
		ScopedT & MScopedT,
		ScopedSync | MScopedSync,
		ScopedAsync | MScopedAsync
	>;
	public use(source: Container): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		for (const [token, registrations] of source[INTERNALS].registrations) {
			this.registrations.set(token, [...registrations]);
		}

		return this;
	}

	/**
	 * Resolve an instance for the given token.
	 *
	 * Returns the instance from the last registered factory for the token.
	 * For singleton registrations, creates the instance on the first call and caches it.
	 * For transient registrations, creates a new instance on every call.
	 *
	 * @param token A registered token
	 * @returns The instance associated with the token
	 * @throws ContainerError if the token is not registered
	 */
	public resolve<V>(token: AbstractConstructor<V> & Async): Promise<V>;
	public resolve<V>(token: AbstractConstructor<V> & Sync): V;
	public resolve<K extends keyof T>(token: K): T[K];
	public resolve(token: unknown): unknown {
		return this.resolveToken(token, true);
	}

	/**
	 * Try to resolve an instance for the given token.
	 *
	 * Returns `undefined` instead of throwing when the token is not registered.
	 * Other errors (circular dependency, disposed container) are still thrown.
	 *
	 * @param token A token to resolve
	 * @returns The instance associated with the token, or `undefined` if not registered
	 */
	public tryResolve<V>(token: AbstractConstructor<V> & Async): Promise<V> | undefined;
	public tryResolve<V>(token: AbstractConstructor<V> & Sync): V | undefined;
	public tryResolve<K extends keyof T>(token: K): T[K] | undefined;
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
	public resolveAll<V>(token: AbstractConstructor<V> & Async): Promise<V>[];
	public resolveAll<V>(token: AbstractConstructor<V> & Sync): V[];
	public resolveAll<K extends keyof T>(token: K): T[K][];
	public resolveAll(token: unknown): unknown[] {
		return this.resolveAllTokens(token, true) as unknown[];
	}

	/**
	 * Try to resolve all instances for the given token.
	 *
	 * Returns `undefined` instead of throwing when the token is not registered.
	 * Other errors (circular dependency, disposed container) are still thrown.
	 *
	 * @param token A token to resolve
	 * @returns An array of instances associated with the token, or `undefined` if not registered
	 */
	public tryResolveAll<V>(token: AbstractConstructor<V> & Async): Promise<V>[] | undefined;
	public tryResolveAll<V>(token: AbstractConstructor<V> & Sync): V[] | undefined;
	public tryResolveAll<K extends keyof T>(token: K): T[K][] | undefined;
	public tryResolveAll<V>(token: AbstractConstructor<V>): (V | Promise<V>)[] | undefined;
	public tryResolveAll(token: PropertyKey): unknown;
	public tryResolveAll(token: unknown): unknown {
		return this.resolveAllTokens(token, false);
	}

	/**
	 * Internal resolution logic shared by resolve and tryResolve.
	 * Resolves the last registered factory for the token.
	 *
	 * @param token Token to resolve
	 * @param required If true, throws when the token is not registered. If false, returns undefined.
	 * @returns The resolved instance, or undefined if not registered and required is false
	 */
	private resolveToken(token: unknown, required: boolean): unknown {
		if (this.disposed) {
			throw new ContainerError('Cannot resolve from a disposed container.');
		}

		const registrations = this.registrations.get(token);

		if (registrations === undefined || registrations.length === 0) {
			if (required) {
				throw new ContainerError(`Token "${tokenToString(token)}" is not registered.`);
			}

			return undefined;
		}

		const registration = registrations[registrations.length - 1] as {
			readonly factory: (resolver: Resolver<T, Sync, Async>) => unknown;
			readonly lifetime: Lifetime;
		};

		const cached = this.singletonCache.get(registration);

		if (cached !== undefined) {
			return cached;
		}

		if (registration.lifetime === 'scoped') {
			throw new ContainerError(
				`Cannot resolve scoped token "${tokenToString(
					token,
				)}" from the root container. Use createScope() to create a scope first.`,
			);
		}

		if (this.resolvingTokens.has(token)) {
			throw new ContainerError(`Circular dependency detected: ${buildCircularPath(this.resolvingTokens, token)}`);
		}

		this.resolvingTokens.add(token);

		try {
			const instance = registration.factory(this as unknown as Resolver<T, Sync, Async>);

			if (registration.lifetime === 'singleton') {
				this.singletonCache.set(registration, instance);
			}

			return instance;
		} finally {
			this.resolvingTokens.delete(token);
		}
	}

	/**
	 * Internal resolution logic shared by resolveAll and tryResolveAll.
	 * Resolves all registered factories for the token.
	 *
	 * @param token Token to resolve
	 * @param required If true, throws when the token is not registered. If false, returns undefined.
	 * @returns An array of resolved instances, or undefined if not registered and required is false
	 */
	private resolveAllTokens(token: unknown, required: boolean): unknown[] | undefined {
		if (this.disposed) {
			throw new ContainerError('Cannot resolve from a disposed container.');
		}

		const registrations = this.registrations.get(token);

		if (registrations === undefined || registrations.length === 0) {
			if (required) {
				throw new ContainerError(`Token "${tokenToString(token)}" is not registered.`);
			}

			return undefined;
		}

		if (this.resolvingTokens.has(token)) {
			throw new ContainerError(`Circular dependency detected: ${buildCircularPath(this.resolvingTokens, token)}`);
		}

		this.resolvingTokens.add(token);

		try {
			return registrations.map(registration => {
				const reg = registration as {
					readonly factory: (resolver: Resolver<T, Sync, Async>) => unknown;
					readonly lifetime: Lifetime;
				};

				const cached = this.singletonCache.get(registration);

				if (cached !== undefined) {
					return cached;
				}

				if (reg.lifetime === 'scoped') {
					throw new ContainerError(
						`Cannot resolve scoped token "${tokenToString(
							token,
						)}" from the root container. Use createScope() to create a scope first.`,
					);
				}

				const instance = reg.factory(this as unknown as Resolver<T, Sync, Async>);

				if (reg.lifetime === 'singleton') {
					this.singletonCache.set(registration, instance);
				}

				return instance;
			});
		} finally {
			this.resolvingTokens.delete(token);
		}
	}

	/**
	 * Add a registration entry. Accumulates registrations for the same token.
	 *
	 * @param token Token
	 * @param factory Factory function
	 * @param lifetime Lifetime of the registration
	 * @returns The container for method chaining
	 */
	private addRegistration(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => unknown,
		lifetime: Lifetime,
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		const existing = this.registrations.get(token);

		if (existing !== undefined) {
			existing.push({ factory, lifetime } as Registration);
		} else {
			this.registrations.set(token, [{ factory, lifetime } as Registration]);
		}

		return this;
	}
}
