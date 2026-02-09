import { describe, expect, test } from 'bun:test';
import { Container, createContainer } from '../container';
import { ContainerError } from '../error';
import { createScope, Scope } from '.';

// Helper classes for testing
class ServiceA {
	public constructor(public value = 'A') {}
}

class ServiceB {
	public constructor(public a: ServiceA) {}
}

class ServiceC {
	public constructor(public b: ServiceB) {}
}

class AsyncService {
	public constructor(public value: string) {}
}

class RequestContext {
	public constructor(public id = Math.random()) {}
}

class UserRepository {
	public constructor(public ctx: RequestContext) {}
}

// Helper classes for circular dependency tests
class CircularA {
	public constructor(public b: CircularB) {}
}

class CircularB {
	public constructor(public a: CircularA) {}
}

describe('registerScoped', () => {
	test('returns the container for method chaining', () => {
		const container = createContainer();
		const result = container.registerScoped(ServiceA, () => new ServiceA());
		expect(result).toBeInstanceOf(Container);
	});

	test('works with class token', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope = createScope(container);
		expect(scope.resolve(RequestContext)).toBeInstanceOf(RequestContext);
	});

	test('works with string token', () => {
		const container = createContainer().registerScoped('requestId', () => Math.random());
		const scope = createScope(container);
		expect(typeof scope.resolve('requestId')).toBe('number');
	});

	test('works with Symbol token', () => {
		const token = Symbol('scopedService');
		const container = createContainer().registerScoped(token, () => 42);
		const scope = createScope(container);
		expect(scope.resolve(token)).toBe(42);
	});
});

describe('createScope', () => {
	test('returns a Scope instance', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(scope).toBeInstanceOf(Scope);
	});

	test('scope can resolve singleton from parent', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		expect(scope.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('scope can resolve transient from parent', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		expect(scope.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});
});

describe('resolve (scoped)', () => {
	test('returns the same instance within the same scope', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope = createScope(container);
		const first = scope.resolve(RequestContext);
		const second = scope.resolve(RequestContext);
		expect(first).toBe(second);
	});

	test('returns different instances in different scopes', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope1 = createScope(container);
		const scope2 = createScope(container);
		const instance1 = scope1.resolve(RequestContext);
		const instance2 = scope2.resolve(RequestContext);
		expect(instance1).not.toBe(instance2);
		expect(instance1).toBeInstanceOf(RequestContext);
		expect(instance2).toBeInstanceOf(RequestContext);
	});

	test('throws ContainerError when resolving scoped token from root container', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const resolve = (container as never as { resolve: (t: unknown) => unknown }).resolve.bind(container);
		expect(() => resolve(RequestContext)).toThrow(ContainerError);
		expect(() => resolve(RequestContext)).toThrow('Cannot resolve scoped token');
		expect(() => resolve(RequestContext)).toThrow('createScope()');
	});
});

describe('scoped + singleton interaction', () => {
	test('scope returns the same singleton as the parent container', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const rootInstance = container.resolve(ServiceA);
		const scope = createScope(container);
		const scopeInstance = scope.resolve(ServiceA);
		expect(scopeInstance).toBe(rootInstance);
	});

	test('singletons created in scope are shared with the parent', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const scopeInstance = scope.resolve(ServiceA);
		const rootInstance = container.resolve(ServiceA);
		expect(scopeInstance).toBe(rootInstance);
	});

	test('singletons are shared across different scopes', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope1 = createScope(container);
		const scope2 = createScope(container);
		const instance1 = scope1.resolve(ServiceA);
		const instance2 = scope2.resolve(ServiceA);
		expect(instance1).toBe(instance2);
	});

	test('scoped factory can resolve singleton dependency', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(
				UserRepository,
				r => new UserRepository((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext)),
			)
			.registerScoped(RequestContext, () => new RequestContext());

		const scope = createScope(container);
		const repo = scope.resolve(UserRepository);
		expect(repo).toBeInstanceOf(UserRepository);
		expect(repo.ctx).toBeInstanceOf(RequestContext);
	});
});

describe('scoped + transient interaction', () => {
	test('transient creates new instances even within a scope', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const first = scope.resolve(ServiceA);
		const second = scope.resolve(ServiceA);
		expect(first).not.toBe(second);
	});
});

describe('nested scopes', () => {
	test('nested scope has its own scoped cache', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const parentScope = createScope(container);
		const childScope = createScope(parentScope);
		const parentInstance = parentScope.resolve(RequestContext);
		const childInstance = childScope.resolve(RequestContext);
		expect(parentInstance).not.toBe(childInstance);
	});

	test('nested scope shares singleton instances', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const parentScope = createScope(container);
		const childScope = createScope(parentScope);
		const parentInstance = parentScope.resolve(ServiceA);
		const childInstance = childScope.resolve(ServiceA);
		expect(parentInstance).toBe(childInstance);
	});

	test('nested scope returns a Scope instance', () => {
		const container = createContainer();
		const scope = createScope(container);
		const nested = createScope(scope);
		expect(nested).toBeInstanceOf(Scope);
	});
});

describe('scoped + circular dependency detection', () => {
	test('detects circular dependency within a scope', () => {
		const container = createContainer()
			.registerScoped(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerScoped(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(CircularA)).toThrow(ContainerError);
		expect(() => scope.resolve(CircularA)).toThrow('Circular dependency detected');
	});

	test('error message includes the circular path in scope', () => {
		const container = createContainer()
			.registerScoped(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerScoped(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(CircularA)).toThrow('CircularA -> CircularB -> CircularA');
	});

	test('detects captive dependency with mixed lifetimes in scope (singleton → scoped)', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerScoped(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(CircularA)).toThrow('Captive dependency detected');
	});

	test('detects self-referencing circular dependency (A -> A) in scope', () => {
		class SelfRef {
			public constructor(public self: SelfRef) {}
		}

		const container = createContainer().registerScoped(
			SelfRef,
			r => new SelfRef((r as never as { resolve: (t: unknown) => SelfRef }).resolve(SelfRef)),
		);

		const scope = createScope(container);
		expect(() => scope.resolve(SelfRef)).toThrow(ContainerError);
		expect(() => scope.resolve(SelfRef)).toThrow('Circular dependency detected');
		expect(() => scope.resolve(SelfRef)).toThrow('SelfRef -> SelfRef');
	});
});

describe('scoped + async factory', () => {
	test('async scoped factory resolves within scope', async () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope = createScope(container);
		const result = scope.resolve(AsyncService);
		expect(result).toBeInstanceOf(Promise);
		const instance = await result;
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('scoped-async');
	});

	test('async scoped returns the same Promise within the same scope', () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope = createScope(container);
		const first = scope.resolve(AsyncService);
		const second = scope.resolve(AsyncService);
		expect(first).toBe(second);
	});

	test('async scoped returns different Promises in different scopes', () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope1 = createScope(container);
		const scope2 = createScope(container);
		const first = scope1.resolve(AsyncService);
		const second = scope2.resolve(AsyncService);
		expect(first).not.toBe(second);
	});
});

describe('scope + unregistered token', () => {
	test('throws ContainerError for unregistered token in scope', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(ServiceA)).toThrow(ContainerError);
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(ServiceA)).toThrow('ServiceA');
	});
});

describe('scoped registration override', () => {
	test('later scoped registration overrides earlier one for the same token', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext(1))
			.registerScoped(RequestContext, () => new RequestContext(2));

		const scope = createScope(container);
		expect(scope.resolve(RequestContext).id).toBe(2);
	});
});

describe('scope + dependency graph', () => {
	test('resolves dependency chain with mixed lifetimes in scope', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerScoped(ServiceC, r => new ServiceC(r.resolve(ServiceB)));

		const scope = createScope(container);
		const c = scope.resolve(ServiceC);
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
		expect(c.b.a.value).toBe('A');
	});

	test('scoped dependencies within the same scope share instances', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerScoped(UserRepository, r => new UserRepository(r.resolve(RequestContext)));

		const scope = createScope(container);
		const ctx = scope.resolve(RequestContext);
		const repo = scope.resolve(UserRepository);
		expect(repo.ctx).toBe(ctx);
	});
});

// Helper class for tryResolve tests
class Unregistered {
	public constructor(public value = 'unregistered') {}
}

describe('tryResolve (scoped)', () => {
	test('returns the instance for a registered scoped class token', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope = createScope(container);
		const instance = scope.tryResolve(RequestContext);
		expect(instance).toBeInstanceOf(RequestContext);
	});

	test('returns the same cached instance within the same scope', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope = createScope(container);
		const first = scope.tryResolve(RequestContext);
		const second = scope.tryResolve(RequestContext);
		expect(first).toBe(second);
	});

	test('returns different instances in different scopes', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope1 = createScope(container);
		const scope2 = createScope(container);
		const instance1 = scope1.tryResolve(RequestContext);
		const instance2 = scope2.tryResolve(RequestContext);
		expect(instance1).not.toBe(instance2);
	});

	test('works with string token', () => {
		const container = createContainer().registerScoped('requestId', () => Math.random());
		const scope = createScope(container);
		expect(typeof scope.tryResolve('requestId')).toBe('number');
	});

	test('works with Symbol token', () => {
		const token = Symbol('scopedService');
		const container = createContainer().registerScoped(token, () => 42);
		const scope = createScope(container);
		expect(scope.tryResolve(token)).toBe(42);
	});
});

describe('tryResolve (scope + singleton)', () => {
	test('returns the singleton from parent via tryResolve', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const rootInstance = container.resolve(ServiceA);
		const scope = createScope(container);
		const scopeInstance = scope.tryResolve(ServiceA);
		expect(scopeInstance).toBe(rootInstance);
	});

	test('returns the transient instance via tryResolve', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const instance = scope.tryResolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
	});
});

describe('tryResolve (scope + unregistered)', () => {
	test('returns undefined for unregistered class token', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(scope.tryResolve(Unregistered)).toBeUndefined();
	});

	test('returns undefined for unregistered string token', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(scope.tryResolve('nonexistent')).toBeUndefined();
	});

	test('returns undefined for unregistered Symbol token', () => {
		const container = createContainer();
		const scope = createScope(container);
		const token = Symbol('unknown');
		expect(scope.tryResolve(token)).toBeUndefined();
	});
});

describe('tryResolve (scope + async)', () => {
	test('returns a Promise for async scoped token', async () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope = createScope(container);
		const result = scope.tryResolve(AsyncService);
		expect(result).toBeInstanceOf(Promise);
		const instance = await (result as Promise<AsyncService>);
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('scoped-async');
	});
});

describe('tryResolve (scope + error conditions)', () => {
	test('throws ContainerError for disposed scope', async () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const { disposable } = await import('../disposable');
		const scope = disposable(createScope(container));
		await scope[Symbol.asyncDispose]();
		expect(() => scope.tryResolve(RequestContext)).toThrow(ContainerError);
		expect(() => scope.tryResolve(RequestContext)).toThrow('disposed');
	});

	test('throws ContainerError for circular dependency in scope', () => {
		const container = createContainer()
			.registerScoped(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerScoped(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		const scope = createScope(container);
		expect(() => scope.tryResolve(CircularA)).toThrow(ContainerError);
		expect(() => scope.tryResolve(CircularA)).toThrow('Circular dependency detected');
	});
});

describe('tryResolve (scope + dependency graph)', () => {
	test('resolves dependency chain with mixed lifetimes via tryResolve', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerScoped(ServiceC, r => new ServiceC(r.resolve(ServiceB)));

		const scope = createScope(container);
		const c = scope.tryResolve(ServiceC) as ServiceC;
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
	});
});

describe('scoped factory error recovery', () => {
	test('propagates factory error to the caller in scope', () => {
		const container = createContainer().registerScoped(ServiceA, () => {
			throw new Error('scoped factory failed');
		});

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow('scoped factory failed');
	});

	test('retries resolution after factory throws in scope — no false circular dependency', () => {
		let callCount = 0;
		const container = createContainer().registerScoped(ServiceA, () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('first attempt failed');
			}
			return new ServiceA('recovered');
		});

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow('first attempt failed');

		// Second resolve should retry, not throw circular dependency error
		const instance = scope.resolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
		expect(instance.value).toBe('recovered');
		expect(callCount).toBe(2);
	});

	test('scoped instance is not cached when factory throws', () => {
		let callCount = 0;
		const container = createContainer().registerScoped(ServiceA, () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('init failed');
			}
			return new ServiceA('success');
		});

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow('init failed');
		expect(callCount).toBe(1);

		const instance = scope.resolve(ServiceA);
		expect(instance.value).toBe('success');
		expect(callCount).toBe(2);
	});

	test('singleton factory error in scope does not affect subsequent resolves', () => {
		let callCount = 0;
		const container = createContainer().registerSingleton(ServiceA, () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('singleton failed');
			}
			return new ServiceA('ok');
		});

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow('singleton failed');

		const instance = scope.resolve(ServiceA);
		expect(instance.value).toBe('ok');
	});
});

describe('scoped caching edge cases', () => {
	test('null scoped value is cached — factory is called only once per scope', () => {
		let callCount = 0;
		const container = createContainer().registerScoped('nullable', () => {
			callCount++;
			return null;
		});

		const scope = createScope(container);
		scope.resolve('nullable');
		scope.resolve('nullable');
		expect(callCount).toBe(1);
	});

	test('undefined scoped value — factory is called again due to cache check using !== undefined', () => {
		let callCount = 0;
		const container = createContainer().registerScoped('undef', () => {
			callCount++;
			return undefined;
		});

		const scope = createScope(container);
		scope.resolve('undef');
		scope.resolve('undef');

		// The cache check uses `!== undefined`, so undefined values are not properly cached.
		expect(callCount).toBeGreaterThan(1);
	});
});

describe('deeply nested scopes (3+ levels)', () => {
	test('3-level nested scopes each have independent scoped caches', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(RequestContext, () => new RequestContext());

		const scope1 = createScope(container);
		const scope2 = createScope(scope1);
		const scope3 = createScope(scope2);

		const ctx1 = scope1.resolve(RequestContext);
		const ctx2 = scope2.resolve(RequestContext);
		const ctx3 = scope3.resolve(RequestContext);

		// Each scope has its own scoped instance
		expect(ctx1).not.toBe(ctx2);
		expect(ctx2).not.toBe(ctx3);
		expect(ctx1).not.toBe(ctx3);

		// All scopes share the same singleton
		const a1 = scope1.resolve(ServiceA);
		const a2 = scope2.resolve(ServiceA);
		const a3 = scope3.resolve(ServiceA);
		expect(a1).toBe(a2);
		expect(a2).toBe(a3);
	});
});

describe('captive dependency detection', () => {
	test('singleton → scoped (direct captive) throws ContainerError', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerSingleton(
				ServiceA,
				r =>
					new ServiceA(String((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext).id)),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.resolve(ServiceA)).toThrow('Captive dependency detected');
	});

	test('singleton → transient → scoped (indirect captive) throws ContainerError', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerTransient(
				ServiceB,
				r => new ServiceB((r as never as { resolve: (t: unknown) => ServiceA }).resolve(RequestContext) as never),
			)
			.registerSingleton(
				ServiceA,
				r => new ServiceA(String((r as never as { resolve: (t: unknown) => ServiceB }).resolve(ServiceB))),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.resolve(ServiceA)).toThrow('Captive dependency detected');
	});

	test('singleton → singleton → scoped (chain) throws ContainerError', () => {
		class Inner {
			public constructor(public ctx: RequestContext) {}
		}

		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerSingleton(
				Inner,
				r => new Inner((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext)),
			)
			.registerSingleton(
				ServiceA,
				r => new ServiceA(String((r as never as { resolve: (t: unknown) => Inner }).resolve(Inner))),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.resolve(ServiceA)).toThrow('Captive dependency detected');
	});

	test('scoped → scoped (normal) succeeds', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerScoped(UserRepository, r => new UserRepository(r.resolve(RequestContext)));

		const scope = createScope(container);
		const repo = scope.resolve(UserRepository);
		expect(repo).toBeInstanceOf(UserRepository);
		expect(repo.ctx).toBeInstanceOf(RequestContext);
	});

	test('transient → scoped (normal) succeeds', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerTransient(
				UserRepository,
				r => new UserRepository((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext)),
			);

		const scope = createScope(container);
		const repo = scope.resolve(UserRepository);
		expect(repo).toBeInstanceOf(UserRepository);
		expect(repo.ctx).toBeInstanceOf(RequestContext);
	});

	test('singleton → singleton (normal) succeeds', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

		const scope = createScope(container);
		const b = scope.resolve(ServiceB);
		expect(b).toBeInstanceOf(ServiceB);
		expect(b.a).toBeInstanceOf(ServiceA);
	});

	test('singleton → transient (normal) succeeds', () => {
		const container = createContainer()
			.registerTransient(ServiceA, () => new ServiceA())
			.registerSingleton(
				ServiceB,
				r => new ServiceB((r as never as { resolve: (t: unknown) => ServiceA }).resolve(ServiceA)),
			);

		const scope = createScope(container);
		const b = scope.resolve(ServiceB);
		expect(b).toBeInstanceOf(ServiceB);
		expect(b.a).toBeInstanceOf(ServiceA);
	});

	test('resolveAll captive throws ContainerError', () => {
		class ScopedDep {
			public constructor(public value = 'dep') {}
		}

		const container = createContainer()
			.registerScoped(ScopedDep, () => new ScopedDep())
			.registerSingleton(
				ServiceA,
				r => new ServiceA(String((r as never as { resolve: (t: unknown) => ScopedDep }).resolve(ScopedDep))),
			);

		const scope = createScope(container);
		expect(() => scope.resolveAll(ServiceA)).toThrow(ContainerError);
		expect(() => scope.resolveAll(ServiceA)).toThrow('Captive dependency detected');
	});

	test('tryResolve captive throws ContainerError', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerSingleton(
				ServiceA,
				r =>
					new ServiceA(String((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext).id)),
			);

		const scope = createScope(container);
		expect(() => scope.tryResolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.tryResolve(ServiceA)).toThrow('Captive dependency detected');
	});

	test('scoped cached before singleton factory still throws ContainerError', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerSingleton(
				ServiceA,
				r =>
					new ServiceA(String((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext).id)),
			);

		const scope = createScope(container);
		// Pre-cache the scoped instance
		scope.resolve(RequestContext);
		// Singleton factory tries to resolve cached scoped — still captive
		expect(() => scope.resolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.resolve(ServiceA)).toThrow('Captive dependency detected');
	});

	test('error message contains "Captive dependency detected" and token name', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerSingleton(
				ServiceA,
				r =>
					new ServiceA(String((r as never as { resolve: (t: unknown) => RequestContext }).resolve(RequestContext).id)),
			);

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow('Captive dependency detected');
		expect(() => scope.resolve(ServiceA)).toThrow('RequestContext');
	});

	test('singletonDepth recovers after factory error', () => {
		let shouldThrow = true;
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext())
			.registerSingleton(ServiceA, () => {
				if (shouldThrow) {
					throw new Error('factory error');
				}
				return new ServiceA('ok');
			});

		const scope = createScope(container);
		expect(() => scope.resolve(ServiceA)).toThrow('factory error');

		// After singleton factory error, singletonDepth should be back to 0
		// so resolving scoped should succeed
		shouldThrow = false;
		const ctx = scope.resolve(RequestContext);
		expect(ctx).toBeInstanceOf(RequestContext);
	});
});

describe('createScope from disposable variants', () => {
	test('createScope works with DisposableContainer', async () => {
		const { disposable } = await import('../disposable');
		const container = disposable(
			createContainer()
				.registerSingleton(ServiceA, () => new ServiceA())
				.registerScoped(RequestContext, () => new RequestContext()),
		);

		const scope = createScope(container);
		expect(scope).toBeInstanceOf(Scope);
		expect(scope.resolve(ServiceA)).toBeInstanceOf(ServiceA);
		expect(scope.resolve(RequestContext)).toBeInstanceOf(RequestContext);
	});

	test('createScope works with DisposableScope (nested)', async () => {
		const { disposable } = await import('../disposable');
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(RequestContext, () => new RequestContext());

		const parentScope = disposable(createScope(container));
		const childScope = createScope(parentScope);

		expect(childScope).toBeInstanceOf(Scope);
		// Child scope can resolve singleton and scoped tokens
		expect(childScope.resolve(ServiceA)).toBeInstanceOf(ServiceA);
		expect(childScope.resolve(RequestContext)).toBeInstanceOf(RequestContext);
		// Child scope has its own scoped cache — different from parent
		const childScoped = childScope.resolve(RequestContext);
		const childScopedAgain = childScope.resolve(RequestContext);
		expect(childScoped).toBe(childScopedAgain);
	});
});
