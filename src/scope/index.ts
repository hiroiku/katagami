import type { Container } from '../container';
import type { DisposableContainer, DisposableScope } from '../disposable';
import { ContainerError } from '../error';
import { type ContainerInternals, INTERNALS } from '../internal';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver';
import { buildCircularPath, tokenToString } from '../resolver';

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
>(
	source: Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
>(
	source: Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
>(
	source: DisposableContainer<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
export function createScope<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
>(
	source: DisposableScope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
): Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
export function createScope(source: { readonly [INTERNALS]: ContainerInternals }): Scope {
	const internals = source[INTERNALS];

	if (internals.isDisposed()) {
		throw new ContainerError('Cannot create a scope from a disposed container.');
	}

	return new Scope(internals.registrations, internals.instances);
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
> {
	private readonly registrations: Map<unknown, Registration>;
	private readonly singletonInstances: Map<unknown, unknown>;
	private readonly scopedInstances: Map<unknown, unknown>;
	private readonly resolvingTokens: Set<unknown>;
	private disposed = false;

	/**
	 * Internal state accessor for extension modules (scope, disposable).
	 *
	 * @internal
	 */
	public readonly [INTERNALS]: ContainerInternals;

	public constructor(registrations: Map<unknown, Registration>, singletonInstances: Map<unknown, unknown>) {
		this.registrations = registrations;
		this.singletonInstances = singletonInstances;
		this.scopedInstances = new Map();
		this.resolvingTokens = new Set();
		this[INTERNALS] = {
			instances: this.singletonInstances,
			isDisposed: () => this.disposed,
			markDisposed: () => {
				this.disposed = true;
			},
			ownInstances: this.scopedInstances,
			registrations: this.registrations,
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
}
