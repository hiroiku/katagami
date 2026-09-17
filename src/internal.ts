import type { Registration } from './resolver/index.js';
import type { BeforeResolve } from './scope/index.js';

/**
 * Symbol used by extension modules (scope, disposable) to access container/scope internals.
 *
 * @internal
 */
// Bundled CommonJS entry points contain separate copies of this module. Use a
// versioned shared key so core, disposable and mixed ESM/CJS imports interoperate.
export const INTERNALS = Symbol.for('katagami.internals.v3');

/** Type-only registration state retained by disposable views. No runtime property is emitted. */
export declare const TYPE_STATE: unique symbol;
export declare const REGISTRATION_STATE: unique symbol;

/**
 * Internal state exposed via the INTERNALS symbol.
 *
 * Both Container and Scope implement this interface so that extension modules
 * (scope, disposable) can operate on either without importing the concrete class.
 *
 * @internal
 */
export interface ContainerInternals {
	readonly kind: 'container' | 'scope';
	invocationView?: unknown;
	readonly beforeResolve: readonly BeforeResolve[];
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
