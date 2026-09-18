import type { Container } from '../container/index.js';
import {
	type ContainerInternals,
	creations,
	INTERNALS,
	type REGISTRATION_STATE,
	settle,
	type TYPE_STATE,
} from '../internal.js';
import type { AnyMetadataKey } from '../metadata/index.js';
import type { AbstractConstructor, Resolver } from '../resolver/index.js';
import type { Scope } from '../scope/index.js';

/**
 * A container wrapped with `disposable()`.
 *
 * Registration methods (`registerSingleton`, `registerTransient`, `registerScoped`, `use`)
 * are excluded, preventing accidental registration on a potentially-disposed container.
 * Use `createScope()` to create a scope for resolution.
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
	ScopedT = Record<never, never>,
	ScopedSync extends AbstractConstructor = never,
	ScopedAsync extends AbstractConstructor = never,
	Required extends readonly AnyMetadataKey[] = readonly [],
	Registrations = unknown,
> extends AsyncDisposable {
	readonly [INTERNALS]: ContainerInternals & { readonly kind: 'container' };
	readonly [REGISTRATION_STATE]: Registrations;
	readonly requiredMetadataType?: Required;
	readonly [TYPE_STATE]?: {
		readonly kind: 'container';
		readonly registrations: readonly [T, Sync, Async, ScopedT, ScopedSync, ScopedAsync];
	};
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
	Registrations = unknown,
> extends Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>,
		AsyncDisposable {
	readonly [INTERNALS]: ContainerInternals & { readonly kind: 'scope' };
	readonly [REGISTRATION_STATE]: Registrations;
	readonly [TYPE_STATE]?: {
		readonly kind: 'scope';
		readonly registrations: readonly [T, Sync, Async, ScopedT, ScopedSync, ScopedAsync];
	};
}

/**
 * Add async disposal capability to a container or scope.
 *
 * Enables `await using` syntax by attaching `[Symbol.asyncDispose]` to the target.
 * Disposes owned instances in reverse creation order (LIFO), calling
 * `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` on each instance that implements them.
 * A cached asynchronous creation that rejected yields no resolved value to close: it is awaited,
 * skipped, and its failure is left to the caller that resolved the token.
 *
 * The returned type prevents registration methods from being called on a potentially-disposed container.
 * For scopes, `resolve`, `tryResolve`, `resolveAll`, and `tryResolveAll` remain available.
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
	Required extends readonly AnyMetadataKey[],
	Registrations,
>(
	container: Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations>,
): DisposableContainer<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations>;
export function disposable<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	Registrations,
>(
	scope: Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>,
): DisposableScope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Registrations>;
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
			let resolved: unknown = instance;

			if (instance instanceof Promise) {
				// 閉じる対象を取り出すために、scope が残した生成の記帳を待つ。呼出元へ渡した Promise では
				// ないので、破棄が呼出元の失敗を先に受け取ってしまうことはない。記帳を残さない別のビルドが
				// cache へ載せた Promise は、閉じ損ねないようにその Promise 自体を待つ。
				// 失敗した生成からは閉じる対象を得られないので、破棄の失敗としては数えず、
				// 残りの実体の破棄を続ける。生成の失敗は、その token を解決した呼出元が受け取る。
				const creation = await (creations.get(instance) ?? settle(instance));
				if (creation.failed) {
					continue;
				}
				resolved = creation.value;
			}

			try {
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
