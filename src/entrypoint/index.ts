const ENTRYPOINT = Symbol.for('katagami.entrypoint.v1');

export type Callable = (...args: never[]) => unknown;
export type EntrypointFactory<R, F extends Callable> = ((resolver: R) => F | Promise<F>) & {
	readonly [ENTRYPOINT]: true;
};

/**
 * Mark a factory that returns a function as a public operation.
 *
 * An operations scope (`createScope(container, { access: 'operations' })`) exposes only entry points.
 * Calling the operation it returns resolves the registration and runs the function on each call.
 *
 * @param factory Factory function that receives a resolver and returns the operation's function
 * @returns The same factory, marked as an entry point
 */
export function entrypoint<R, F extends Callable>(
	factory: (resolver: R) => F,
): ((resolver: R) => F) & { readonly [ENTRYPOINT]: true };
export function entrypoint<R, F extends Callable>(factory: (resolver: R) => Promise<F>): EntrypointFactory<R, F>;
export function entrypoint<R, F extends Callable>(factory: (resolver: R) => F | Promise<F>): EntrypointFactory<R, F> {
	return Object.assign((resolver: R) => factory(resolver), { [ENTRYPOINT]: true as const });
}

export function isEntrypoint(factory: unknown): boolean {
	return typeof factory === 'function' && ENTRYPOINT in factory && factory[ENTRYPOINT] === true;
}
