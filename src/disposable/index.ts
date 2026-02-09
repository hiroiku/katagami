import type { Container } from '../container';
import { type ContainerInternals, INTERNALS } from '../internal';
import type { AbstractConstructor, Resolver } from '../resolver';
import type { Scope } from '../scope';

/**
 * A container wrapped with `disposable()`.
 *
 * Only `resolve`, `tryResolve`, `resolveAll`, and `tryResolveAll` are available at the type level.
 * Registration methods (`registerSingleton`, `registerTransient`, `registerScoped`, `use`)
 * are excluded, preventing accidental registration on a potentially-disposed container.
 *
 * @template T PropertyKey-based token type map
 * @template Sync Union of registered sync class constructors
 * @template Async Union of registered async class constructors
 * @template ScopedT PropertyKey-based token type map for scoped registrations
 * @template ScopedSync Union of scoped sync class constructors
 * @template ScopedAsync Union of scoped async class constructors
 */
export interface DisposableContainer<
	T = Record<never, never>,
	Sync extends AbstractConstructor = never,
	Async extends AbstractConstructor = never,
	_ScopedT = Record<never, never>,
	_ScopedSync extends AbstractConstructor = never,
	_ScopedAsync extends AbstractConstructor = never,
> extends Resolver<T, Sync, Async>,
		AsyncDisposable {
	readonly [INTERNALS]: ContainerInternals;
}

/**
 * A scope wrapped with `disposable()`.
 *
 * Only `resolve`, `tryResolve`, `resolveAll`, and `tryResolveAll` are available at the type level.
 *
 * @template T PropertyKey-based token type map
 * @template Sync Union of registered sync class constructors
 * @template Async Union of registered async class constructors
 * @template ScopedT PropertyKey-based token type map for scoped registrations
 * @template ScopedSync Union of scoped sync class constructors
 * @template ScopedAsync Union of scoped async class constructors
 */
export interface DisposableScope<
	T = Record<never, never>,
	Sync extends AbstractConstructor = never,
	Async extends AbstractConstructor = never,
	ScopedT = Record<never, never>,
	ScopedSync extends AbstractConstructor = never,
	ScopedAsync extends AbstractConstructor = never,
> extends Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>,
		AsyncDisposable {
	readonly [INTERNALS]: ContainerInternals;
}

/**
 * Add async disposal capability to a container or scope.
 *
 * Enables `await using` syntax by attaching `[Symbol.asyncDispose]` to the target.
 * Disposes owned instances in reverse creation order (LIFO), calling
 * `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` on each instance that implements them.
 *
 * The returned type is narrowed to only expose `resolve`, `tryResolve`, `resolveAll`, and `tryResolveAll`,
 * preventing registration methods from being called on a potentially-disposed container.
 *
 * @param container A Container or Scope to make disposable
 * @returns The same object with `AsyncDisposable` capability added and registration methods removed from the type
 *
 * @example
 * ```ts
 * import { createContainer } from 'katagami';
 * import { disposable } from 'katagami/disposable';
 *
 * await using container = disposable(
 *   createContainer().registerSingleton(DB, () => new Database())
 * );
 * ```
 */
export function disposable<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
>(
	container: Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
): DisposableContainer<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
export function disposable<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
>(
	scope: Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
): DisposableScope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>;
export function disposable<C extends { readonly [INTERNALS]: ContainerInternals }>(container: C): C & AsyncDisposable {
	const asyncDispose = async (): Promise<void> => {
		const internals = container[INTERNALS];

		if (internals.isDisposed()) {
			return;
		}

		internals.markDisposed();

		const instances = [...internals.ownCache.values()].reverse();
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

		internals.ownCache.clear();

		if (errors.length > 0) {
			throw new AggregateError(errors, 'One or more errors occurred during disposal.');
		}
	};

	Object.defineProperty(container, Symbol.asyncDispose, {
		configurable: true,
		value: asyncDispose,
	});

	return container as C & AsyncDisposable;
}
