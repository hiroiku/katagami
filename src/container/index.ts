import { type ContainerInternals, INTERNALS } from '../internal';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver';

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
 * Lightweight DI container — registration only.
 *
 * Provides type inference through method chaining with registerSingleton/registerTransient/registerScoped.
 * Resolution is performed through a Scope created via `createScope(container)`.
 *
 * Registering the same token multiple times accumulates all factories.
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
