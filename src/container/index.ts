import { type Callable, type EntrypointFactory, isEntrypoint } from '../entrypoint/index.js';
import { ContainerError } from '../error/index.js';
import { type ContainerInternals, INTERNALS, type REGISTRATION_STATE } from '../internal.js';
import {
	type AnyMetadataEntry,
	type AnyMetadataKey,
	type MetadataKeyOf,
	type MetadataReader,
	type RegistrationArguments,
	readMetadata,
} from '../metadata/index.js';
import type { AbstractConstructor, Lifetime, Registration, Resolver } from '../resolver/index.js';
import { bindPolicy, type ContainerPolicy, type PolicyState, type RequiredMetadata } from './policy.js';

export type RegisteredTokens<C> = C extends { readonly [REGISTRATION_STATE]: infer S }
	? S extends { readonly untracked: true }
		? never
		: S extends { readonly token: infer K }
			? K
			: never
	: never;

export interface RegistrationState {
	readonly token: unknown;
	readonly metadata: AnyMetadataKey;
	readonly callable: Callable | never;
}
type State<K, E extends readonly AnyMetadataEntry[], F = never> = {
	readonly token: K;
	readonly metadata: MetadataKeyOf<E[number]>;
	readonly callable: F;
};
type Replace<S, K, N> = (unknown extends S ? UntrackedState : Exclude<S, { readonly token: K }>) | N;
type UntrackedState<K = unknown> = {
	readonly token: K;
	readonly metadata: never;
	readonly callable: never;
	readonly untracked: true;
};
type SourceState<S, K> = unknown extends S
	? UntrackedState<K>
	: S extends { readonly untracked: true }
		? UntrackedState<K>
		: S;
type SourceTokens<S, K> = unknown extends S
	? K
	: S extends { readonly untracked: true }
		? K
		: S extends { readonly token: infer Token }
			? Token
			: never;
type Append<S, K, E extends readonly AnyMetadataEntry[], F = never> = unknown extends S
	? [MetadataKeyOf<E[number]> | F] extends [never]
		? unknown
		: UntrackedState | State<K, E, F>
	: Replace<
			S,
			K,
			{
				readonly token: K;
				readonly metadata: [Extract<S, { readonly token: K }>] extends [never]
					? MetadataKeyOf<E[number]>
					: Extract<
							Extract<S, { readonly token: K }> extends { readonly metadata: infer M } ? M : never,
							MetadataKeyOf<E[number]>
						>;
				readonly callable: F;
			}
		>;
type TrackedState<S> = S extends { readonly metadata: infer M; readonly callable: infer F }
	? [M | F] extends [never]
		? never
		: S
	: never;
type Merge<S, K, N> = unknown extends S
	? [TrackedState<N>] extends [never]
		? unknown
		: Replace<S, K, N>
	: Replace<S, K, N>;
type MissingMetadata<R, S> = unknown extends S ? R : S extends { readonly metadata: infer M } ? Exclude<R, M> : never;

/**
 * Create a new DI container that follows a shared policy.
 *
 * Containers created with the same policy object share its settings and the origins it observes.
 * Every registration must carry the policy's `requiredMetadata`, and `use()` accepts only modules
 * with the same policy or without one. Declare the policy with `satisfies ContainerPolicy` to keep
 * its concrete types.
 *
 * @param options `policy`: the shared policy object
 */
export function createContainer<const P extends ContainerPolicy>(options: {
	readonly policy: P;
}): Container<Record<never, never>, never, never, Record<never, never>, never, never, RequiredMetadata<P>, never>;
/**
 * Create a new DI container that follows a shared policy, with predeclared token type maps.
 *
 * @template T PropertyKey-based token type map (defined via interface, order-independent)
 * @template ScopedT PropertyKey-based token type map for scoped registrations
 * @param options `policy`: the shared policy object
 */
export function createContainer<T, ScopedT, const P extends ContainerPolicy>(options: {
	readonly policy: P;
}): Container<T, never, never, ScopedT, never, never, RequiredMetadata<P>, never>;
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
export function createContainer<T = Record<never, never>, ScopedT = Record<never, never>>(): Container<
	T,
	never,
	never,
	ScopedT,
	never,
	never,
	readonly [],
	[keyof T | keyof ScopedT] extends [never] ? never : unknown
>;
export function createContainer(options?: {
	readonly policy: ContainerPolicy;
}): Container<unknown, never, never, unknown, never, never, readonly AnyMetadataKey[]> {
	return new Container(options);
}

/**
 * Lightweight DI container — registration only.
 *
 * Provides type inference through method chaining with registerSingleton/registerTransient/registerScoped.
 * Resolution is performed through a Scope created via `createScope(container)`.
 *
 * Registering the same token multiple times accumulates all factories.
 *
 * @template T PropertyKey-based token type map (defined via interface, order-independent)
 * @template Sync Union of registered sync class constructors (accumulated via chaining, order-dependent)
 * @template Async Union of registered async class constructors (accumulated via chaining, order-dependent)
 * @template ScopedT PropertyKey-based token type map for scoped registrations
 * @template ScopedSync Union of scoped sync class constructors (accumulated via chaining, order-dependent)
 * @template ScopedAsync Union of scoped async class constructors (accumulated via chaining, order-dependent)
 * @template Required Metadata keys the container's policy requires on every registration
 * @template Registrations Registration state that tracks metadata and operations per token
 */
export class Container<
	T = Record<never, never>,
	Sync extends AbstractConstructor = never,
	Async extends AbstractConstructor = never,
	ScopedT = Record<never, never>,
	ScopedSync extends AbstractConstructor = never,
	ScopedAsync extends AbstractConstructor = never,
	Required extends readonly AnyMetadataKey[] = readonly [],
	Registrations = unknown,
> {
	private readonly registrations = new Map<unknown, Registration[]>();
	private readonly singletonCache = new Map<Registration, unknown>();
	private readonly requiredMetadata: readonly AnyMetadataKey[];
	private readonly policy: PolicyState | undefined;
	private disposed = false;
	public declare readonly [REGISTRATION_STATE]: Registrations;
	public readonly [INTERNALS]: ContainerInternals & { readonly kind: 'container' };
	public constructor(options?: { readonly policy: ContainerPolicy<Required> }) {
		if (options && 'requiredMetadata' in options) {
			throw new ContainerError('requiredMetadata must be declared in policy.');
		}
		this.policy = bindPolicy(options?.policy);
		this.requiredMetadata = this.policy?.requiredMetadata ?? [];
		this[INTERNALS] = {
			beforeResolve: [],
			isDisposed: () => this.disposed,
			kind: 'container',
			markDisposed: () => {
				this.disposed = true;
			},
			ownCache: this.singletonCache,
			policy: this.policy,
			registrations: this.registrations,
			singletonCache: this.singletonCache,
		};
	}
	/**
	 * Register a factory function as a singleton for the given token.
	 *
	 * Creates the instance on the first resolve and returns the cached value thereafter.
	 * If the same token is registered multiple times, all factories are accumulated.
	 * `resolve()` returns the last registered instance; `resolveAll()` returns all.
	 * Register request-dependent work as scoped instead.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance. Wrap it with
	 *   `entrypoint()` to expose the function it returns as an operation.
	 * @param options `metadata`: entries created with metadata keys. Required when the policy declares
	 *   `requiredMetadata`.
	 * @returns The container for method chaining
	 */
	public registerSingleton<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: ((resolver: Resolver<T, Sync, Async>) => F) & EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, F> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerSingleton<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, Promise<F>> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerSingleton<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => Promise<V>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async | AbstractConstructor<V>,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerSingleton<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync | AbstractConstructor<V>,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerSingleton<K extends PropertyKey, V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: K,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<Record<K, V> & T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Append<Registrations, K, E>>;
	public registerSingleton<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations | State<unknown, E>>;
	public registerSingleton(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => unknown,
		...options: readonly [{ readonly metadata?: readonly AnyMetadataEntry[] }?]
	): unknown {
		return this.addRegistration(token, factory as Registration['factory'], 'singleton', options[0]?.metadata ?? []);
	}
	/**
	 * Register a factory function as transient for the given token.
	 *
	 * Creates a new instance via the factory function on every resolve.
	 * If the same token is registered multiple times, all factories are accumulated.
	 * `resolve()` returns the last registered instance; `resolveAll()` returns all.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance. Wrap it with
	 *   `entrypoint()` to expose the function it returns as an operation.
	 * @param options `metadata`: entries created with metadata keys. Required when the policy declares
	 *   `requiredMetadata`.
	 * @returns The container for method chaining
	 */
	public registerTransient<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: ((resolver: Resolver<T, Sync, Async>) => F) & EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, F> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerTransient<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: EntrypointFactory<Resolver<T, Sync, Async>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		Record<K, Promise<F>> & T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerTransient<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => Promise<V>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async | AbstractConstructor<V>,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerTransient<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync | AbstractConstructor<V>,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerTransient<K extends PropertyKey, V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: K,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<Record<K, V> & T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Append<Registrations, K, E>>;
	public registerTransient<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations | State<unknown, E>>;
	public registerTransient(
		token: unknown,
		factory: (resolver: Resolver<T, Sync, Async>) => unknown,
		...options: readonly [{ readonly metadata?: readonly AnyMetadataEntry[] }?]
	): unknown {
		return this.addRegistration(token, factory as Registration['factory'], 'transient', options[0]?.metadata ?? []);
	}
	/**
	 * Register a factory function as scoped for the given token.
	 *
	 * Within a scope, creates the instance on the first resolve and returns the cached value thereafter.
	 * Each scope maintains its own cache, so different scopes produce different instances.
	 * Scoped tokens cannot be resolved from the root container — use createScope() first.
	 *
	 * @param token Any value to use as a token
	 * @param factory Factory function that receives a resolver and returns an instance. Wrap it with
	 *   `entrypoint()` to expose the function it returns as an operation.
	 * @param options `metadata`: entries created with metadata keys. Required when the policy declares
	 *   `requiredMetadata`.
	 * @returns The container for method chaining
	 */
	public registerScoped<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: ((resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => F) &
			EntrypointFactory<Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		Record<K, F> & ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerScoped<
		K extends PropertyKey,
		F extends Callable,
		const E extends readonly AnyMetadataEntry[] = readonly [],
	>(
		token: K,
		factory: EntrypointFactory<Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>, F>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		Record<K, Promise<F>> & ScopedT,
		ScopedSync,
		ScopedAsync,
		Required,
		Append<Registrations, K, E, F>
	>;
	public registerScoped<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => Promise<V>,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		ScopedT,
		ScopedSync,
		ScopedAsync | AbstractConstructor<V>,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerScoped<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: AbstractConstructor<V>,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<
		T,
		Sync,
		Async,
		ScopedT,
		ScopedSync | AbstractConstructor<V>,
		ScopedAsync,
		Required,
		Append<Registrations, AbstractConstructor<V>, E>
	>;
	public registerScoped<K extends PropertyKey, V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: K,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, Record<K, V> & ScopedT, ScopedSync, ScopedAsync, Required, Append<Registrations, K, E>>;
	public registerScoped<V, const E extends readonly AnyMetadataEntry[] = readonly []>(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => V,
		...options: RegistrationArguments<Required, E>
	): Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync, Required, Registrations | State<unknown, E>>;
	public registerScoped(
		token: unknown,
		factory: (resolver: Resolver<T & ScopedT, Sync | ScopedSync, Async | ScopedAsync>) => unknown,
		...options: readonly [{ readonly metadata?: readonly AnyMetadataEntry[] }?]
	): unknown {
		return this.addRegistration(token, factory as Registration['factory'], 'scoped', options[0]?.metadata ?? []);
	}

	/**
	 * Read the metadata of the last registration for a token without creating the instance.
	 *
	 * @param token A registered token
	 * @returns A read-only metadata reader
	 * @throws ContainerError if the token is not registered
	 */
	public getMetadata<V>(token: AbstractConstructor<V> & (Sync | Async | ScopedSync | ScopedAsync)): MetadataReader;
	public getMetadata<K extends keyof (T & ScopedT)>(token: K): MetadataReader;
	public getMetadata(token: unknown): MetadataReader {
		const entries = this.registrations.get(token);
		if (!entries?.length) {
			throw new ContainerError('Token is not registered.');
		}
		return (entries[entries.length - 1] as Registration).metadata;
	}

	/**
	 * Apply all registrations from another container (module) to this container.
	 *
	 * Copies registration entries by replacing existing entries for each token.
	 * Singleton instance caches are not shared — each container manages its own.
	 * A module with a policy must use this container's policy, and every copied registration must carry
	 * the metadata this container's policy requires; otherwise nothing is copied.
	 *
	 * @param source A container whose registrations will be copied into this container
	 * @returns The container for method chaining
	 */
	public use<
		MT,
		MS extends AbstractConstructor,
		MA extends AbstractConstructor,
		MST,
		MSS extends AbstractConstructor,
		MSA extends AbstractConstructor,
		MR extends readonly AnyMetadataKey[],
		State,
	>(
		source: Container<MT, MS, MA, MST, MSS, MSA, MR, State> &
			([MissingMetadata<Required[number], State>] extends [never]
				? unknown
				: { readonly missingRequiredMetadata: never }),
	): Container<
		T & MT,
		Sync | MS,
		Async | MA,
		ScopedT & MST,
		ScopedSync | MSS,
		ScopedAsync | MSA,
		Required,
		Merge<
			Registrations,
			SourceTokens<State, keyof MT | keyof MST | MS | MA | MSS | MSA>,
			SourceState<State, keyof MT | keyof MST | MS | MA | MSS | MSA>
		>
	>;
	public use(source: { readonly [INTERNALS]: ContainerInternals }): unknown {
		if (this.disposed) {
			throw new ContainerError('Cannot register on a disposed container.');
		}
		const sourcePolicy = source[INTERNALS].policy;
		if (sourcePolicy && sourcePolicy !== this.policy) {
			throw new ContainerError('Cannot compose containers with different policies.');
		}
		for (const registrations of source[INTERNALS].registrations.values()) {
			for (const registration of registrations) {
				for (const key of this.requiredMetadata) {
					if (!registration.metadata.has(key)) {
						throw new ContainerError('Required metadata is missing.');
					}
				}
			}
		}
		for (const [token, registrations] of source[INTERNALS].registrations) {
			this.registrations.set(token, [...registrations]);
		}
		return this;
	}
	private addRegistration(
		token: unknown,
		factory: Registration['factory'],
		lifetime: Lifetime,
		entries: readonly AnyMetadataEntry[],
	): this {
		if (this.disposed) {
			throw new ContainerError('Cannot register on a disposed container.');
		}
		const metadata = readMetadata(entries, this.requiredMetadata);
		const registration: Registration = Object.freeze({
			entrypoint: isEntrypoint(factory),
			factory,
			lifetime,
			metadata: metadata.reader,
			metadataPairs: metadata.pairs,
		});
		const existing = this.registrations.get(token);
		if (existing) {
			existing.push(registration);
		} else {
			this.registrations.set(token, [registration]);
		}
		return this;
	}
}
