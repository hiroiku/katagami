import { ContainerError } from '../error';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver';
import { buildCircularPath, tokenToString } from '../resolver';

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
> implements AsyncDisposable
{
	private readonly registrations: Map<unknown, Registration>;
	private readonly singletonInstances: Map<unknown, unknown>;
	private readonly scopedInstances: Map<unknown, unknown>;
	private readonly resolvingTokens: Set<unknown>;
	private disposed = false;

	public constructor(registrations: Map<unknown, Registration>, singletonInstances: Map<unknown, unknown>) {
		this.registrations = registrations;
		this.singletonInstances = singletonInstances;
		this.scopedInstances = new Map();
		this.resolvingTokens = new Set();
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
	 * Internal resolution logic shared by resolve and tryResolve.
	 *
	 * @param token Token to resolve
	 * @param required If true, throws when the token is not registered. If false, returns undefined.
	 * @returns The resolved instance, or undefined if not registered and required is false
	 */
	private resolveToken(token: unknown, required: boolean): unknown {
		if (this.disposed) {
			throw new ContainerError('Cannot resolve from a disposed scope.');
		}

		const singletonCached = this.singletonInstances.get(token);

		if (singletonCached !== undefined) {
			return singletonCached;
		}

		const scopedCached = this.scopedInstances.get(token);

		if (scopedCached !== undefined) {
			return scopedCached;
		}

		const registration = this.registrations.get(token) as
			| {
					readonly factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => unknown;
					readonly lifetime: Lifetime;
			  }
			| undefined;

		if (registration === undefined) {
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
			const instance = registration.factory(
				this as unknown as Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>,
			);

			if (registration.lifetime === 'singleton') {
				this.singletonInstances.set(token, instance);
			} else if (registration.lifetime === 'scoped') {
				this.scopedInstances.set(token, instance);
			}

			return instance;
		} finally {
			this.resolvingTokens.delete(token);
		}
	}

	/**
	 * Create a nested scope.
	 *
	 * The nested scope shares singleton instances with the parent but has its own scoped instance cache.
	 *
	 * @returns A new Scope instance
	 * @throws ContainerError if the scope has been disposed
	 */
	public createScope(): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync> {
		if (this.disposed) {
			throw new ContainerError('Cannot create a scope from a disposed scope.');
		}

		return new Scope(this.registrations, this.singletonInstances);
	}

	/**
	 * Dispose all scoped instances managed by this scope.
	 *
	 * Iterates through scoped instances in reverse creation order (LIFO) and calls
	 * `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` on each instance that implements them.
	 * Singleton instances are not disposed as they are owned by the parent container.
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

		const instances = [...this.scopedInstances.values()].reverse();
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

		this.scopedInstances.clear();

		if (errors.length > 0) {
			throw new AggregateError(errors, 'One or more errors occurred during disposal.');
		}
	}
}
