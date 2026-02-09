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

import { disposable } from '../disposable';
import { createScope } from '../scope';
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
// 1. Scoped class tokens CAN be resolved from a Scope
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);
	const scope = createScope(container);

	// OK — scoped tokens are available in a Scope
	const _instance: ScopedService = scope.resolve(ScopedService);
}

// ===========================================================================
// 2. Scoped PropertyKey tokens CAN be resolved from a Scope
// ===========================================================================

{
	const container = createContainer().registerScoped('requestId', () => crypto.randomUUID());
	const scope = createScope(container);

	// OK — scoped PropertyKey token is available in a Scope
	const _id: string = scope.resolve('requestId');
}

// ===========================================================================
// 3. Singleton factory CANNOT resolve a scoped token (captive dependency)
// ===========================================================================

createContainer()
	.registerScoped(ScopedService, () => ({}) as ScopedService)
	// @ts-expect-error — singleton factory should not be able to resolve scoped token
	.registerSingleton(ServiceA, r => ({ a: r.resolve(ScopedService).s }) as ServiceA);

// ===========================================================================
// 4. Transient factory CANNOT resolve a scoped token (captive dependency)
// ===========================================================================

createContainer()
	.registerScoped(ScopedService, () => ({}) as ScopedService)
	// @ts-expect-error — transient factory should not be able to resolve scoped token
	.registerTransient(ServiceA, r => ({ a: r.resolve(ScopedService).s }) as ServiceA);

// ===========================================================================
// 5. Scoped factory CAN resolve previously registered scoped tokens
// ===========================================================================

createContainer()
	.registerScoped(ScopedService, () => ({}) as ScopedService)
	// OK — scoped factory can resolve other scoped tokens
	.registerScoped(ServiceA, r => ({ a: r.resolve(ScopedService).s }) as ServiceA);

// ===========================================================================
// 6. Scoped factory CAN resolve singleton tokens
// ===========================================================================

createContainer()
	.registerSingleton(ServiceA, () => ({}) as ServiceA)
	// OK — scoped factory can resolve singleton tokens
	.registerScoped(ServiceB, r => ({ b: r.resolve(ServiceA).a }) as ServiceB);

// ===========================================================================
// 7. Method chaining order: factory can only resolve tokens registered BEFORE it
// ===========================================================================

createContainer()
	// @ts-expect-error — ServiceB is not registered yet at this point in the chain
	.registerSingleton(ServiceA, r => ({ a: r.resolve(ServiceB).b }) as ServiceA)
	.registerSingleton(ServiceB, () => ({}) as ServiceB);

// ===========================================================================
// 8. Mixed lifetimes: scoped dependency graph through a Scope
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({}) as ServiceA)
		.registerScoped(ServiceB, r => ({ b: r.resolve(ServiceA).a }) as ServiceB)
		.registerScoped(ServiceC, r => ({ c: r.resolve(ServiceB).b }) as ServiceC);

	const scope = createScope(container);

	// OK — Scope can resolve both singleton and scoped tokens
	const _a: ServiceA = scope.resolve(ServiceA);
	const _b: ServiceB = scope.resolve(ServiceB);
	const _c: ServiceC = scope.resolve(ServiceC);
}

// ===========================================================================
// 9. Async scoped token CAN be resolved from a Scope
// ===========================================================================

{
	const container = createContainer().registerScoped(AsyncService, async () => ({}) as AsyncService);
	const scope = createScope(container);

	// OK — async scoped token is available in a Scope
	const _promise: Promise<AsyncService> = scope.resolve(AsyncService);
}

// ===========================================================================
// 10. Scope inherits non-scoped tokens from the container
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({}) as ServiceA)
		.registerTransient(ServiceB, () => ({}) as ServiceB);

	const scope = createScope(container);

	// OK — Scope can resolve singleton and transient from parent
	const _a: ServiceA = scope.resolve(ServiceA);
	const _b: ServiceB = scope.resolve(ServiceB);
}

// ===========================================================================
// 11. Nested scope preserves type information
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({}) as ServiceA)
		.registerScoped(ScopedService, () => ({}) as ScopedService);

	const scope = createScope(container);
	const nested = createScope(scope);

	// OK — nested scope can resolve both singleton and scoped
	const _a: ServiceA = nested.resolve(ServiceA);
	const _s: ScopedService = nested.resolve(ScopedService);
}

// ===========================================================================
// 12. Scoped PropertyKey token works in dependency graph
// ===========================================================================

{
	const container = createContainer()
		.registerScoped('requestId', () => crypto.randomUUID())
		.registerScoped(ServiceA, r => ({ a: r.resolve('requestId') }) as ServiceA);

	const scope = createScope(container);

	// OK — scoped tokens resolvable from Scope
	const _id: string = scope.resolve('requestId');
	const _a: ServiceA = scope.resolve(ServiceA);
}

// ===========================================================================
// 13. Scope.tryResolve returns V | undefined for registered sync class token
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const scope = createScope(container);

	// OK — tryResolve returns ServiceA | undefined
	const _result: ServiceA | undefined = scope.tryResolve(ServiceA);
}

// ===========================================================================
// 14. Scope.tryResolve returns Promise<V> | undefined for registered async class token
// ===========================================================================

{
	const container = createContainer().registerSingleton(AsyncService, async () => ({}) as AsyncService);
	const scope = createScope(container);

	// OK — tryResolve returns Promise<AsyncService> | undefined
	const _result: Promise<AsyncService> | undefined = scope.tryResolve(AsyncService);
}

// ===========================================================================
// 15. Scope.tryResolve returns T[K] | undefined for registered PropertyKey token
// ===========================================================================

{
	const container = createContainer().registerSingleton('greeting', () => 'hello');
	const scope = createScope(container);

	// OK — tryResolve returns string | undefined
	const _result: string | undefined = scope.tryResolve('greeting');
}

// ===========================================================================
// 16. Scope.tryResolve accepts unregistered class tokens (no compile error)
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const scope = createScope(container);

	// OK — tryResolve accepts unregistered class tokens (unlike resolve which would error)
	const _result: UnregisteredService | Promise<UnregisteredService> | undefined = scope.tryResolve(UnregisteredService);
}

// ===========================================================================
// 17. Scope.tryResolve accepts unregistered PropertyKey tokens (no compile error)
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const scope = createScope(container);

	// OK — tryResolve accepts unregistered string tokens
	const _result: unknown = scope.tryResolve('nonexistent');
}

// ===========================================================================
// 18. Scope.tryResolve works with scoped tokens
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({}) as ServiceA)
		.registerScoped(ScopedService, () => ({}) as ScopedService);

	const scope = createScope(container);

	// OK — tryResolve returns ScopedService | undefined
	const _scoped: ScopedService | undefined = scope.tryResolve(ScopedService);

	// OK — tryResolve returns ServiceA | undefined for singleton via scope
	const _singleton: ServiceA | undefined = scope.tryResolve(ServiceA);
}

// ===========================================================================
// 19. Scope.tryResolve accepts unregistered tokens
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);
	const scope = createScope(container);

	// OK — tryResolve accepts unregistered class tokens in scope
	const _result: UnregisteredService | Promise<UnregisteredService> | undefined = scope.tryResolve(UnregisteredService);
}

// ===========================================================================
// 20. Scope.tryResolve returns Promise<V> | undefined for async scoped token
// ===========================================================================

{
	const container = createContainer().registerScoped(AsyncService, async () => ({}) as AsyncService);
	const scope = createScope(container);

	// OK — async scoped token via tryResolve
	const _result: Promise<AsyncService> | undefined = scope.tryResolve(AsyncService);
}

// ===========================================================================
// 21. tryResolve in factory (Resolver) for optional dependency
// ===========================================================================

createContainer()
	.registerSingleton(ServiceA, () => ({}) as ServiceA)
	// OK — factory can use tryResolve for optional dependency on a registered token
	.registerSingleton(ServiceB, r => ({ b: r.tryResolve(ServiceA)?.a ?? 'default' }) as ServiceB);

// ===========================================================================
// 22. tryResolve in factory (Resolver) accepts unregistered tokens
// ===========================================================================

createContainer()
	// OK — factory can use tryResolve for a token that is not registered in the chain
	.registerSingleton(ServiceA, r => {
		const _optional: UnregisteredService | Promise<UnregisteredService> | undefined = r.tryResolve(UnregisteredService);
		return {} as ServiceA;
	});

// ===========================================================================
// 23. use merges class tokens — resolvable via scope
// ===========================================================================

{
	const module = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const container = createContainer().use(module);
	const scope = createScope(container);

	// OK — class token from module is resolvable via scope
	const _a: ServiceA = scope.resolve(ServiceA);
}

// ===========================================================================
// 24. use merges PropertyKey tokens — resolvable via scope
// ===========================================================================

{
	const module = createContainer().registerSingleton('greeting', () => 'hello');
	const container = createContainer().use(module);
	const scope = createScope(container);

	// OK — PropertyKey token from module is resolvable via scope
	const _greeting: string = scope.resolve('greeting');
}

// ===========================================================================
// 25. Tokens from module are available in factory after use
// ===========================================================================

createContainer()
	.use(createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA))
	// OK — factory can resolve token from used module
	.registerSingleton(ServiceB, r => ({ b: r.resolve(ServiceA).a }) as ServiceB);

// ===========================================================================
// 26. Unregistered tokens cannot be resolved after use (via scope)
// ===========================================================================

{
	const module = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const container = createContainer().use(module);
	const scope = createScope(container);

	// @ts-expect-error — ServiceB was not registered in the module or the container
	scope.resolve(ServiceB);
}

// ===========================================================================
// 27. Scoped tokens from module CAN be resolved from a Scope
// ===========================================================================

{
	const module = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);
	const container = createContainer().use(module);
	const scope = createScope(container);

	// OK — scoped token from module is available in a Scope
	const _s: ScopedService = scope.resolve(ScopedService);
}

// ===========================================================================
// 28. Captive dependency prevention works with use — singleton cannot resolve scoped from module
// ===========================================================================

createContainer()
	.use(createContainer().registerScoped(ScopedService, () => ({}) as ScopedService))
	// @ts-expect-error — singleton factory cannot resolve scoped token from module
	.registerSingleton(ServiceA, r => ({ a: r.resolve(ScopedService).s }) as ServiceA);

// ===========================================================================
// 29. Module composition preserves type information (via scope)
// ===========================================================================

{
	const innerModule = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const outerModule = createContainer()
		.use(innerModule)
		.registerSingleton(ServiceB, r => ({ b: r.resolve(ServiceA).a }) as ServiceB);

	const container = createContainer().use(outerModule);
	const scope = createScope(container);

	// OK — both tokens from composed modules are available
	const _a: ServiceA = scope.resolve(ServiceA);
	const _b: ServiceB = scope.resolve(ServiceB);
}

// ===========================================================================
// 30. disposable() on Container hides registerSingleton
// ===========================================================================

{
	const container = disposable(createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA));

	// @ts-expect-error — registerSingleton is not available after disposable()
	container.registerSingleton(ServiceB, () => ({}) as ServiceB);
}

// ===========================================================================
// 31. disposable() on Container hides registerTransient
// ===========================================================================

{
	const container = disposable(createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA));

	// @ts-expect-error — registerTransient is not available after disposable()
	container.registerTransient(ServiceB, () => ({}) as ServiceB);
}

// ===========================================================================
// 32. disposable() on Container hides registerScoped
// ===========================================================================

{
	const container = disposable(createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA));

	// @ts-expect-error — registerScoped is not available after disposable()
	container.registerScoped(ScopedService, () => ({}) as ScopedService);
}

// ===========================================================================
// 33. disposable() on Container hides use
// ===========================================================================

{
	const module = createContainer().registerSingleton(ServiceB, () => ({}) as ServiceB);
	const container = disposable(createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA));

	// @ts-expect-error — use is not available after disposable()
	container.use(module);
}

// ===========================================================================
// 34. disposable() on Scope allows resolve
// ===========================================================================

{
	const root = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);
	const scope = disposable(createScope(root));

	// OK — resolve is available on disposable scope
	const _s: ScopedService = scope.resolve(ScopedService);
}

// ===========================================================================
// 35. createScope works with DisposableContainer
// ===========================================================================

{
	const container = disposable(
		createContainer()
			.registerSingleton(ServiceA, () => ({}) as ServiceA)
			.registerScoped(ScopedService, () => ({}) as ScopedService),
	);

	const scope = createScope(container);

	// OK — scope created from disposable container can resolve both
	const _a: ServiceA = scope.resolve(ServiceA);
	const _s: ScopedService = scope.resolve(ScopedService);
}

// ===========================================================================
// 36. createScope works with DisposableScope
// ===========================================================================

{
	const root = createContainer()
		.registerSingleton(ServiceA, () => ({}) as ServiceA)
		.registerScoped(ScopedService, () => ({}) as ScopedService);

	const parentScope = disposable(createScope(root));
	const childScope = createScope(parentScope);

	// OK — child scope from disposable scope can resolve both
	const _a: ServiceA = childScope.resolve(ServiceA);
	const _s: ScopedService = childScope.resolve(ScopedService);
}

// ===========================================================================
// 37. Scope.resolveAll returns V[] for sync class token
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(ServiceA, () => ({}) as ServiceA)
		.registerSingleton(ServiceA, () => ({}) as ServiceA);

	const scope = createScope(container);

	// OK — resolveAll returns ServiceA[]
	const _all: ServiceA[] = scope.resolveAll(ServiceA);
}

// ===========================================================================
// 38. Scope.resolveAll returns Promise<V>[] for async class token
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton(AsyncService, async () => ({}) as AsyncService)
		.registerSingleton(AsyncService, async () => ({}) as AsyncService);

	const scope = createScope(container);

	// OK — resolveAll returns Promise<AsyncService>[]
	const _all: Promise<AsyncService>[] = scope.resolveAll(AsyncService);
}

// ===========================================================================
// 39. Scope.resolveAll returns T[K][] for PropertyKey token
// ===========================================================================

{
	const container = createContainer()
		.registerSingleton('greeting', () => 'hello')
		.registerSingleton('greeting', () => 'world');

	const scope = createScope(container);

	// OK — resolveAll returns string[]
	const _all: string[] = scope.resolveAll('greeting');
}

// ===========================================================================
// 40. Scope.resolveAll returns V[] for scoped class token
// ===========================================================================

{
	const container = createContainer()
		.registerScoped(ScopedService, () => ({}) as ScopedService)
		.registerScoped(ScopedService, () => ({}) as ScopedService);

	const scope = createScope(container);

	// OK — resolveAll returns ScopedService[] from scope
	const _all: ScopedService[] = scope.resolveAll(ScopedService);
}

// ===========================================================================
// 41. Scope.tryResolveAll returns V[] | undefined for registered sync class token
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const scope = createScope(container);

	// OK — tryResolveAll returns ServiceA[] | undefined
	const _result: ServiceA[] | undefined = scope.tryResolveAll(ServiceA);
}

// ===========================================================================
// 42. Scope.tryResolveAll accepts unregistered class tokens (no compile error)
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const scope = createScope(container);

	// OK — tryResolveAll accepts unregistered class tokens (returns undefined at runtime)
	const _result: (UnregisteredService | Promise<UnregisteredService>)[] | undefined =
		scope.tryResolveAll(UnregisteredService);
}

// ===========================================================================
// 43. resolveAll in factory (Resolver) for multi-binding injection
// ===========================================================================

createContainer()
	.registerSingleton(ServiceA, () => ({}) as ServiceA)
	.registerSingleton(ServiceA, () => ({}) as ServiceA)
	// OK — factory can use resolveAll to get all registered instances
	.registerSingleton(ServiceB, r => ({ b: r.resolveAll(ServiceA).length.toString() }) as ServiceB);

// ===========================================================================
// 44. disposable() on Scope allows resolveAll
// ===========================================================================

{
	const root = createContainer()
		.registerScoped(ScopedService, () => ({}) as ScopedService)
		.registerScoped(ScopedService, () => ({}) as ScopedService);
	const scope = disposable(createScope(root));

	// OK — resolveAll is available on disposable scope
	const _all: ScopedService[] = scope.resolveAll(ScopedService);
}
