import { ContainerError } from './error';

type AbstractConstructor<T = unknown> = abstract new (...args: never[]) => T;

/**
 * Resolver passed to factory callbacks.
 *
 * @template T PropertyKey-based type map (defined via interface, order-independent)
 * @template C Union of registered class constructors (order-dependent)
 */
export interface Resolver<
	T,
	C extends AbstractConstructor = AbstractConstructor,
	AC extends AbstractConstructor = never,
> {
	/**
	 * Resolve an instance for the given token.
	 *
	 * @param token A registered token
	 * @returns The instance associated with the token
	 */
	resolve<V>(token: AbstractConstructor<V> & AC): Promise<V>;
	resolve<V>(token: AbstractConstructor<V> & C): V;
	resolve<K extends keyof T>(token: K): T[K];
}

/**
 * Factory registration entry.
 */
interface Registration {
	/**
	 * Factory function.
	 *
	 * @param resolver Resolver
	 * @returns Instance
	 */
	readonly factory: (resolver: Resolver<never, never>) => unknown;

	/**
	 * Whether to register as a singleton.
	 */
	readonly singleton: boolean;
}

/**
 * Create a new DI container.
 *
 * Pass an interface as generic T to fix the PropertyKey token type map upfront (order-independent).
 * Class tokens are accumulated via registerSingleton/registerTransient method chaining (order-dependent).
 *
 * @example
 * ```ts
 * interface Services { SampleController: string }
 * const c = createContainer<Services>()
 *   .registerSingleton(TextGenerationService, () => new MastraTextGenerationService())
 *   .registerTransient(GenerateTextUseCase, r => new GenerateTextUseCase(r.resolve(TextGenerationService)));
 * ```
 */
export function createContainer<T = Record<never, never>>(): Container<T> {
	return new Container();
}

/**
 * Lightweight DI container.
 *
 * Provides type inference through method chaining with registerSingleton/registerTransient/resolve.
 *
 * - Singleton: Creates the instance on the first resolve and returns the cached value thereafter.
 * - Transient: Creates a new instance via the factory function on every resolve.
 *
 * @template T PropertyKey-based token type map (defined via interface, order-independent)
 * @template C Union of registered class constructors (accumulated via chaining, order-dependent)
 */
export class Container<
	T = Record<never, never>,
	C extends AbstractConstructor = never,
	AC extends AbstractConstructor = never,
> {
	/**
	 * Convert a token to a human-readable string.
	 */
	private static tokenToString(token: unknown): string {
		if (typeof token === 'function') {
			return token.name || 'anonymous function';
		}

		if (typeof token === 'symbol') {
			return token.toString();
		}

		return String(token);
	}

	private readonly registrations: Map<unknown, Registration>;
	private readonly instances: Map<unknown, unknown>;
	private readonly resolvingTokens: Set<unknown>;

	public constructor() {
		this.registrations = new Map();
		this.instances = new Map();
		this.resolvingTokens = new Set();
	}

	/**
	 * Register a factory function as a singleton for the given token.
	 *
	 * Creates the instance on the first resolve and returns the cached value thereafter.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance
	 * @returns The container for method chaining
	 */
	public registerSingleton<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, C, AC>) => Promise<V>,
	): Container<T, C, AC | AbstractConstructor<V>>;
	public registerSingleton<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, C, AC>) => V,
	): Container<T, C | AbstractConstructor<V>, AC>;
	public registerSingleton<K extends PropertyKey, V>(
		token: K,
		factory: (resolver: Resolver<T, C, AC>) => V,
	): Container<Record<K, V> & T, C, AC>;
	public registerSingleton<V>(token: unknown, factory: (resolver: Resolver<T, C, AC>) => V): Container<T, C, AC>;
	public registerSingleton(token: unknown, factory: (resolver: Resolver<T, C, AC>) => unknown): Container<T, C, AC> {
		return this.addRegistration(token, factory, true);
	}

	/**
	 * Register a factory function as transient for the given token.
	 *
	 * Creates a new instance via the factory function on every resolve.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance
	 * @returns The container for method chaining
	 */
	public registerTransient<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, C, AC>) => Promise<V>,
	): Container<T, C, AC | AbstractConstructor<V>>;
	public registerTransient<V>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, C, AC>) => V,
	): Container<T, C | AbstractConstructor<V>, AC>;
	public registerTransient<K extends PropertyKey, V>(
		token: K,
		factory: (resolver: Resolver<T, C, AC>) => V,
	): Container<Record<K, V> & T, C, AC>;
	public registerTransient<V>(token: unknown, factory: (resolver: Resolver<T, C, AC>) => V): Container<T, C, AC>;
	public registerTransient(token: unknown, factory: (resolver: Resolver<T, C, AC>) => unknown): Container<T, C, AC> {
		return this.addRegistration(token, factory, false);
	}

	/**
	 * Resolve an instance for the given token.
	 *
	 * For singleton registrations, creates the instance on the first call and caches it.
	 * For transient registrations, creates a new instance on every call.
	 *
	 * @param token A registered token
	 * @returns The instance associated with the token
	 * @throws ContainerError if the token is not registered
	 */
	public resolve<V>(token: AbstractConstructor<V> & AC): Promise<V>;
	public resolve<V>(token: AbstractConstructor<V> & C): V;
	public resolve<K extends keyof T>(token: K): T[K];
	public resolve(token: unknown): unknown {
		const cached = this.instances.get(token);

		if (cached !== undefined) {
			return cached;
		}

		const factory = this.registrations.get(token) as
			| { readonly factory: (resolver: Resolver<T, C, AC>) => unknown; readonly singleton: boolean }
			| undefined;

		if (factory === undefined) {
			throw new ContainerError(`Token "${Container.tokenToString(token)}" is not registered.`);
		}

		if (this.resolvingTokens.has(token)) {
			throw new ContainerError(`Circular dependency detected: ${this.buildCircularPath(token)}`);
		}

		this.resolvingTokens.add(token);

		try {
			const instance = factory.factory(this as unknown as Resolver<T, C, AC>);

			if (factory.singleton) {
				this.instances.set(token, instance);
			}

			return instance;
		} finally {
			this.resolvingTokens.delete(token);
		}
	}

	/**
	 * Build a human-readable circular dependency path from the resolving tokens.
	 *
	 * Uses the insertion order of Set to extract only the cycle portion.
	 * e.g. if resolvingTokens is [X, A, B, C] and token is A, returns "A -> B -> C -> A"
	 *
	 * @param token The token that caused the circular dependency
	 * @returns Formatted cycle path string
	 */
	private buildCircularPath(token: unknown): string {
		const path: string[] = [];
		let found = false;

		for (const t of this.resolvingTokens) {
			if (t === token) {
				found = true;
			}

			if (found) {
				path.push(Container.tokenToString(t));
			}
		}

		path.push(Container.tokenToString(token));

		return path.join(' -> ');
	}

	/**
	 * Add a registration entry.
	 *
	 * @param token Token
	 * @param factory Factory function
	 * @param singleton Whether to register as a singleton
	 * @returns The container for method chaining
	 */
	private addRegistration(
		token: unknown,
		factory: (resolver: Resolver<T, C, AC>) => unknown,
		singleton: boolean,
	): Container<T, C, AC> {
		this.registrations.set(token, { factory, singleton } as Registration);

		return this;
	}
}
