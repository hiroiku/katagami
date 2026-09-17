const ENTRYPOINT = Symbol.for('katagami.entrypoint.v1');

export type Callable = (...args: never[]) => unknown;
export type EntrypointFactory<R, F extends Callable> = ((resolver: R) => F | Promise<F>) & {
	readonly [ENTRYPOINT]: true;
};

/** 実体の公開ではなく、関数の実行を公開する factory として登録する。 */
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
