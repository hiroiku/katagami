import type { PolicyState } from './container/policy.js';
import type { Registration } from './resolver/index.js';
import type { BeforeResolve } from './scope/index.js';

/**
 * Symbol used by extension modules (scope, disposable) to access container/scope internals.
 *
 * @internal
 */
// Bundled CommonJS entry points contain separate copies of this module. Use a
// versioned shared key so core, disposable and mixed ESM/CJS imports interoperate.
export const INTERNALS = Symbol.for('katagami.internals.v4');

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
	readonly policy: PolicyState | undefined;
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

/**
 * Outcome of an asynchronous creation.
 *
 * Disposal needs the created value in order to close it, but must not listen to the promise the
 * scope handed to the caller: that would take over a failure the caller was meant to see. The
 * scope records the outcome on a chain of its own, which never rejects.
 *
 * @internal
 */
export type Creation =
	| { readonly failed: false; readonly value: unknown }
	| { readonly failed: true; readonly error: unknown };

// Bundled CommonJS entry points contain separate copies of this module. Use a shared key so that
// a scope and a disposable view from either copy agree on the same records.
const CREATIONS = Symbol.for('katagami.creations.v4');
const shared = globalThis as typeof globalThis & { [CREATIONS]?: WeakMap<Promise<unknown>, Promise<Creation>> };
if (!shared[CREATIONS]) {
	Object.defineProperty(shared, CREATIONS, { value: new WeakMap<Promise<unknown>, Promise<Creation>>() });
}

/**
 * Settlement records for cached asynchronous creations, keyed by the promise the scope caches.
 *
 * @internal
 */
export const creations = shared[CREATIONS] as WeakMap<Promise<unknown>, Promise<Creation>>;

/**
 * Record how a creation settles, on a chain that never rejects.
 *
 * @internal
 */
export function settle(creation: Promise<unknown>): Promise<Creation> {
	return creation.then(
		value => ({ failed: false, value }) as const,
		(error: unknown) => ({ error, failed: true }) as const,
	);
}

/**
 * A factory running synchronously right now.
 *
 * @internal
 */
export interface RunningFactory {
	readonly scope: object;
	readonly token: unknown;
	readonly registration: Registration;
	/** The singleton cache of the container the scope belongs to. */
	readonly singletons: object;
	readonly context: unknown;
}

// Shared for the same reason as the records above: a factory run by one copy may call a scope from another.
const CONSTRUCTING = Symbol.for('katagami.constructing.v4');
const running = globalThis as typeof globalThis & { [CONSTRUCTING]?: RunningFactory[] };
if (!running[CONSTRUCTING]) {
	Object.defineProperty(running, CONSTRUCTING, { value: [] });
}

/**
 * Factories running synchronously right now, innermost last, across every scope and module copy.
 *
 * @internal
 */
export const constructing = running[CONSTRUCTING] as RunningFactory[];

/**
 * Internal state of a Scope.
 *
 * `resolveInternal` resolves without the policy return check: the value stays inside the
 * face that asked for it. The operations face uses it to obtain the callable it never hands out.
 *
 * @internal
 */
export interface ScopeInternals extends ContainerInternals {
	readonly kind: 'scope';
	resolveInternal(token: unknown): unknown;
}
