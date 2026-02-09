import { type ContainerInternals, INTERNALS } from '../internal';

/**
 * Add async disposal capability to a container or scope.
 *
 * Enables `await using` syntax by attaching `[Symbol.asyncDispose]` to the target.
 * Disposes owned instances in reverse creation order (LIFO), calling
 * `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` on each instance that implements them.
 *
 * @param container A Container or Scope to make disposable
 * @returns The same object with `AsyncDisposable` capability added
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
export function disposable<C extends { readonly [INTERNALS]: ContainerInternals }>(container: C): C & AsyncDisposable {
	const asyncDispose = async (): Promise<void> => {
		const internals = container[INTERNALS];

		if (internals.isDisposed()) {
			return;
		}

		internals.markDisposed();

		const instances = [...internals.ownInstances.values()].reverse();
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

		internals.ownInstances.clear();

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
