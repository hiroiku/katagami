import type { Registration } from './resolver';

/**
 * Symbol used by extension modules (scope, disposable) to access container/scope internals.
 *
 * @internal
 */
export const INTERNALS = Symbol('katagami.internals');

/**
 * Internal state exposed via the INTERNALS symbol.
 *
 * Both Container and Scope implement this interface so that extension modules
 * (scope, disposable) can operate on either without importing the concrete class.
 *
 * @internal
 */
export interface ContainerInternals {
	/** All registrations (singleton / transient / scoped). Each token maps to an array of registrations. */
	readonly registrations: Map<unknown, Registration[]>;

	/** Singleton cache keyed by Registration object (Container: singletons, Scope: shared with parent). */
	readonly singletonCache: Map<Registration, unknown>;

	/** Instances owned by this container / scope (disposal target), keyed by Registration object. */
	readonly ownCache: Map<Registration, unknown>;

	/** Whether this container / scope has been disposed. */
	isDisposed(): boolean;

	/** Mark this container / scope as disposed. */
	markDisposed(): void;
}
