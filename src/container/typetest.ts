/**
 * Type-level tests for compile-time dependency validation.
 *
 * These tests verify that the TypeScript type system prevents invalid dependency patterns
 * at compile time. Each `@ts-expect-error` comment asserts that the following line
 * produces a type error — if the line compiles without error, tsc will report an
 * "unused @ts-expect-error" diagnostic, causing the build to fail.
 *
 * Run with: tsc --noEmit
 */
import { createContainer } from '.';

// ---------------------------------------------------------------------------
// Helper classes
// ---------------------------------------------------------------------------
abstract class ServiceA {
	public abstract a: string;
}
abstract class ServiceB {
	public abstract b: string;
}
abstract class ServiceC {
	public abstract c: string;
}
abstract class ScopedService {
	public abstract s: string;
}
abstract class AsyncService {
	public abstract v: string;
}
abstract class UnregisteredService {
	public abstract u: string;
}

// ===========================================================================
// 1. Unregistered tokens cannot be resolved
// ===========================================================================

{
	const container = createContainer();

	// @ts-expect-error — resolving a class token that was never registered
	container.resolve(ServiceA);
}

{
	const container = createContainer();

	// @ts-expect-error — resolving a string token that was never registered
	container.resolve('unknown');
}

// ===========================================================================
// 2. Scoped class tokens cannot be resolved from the root container
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({} as ScopedService));

	// @ts-expect-error — scoped class token must be resolved from a Scope, not Container
	container.resolve(ScopedService);
}

// ===========================================================================
// 3. Scoped PropertyKey tokens cannot be resolved from the root container
// ===========================================================================

{
	const container = createContainer().registerScoped('requestId', () => crypto.randomUUID());

	// @ts-expect-error — scoped PropertyKey token must be resolved from a Scope
	container.resolve('requestId');
}

// ===========================================================================
// 4. Scoped class tokens CAN be resolved from a Scope
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({} as ScopedService));
	const scope = container.createScope();

	// OK — scoped tokens are available in a Scope
	const _instance: ScopedService = scope.resolve(ScopedService);
}

// ===========================================================================
// 5. Scoped PropertyKey tokens CAN be resolved from a Scope
// ===========================================================================

{
	const container = createContainer().registerScoped('requestId', () => crypto.randomUUID());
	const scope = container.createScope();

	// OK — scoped PropertyKey token is available in a Scope
	const _id: string = scope.resolve('requestId');
}

// ===========================================================================
// 6. Singleton factory CANNOT resolve a scoped token (captive dependency)
// ===========================================================================

createContainer()
	.registerScoped(ScopedService, () => ({} as ScopedService))
	// @ts-expect-error — singleton factory should not be able to resolve scoped token
	.registerSingleton(ServiceA, r => ({ a: r.resolve(ScopedService).s } as ServiceA));

// ===========================================================================
// 7. Transient factory CANNOT resolve a scoped token (captive dependency)
// ===========================================================================

createContainer()
	.registerScoped(ScopedService, () => ({} as ScopedService))
	// @ts-expect-error — transient factory should not be able to resolve scoped token
	.registerTransient(ServiceA, r => ({ a: r.resolve(ScopedService).s } as ServiceA));

// ===========================================================================
// 8. Scoped factory CAN resolve previously registered scoped tokens
// ===========================================================================

createContainer()
	.registerScoped(ScopedService, () => ({} as ScopedService))
	// OK — scoped factory can resolve other scoped tokens
	.registerScoped(ServiceA, r => ({ a: r.resolve(ScopedService).s } as ServiceA));

// ===========================================================================
// 9. Scoped factory CAN resolve singleton tokens
// ===========================================================================

createContainer()
	.registerSingleton(ServiceA, () => ({} as ServiceA))
	// OK — scoped factory can resolve singleton tokens
	.registerScoped(ServiceB, r => ({ b: r.resolve(ServiceA).a } as ServiceB));

// ===========================================================================
// 10. Method chaining order: factory can only resolve tokens registered BEFORE it
// ===========================================================================

createContainer()
	// @ts-expect-error — ServiceB is not registered yet at this point in the chain
	.registerSingleton(ServiceA, r => ({ a: r.resolve(ServiceB).b } as ServiceA))
	.registerSingleton(ServiceB, () => ({} as ServiceB));

// ===========================================================================
// 11. Mixed lifetimes: scoped dependency graph through a Scope
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({} as ServiceA))
		.registerScoped(ServiceB, r => ({ b: r.resolve(ServiceA).a } as ServiceB))
		.registerScoped(ServiceC, r => ({ c: r.resolve(ServiceB).b } as ServiceC));

	const scope = container.createScope();

	// OK — Scope can resolve both singleton and scoped tokens
	const _a: ServiceA = scope.resolve(ServiceA);
	const _b: ServiceB = scope.resolve(ServiceB);
	const _c: ServiceC = scope.resolve(ServiceC);
}

// ===========================================================================
// 12. Async scoped token cannot be resolved from root container
// ===========================================================================

{
	const container = createContainer().registerScoped(AsyncService, async () => ({} as AsyncService));

	// @ts-expect-error — async scoped token must be resolved from a Scope
	container.resolve(AsyncService);
}

// ===========================================================================
// 13. Async scoped token CAN be resolved from a Scope
// ===========================================================================

{
	const container = createContainer().registerScoped(AsyncService, async () => ({} as AsyncService));
	const scope = container.createScope();

	// OK — async scoped token is available in a Scope
	const _promise: Promise<AsyncService> = scope.resolve(AsyncService);
}

// ===========================================================================
// 14. Scope inherits non-scoped tokens from the container
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({} as ServiceA))
		.registerTransient(ServiceB, () => ({} as ServiceB));

	const scope = container.createScope();

	// OK — Scope can resolve singleton and transient from parent
	const _a: ServiceA = scope.resolve(ServiceA);
	const _b: ServiceB = scope.resolve(ServiceB);
}

// ===========================================================================
// 15. Nested scope preserves type information
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({} as ServiceA))
		.registerScoped(ScopedService, () => ({} as ScopedService));

	const scope = container.createScope();
	const nested = scope.createScope();

	// OK — nested scope can resolve both singleton and scoped
	const _a: ServiceA = nested.resolve(ServiceA);
	const _s: ScopedService = nested.resolve(ScopedService);
}

// ===========================================================================
// 16. Scoped PropertyKey token works in dependency graph
// ===========================================================================

{
	const container = createContainer()
		.registerScoped('requestId', () => crypto.randomUUID())
		.registerScoped(ServiceA, r => ({ a: r.resolve('requestId') } as ServiceA));

	const scope = container.createScope();

	// OK — scoped tokens resolvable from Scope
	const _id: string = scope.resolve('requestId');
	const _a: ServiceA = scope.resolve(ServiceA);
}

// ===========================================================================
// 17. tryResolve returns V | undefined for registered sync class token
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({} as ServiceA));

	// OK — tryResolve returns ServiceA | undefined
	const _result: ServiceA | undefined = container.tryResolve(ServiceA);
}

// ===========================================================================
// 18. tryResolve returns Promise<V> | undefined for registered async class token
// ===========================================================================

{
	const container = createContainer().registerSingleton(AsyncService, async () => ({} as AsyncService));

	// OK — tryResolve returns Promise<AsyncService> | undefined
	const _result: Promise<AsyncService> | undefined = container.tryResolve(AsyncService);
}

// ===========================================================================
// 19. tryResolve returns T[K] | undefined for registered PropertyKey token
// ===========================================================================

{
	const container = createContainer().registerSingleton('greeting', () => 'hello');

	// OK — tryResolve returns string | undefined
	const _result: string | undefined = container.tryResolve('greeting');
}

// ===========================================================================
// 20. tryResolve accepts unregistered class tokens (no compile error)
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({} as ServiceA));

	// OK — tryResolve accepts unregistered class tokens (unlike resolve which would error)
	const _result: UnregisteredService | Promise<UnregisteredService> | undefined =
		container.tryResolve(UnregisteredService);
}

// ===========================================================================
// 21. tryResolve accepts unregistered PropertyKey tokens (no compile error)
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({} as ServiceA));

	// OK — tryResolve accepts unregistered string tokens
	const _result: unknown = container.tryResolve('nonexistent');
}

// ===========================================================================
// 22. Scope.tryResolve works with scoped tokens
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({} as ServiceA))
		.registerScoped(ScopedService, () => ({} as ScopedService));

	const scope = container.createScope();

	// OK — tryResolve returns ScopedService | undefined
	const _scoped: ScopedService | undefined = scope.tryResolve(ScopedService);

	// OK — tryResolve returns ServiceA | undefined for singleton via scope
	const _singleton: ServiceA | undefined = scope.tryResolve(ServiceA);
}

// ===========================================================================
// 23. Scope.tryResolve accepts unregistered tokens
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({} as ScopedService));
	const scope = container.createScope();

	// OK — tryResolve accepts unregistered class tokens in scope
	const _result: UnregisteredService | Promise<UnregisteredService> | undefined = scope.tryResolve(UnregisteredService);
}

// ===========================================================================
// 24. Scope.tryResolve returns Promise<V> | undefined for async scoped token
// ===========================================================================

{
	const container = createContainer().registerScoped(AsyncService, async () => ({} as AsyncService));
	const scope = container.createScope();

	// OK — async scoped token via tryResolve
	const _result: Promise<AsyncService> | undefined = scope.tryResolve(AsyncService);
}

// ===========================================================================
// 25. tryResolve in factory (Resolver) for optional dependency
// ===========================================================================

createContainer()
	.registerSingleton(ServiceA, () => ({} as ServiceA))
	// OK — factory can use tryResolve for optional dependency on a registered token
	.registerSingleton(ServiceB, r => ({ b: r.tryResolve(ServiceA)?.a ?? 'default' } as ServiceB));

// ===========================================================================
// 26. tryResolve in factory (Resolver) accepts unregistered tokens
// ===========================================================================

createContainer()
	// OK — factory can use tryResolve for a token that is not registered in the chain
	.registerSingleton(ServiceA, r => {
		const _optional: UnregisteredService | Promise<UnregisteredService> | undefined = r.tryResolve(UnregisteredService);
		return {} as ServiceA;
	});
