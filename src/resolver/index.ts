export type AbstractConstructor<T = unknown> = abstract new (...args: never[]) => T;

/**
 * Resolver passed to factory callbacks.
 *
 * @template T PropertyKey-based type map (defined via interface, order-independent)
 * @template Sync Union of registered sync class constructors (order-dependent)
 * @template Async Union of registered async class constructors (order-dependent)
 */
export interface Resolver<
	T,
	Sync extends AbstractConstructor = AbstractConstructor,
	Async extends AbstractConstructor = never,
> {
	/**
	 * Resolve an instance for the given token.
	 *
	 * @param token A registered token
	 * @returns The instance associated with the token
	 */
	resolve<V>(token: AbstractConstructor<V> & Async): Promise<V>;
	resolve<V>(token: AbstractConstructor<V> & Sync): V;
	resolve<K extends keyof T>(token: K): T[K];

	/**
	 * Try to resolve an instance for the given token.
	 *
	 * Returns `undefined` instead of throwing when the token is not registered.
	 * Other errors (circular dependency, disposed container) are still thrown.
	 *
	 * @param token A token to resolve
	 * @returns The instance associated with the token, or `undefined` if not registered
	 */
	tryResolve<V>(token: AbstractConstructor<V> & Async): Promise<V> | undefined;
	tryResolve<V>(token: AbstractConstructor<V> & Sync): V | undefined;
	tryResolve<K extends keyof T>(token: K): T[K] | undefined;
	tryResolve<V>(token: AbstractConstructor<V>): V | Promise<V> | undefined;
	tryResolve(token: PropertyKey): unknown;
}

/**
 * Lifetime of a registration.
 */
export type Lifetime = 'singleton' | 'transient' | 'scoped';

/**
 * Factory registration entry.
 */
export interface Registration {
	/**
	 * Factory function.
	 *
	 * @param resolver Resolver
	 * @returns Instance
	 */
	readonly factory: (resolver: Resolver<never, never>) => unknown;

	/**
	 * Lifetime of the registration.
	 */
	readonly lifetime: Lifetime;
}

/**
 * Convert a token to a human-readable string.
 */
export function tokenToString(token: unknown): string {
	if (typeof token === 'function') {
		return token.name || 'anonymous function';
	}

	if (typeof token === 'symbol') {
		return token.toString();
	}

	return String(token);
}

/**
 * Build a human-readable circular dependency path from the resolving tokens.
 *
 * Uses the insertion order of Set to extract only the cycle portion.
 * e.g. if resolvingTokens is [X, A, B, C] and token is A, returns "A -> B -> C -> A"
 *
 * @param resolvingTokens The set of tokens currently being resolved
 * @param token The token that caused the circular dependency
 * @returns Formatted cycle path string
 */
export function buildCircularPath(resolvingTokens: Set<unknown>, token: unknown): string {
	const path: string[] = [];
	let found = false;

	for (const t of resolvingTokens) {
		if (t === token) {
			found = true;
		}

		if (found) {
			path.push(tokenToString(t));
		}
	}

	path.push(tokenToString(token));

	return path.join(' -> ');
}
