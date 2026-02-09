import { ContainerError } from '../error';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver';
import { buildCircularPath, tokenToString } from '../resolver';
import { Scope } from '../scope';

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
> implements AsyncDisposable
{
	private readonly registrations: Map<unknown, Registration>;
	private readonly instances: Map<unknown, unknown>;
	private readonly resolvingTokens: Set<unknown>;
	private disposed = false;

	public constructor() {
		this.registrations = new Map();
		this.instances = new Map();
		this.resolvingTokens = new Set();
	}

	/**
	 * Register a factory function as a singleton for the given token.
	 *
	 * Creates the instance on the first resolve and returns the cached value thereafter.
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
	 * Create a new scope (child container).
	 *
	 * The scope inherits all registrations from this container.
	 * Singleton instances are shared with the parent, while scoped instances are local to the scope.
	 *
	 * @returns A new Scope instance
	 * @throws ContainerError if the container has been disposed
	 */
	public createScope(): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		if (this.disposed) {
			throw new ContainerError('Cannot create a scope from a disposed container.');
		}

		return new Scope(this.registrations, this.instances);
	}

	/**
	 * Resolve an instance for the given token.
	 *
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
	 * Internal resolution logic shared by resolve and tryResolve.
	 *
	 * @param token Token to resolve
	 * @param required If true, throws when the token is not registered. If false, returns undefined.
	 * @returns The resolved instance, or undefined if not registered and required is false
	 */
	private resolveToken(token: unknown, required: boolean): unknown {
		if (this.disposed) {
			throw new ContainerError('Cannot resolve from a disposed container.');
		}

		const cached = this.instances.get(token);

		if (cached !== undefined) {
			return cached;
		}

		const registration = this.registrations.get(token) as
			| { readonly factory: (resolver: Resolver<T, Sync, Async>) => unknown; readonly lifetime: Lifetime }
			| undefined;

		if (registration === undefined) {
			if (required) {
				throw new ContainerError(`Token "${tokenToString(token)}" is not registered.`);
			}

			return undefined;
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
				this.instances.set(token, instance);
			}

			return instance;
		} finally {
			this.resolvingTokens.delete(token);
		}
	}

	/**
	 * Dispose all singleton instances managed by this container.
	 *
	 * Iterates through singleton instances in reverse creation order (LIFO) and calls
	 * `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` on each instance that implements them.
	 *
	 * This method is idempotent — subsequent calls after the first are no-ops.
	 * After disposal, `resolve()` and `createScope()` will throw `ContainerError`.
	 *
	 * @throws AggregateError if one or more instances throw during disposal
	 */
	public async [Symbol.asyncDispose](): Promise<void> {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		const instances = [...this.instances.values()].reverse();
		const errors: unknown[] = [];

		for (const instance of instances) {
			try {
				let resolved: unknown = instance;

				if (instance instanceof Promise) {
					resolved = await instance;
				}

				if (resolved != null && typeof resolved === 'object') {
					if (Symbol.asyncDispose in resolved) {
						await (resolved as AsyncDisposable)[Symbol.asyncDispose]();
					} else if (Symbol.dispose in resolved) {
						(resolved as Disposable)[Symbol.dispose]();
					}
				}
			} catch (error) {
				errors.push(error);
			}
		}

		this.instances.clear();

		if (errors.length > 0) {
			throw new AggregateError(errors, 'One or more errors occurred during disposal.');
		}
	}

	/**
	 * Add a registration entry.
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
		this.registrations.set(token, { factory, lifetime } as Registration);

		return this;
	}
}
