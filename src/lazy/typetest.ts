/**
 * Type-level tests for `lazy()`.
 *
 * Each `@ts-expect-error` comment asserts that the following line
 * produces a type error — if the line compiles without error, tsc will report an
 * "unused @ts-expect-error" diagnostic, causing the build to fail.
 *
 * Run with: tsc --noEmit
 */

import { createContainer } from '../container';
import { disposable } from '../disposable';
import { createScope } from '../scope';
import { lazy } from '.';

// ---------------------------------------------------------------------------
// Helper classes
// ---------------------------------------------------------------------------
abstract class ServiceA {
	public abstract a: string;
}
abstract class AsyncService {
	public abstract v: string;
}
abstract class ScopedService {
	public abstract s: string;
}
abstract class ScopedAsyncService {
	public abstract sa: string;
}
abstract class UnregisteredService {
	public abstract u: string;
}

// ===========================================================================
// 1. Container + sync class token → OK
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);

	const result = lazy(container, ServiceA);
	const _check: ServiceA = result;
}

// ===========================================================================
// 2. Container + async class token → @ts-expect-error
// ===========================================================================

{
	const container = createContainer().registerSingleton(AsyncService, () => Promise.resolve({} as AsyncService));

	// @ts-expect-error — async class token cannot be used with lazy
	lazy(container, AsyncService);
}

// ===========================================================================
// 3. Container + unregistered token → @ts-expect-error
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);

	// @ts-expect-error — unregistered class token cannot be used with lazy
	lazy(container, UnregisteredService);
}

// ===========================================================================
// 4. Container + scoped-only token → @ts-expect-error
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);

	// @ts-expect-error — scoped token cannot be resolved from Container via lazy
	lazy(container, ScopedService);
}

// ===========================================================================
// 5. Scope + sync class token → OK
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);
	const scope = createScope(container);

	const result = lazy(scope, ServiceA);
	const _check: ServiceA = result;
}

// ===========================================================================
// 6. Scope + scoped sync class token → OK
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);
	const scope = createScope(container);

	const result = lazy(scope, ScopedService);
	const _check: ScopedService = result;
}

// ===========================================================================
// 7. Scope + async scoped token → @ts-expect-error
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedAsyncService, () =>
		Promise.resolve({} as ScopedAsyncService),
	);
	const scope = createScope(container);

	// @ts-expect-error — async scoped token cannot be used with lazy
	lazy(scope, ScopedAsyncService);
}

// ===========================================================================
// 8. DisposableContainer + sync class token → OK
// ===========================================================================

{
	const container = disposable(createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA));

	const result = lazy(container, ServiceA);
	const _check: ServiceA = result;
}

// ===========================================================================
// 9. DisposableScope + scoped sync class token → OK
// ===========================================================================

{
	const container = createContainer().registerScoped(ScopedService, () => ({}) as ScopedService);
	const scope = disposable(createScope(container));

	const result = lazy(scope, ScopedService);
	const _check: ScopedService = result;
}

// ===========================================================================
// 10. Return type is V (not Promise<V> or Proxy<V>)
// ===========================================================================

{
	const container = createContainer().registerSingleton(ServiceA, () => ({}) as ServiceA);

	const result = lazy(container, ServiceA);

	// The return type should be ServiceA, not Promise<ServiceA>
	const _sync: ServiceA = result;

	// @ts-expect-error — result is ServiceA, not Promise<ServiceA>
	const _promise: Promise<ServiceA> = result;
}
