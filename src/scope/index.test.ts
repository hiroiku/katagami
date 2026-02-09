import { describe, expect, test } from 'bun:test';
import { Container, createContainer } from '../container';
import { ContainerError } from '../error';
import { Scope } from '.';

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
		const scope = container.createScope();
		expect(scope.resolve(RequestContext)).toBeInstanceOf(RequestContext);
	});

	test('works with string token', () => {
		const container = createContainer().registerScoped('requestId', () => Math.random());
		const scope = container.createScope();
		expect(typeof scope.resolve('requestId')).toBe('number');
	});

	test('works with Symbol token', () => {
		const token = Symbol('scopedService');
		const container = createContainer().registerScoped(token, () => 42);
		const scope = container.createScope();
		expect(scope.resolve(token)).toBe(42);
	});
});

describe('createScope', () => {
	test('returns a Scope instance', () => {
		const container = createContainer();
		const scope = container.createScope();
		expect(scope).toBeInstanceOf(Scope);
	});

	test('scope can resolve singleton from parent', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = container.createScope();
		expect(scope.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('scope can resolve transient from parent', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = container.createScope();
		expect(scope.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});
});

describe('resolve (scoped)', () => {
	test('returns the same instance within the same scope', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope = container.createScope();
		const first = scope.resolve(RequestContext);
		const second = scope.resolve(RequestContext);
		expect(first).toBe(second);
	});

	test('returns different instances in different scopes', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope1 = container.createScope();
		const scope2 = container.createScope();
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
		const scope = container.createScope();
		const scopeInstance = scope.resolve(ServiceA);
		expect(scopeInstance).toBe(rootInstance);
	});

	test('singletons created in scope are shared with the parent', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = container.createScope();
		const scopeInstance = scope.resolve(ServiceA);
		const rootInstance = container.resolve(ServiceA);
		expect(scopeInstance).toBe(rootInstance);
	});

	test('singletons are shared across different scopes', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope1 = container.createScope();
		const scope2 = container.createScope();
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

		const scope = container.createScope();
		const repo = scope.resolve(UserRepository);
		expect(repo).toBeInstanceOf(UserRepository);
		expect(repo.ctx).toBeInstanceOf(RequestContext);
	});
});

describe('scoped + transient interaction', () => {
	test('transient creates new instances even within a scope', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = container.createScope();
		const first = scope.resolve(ServiceA);
		const second = scope.resolve(ServiceA);
		expect(first).not.toBe(second);
	});
});

describe('nested scopes', () => {
	test('nested scope has its own scoped cache', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const parentScope = container.createScope();
		const childScope = parentScope.createScope();
		const parentInstance = parentScope.resolve(RequestContext);
		const childInstance = childScope.resolve(RequestContext);
		expect(parentInstance).not.toBe(childInstance);
	});

	test('nested scope shares singleton instances', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const parentScope = container.createScope();
		const childScope = parentScope.createScope();
		const parentInstance = parentScope.resolve(ServiceA);
		const childInstance = childScope.resolve(ServiceA);
		expect(parentInstance).toBe(childInstance);
	});

	test('nested scope returns a Scope instance', () => {
		const container = createContainer();
		const scope = container.createScope();
		const nested = scope.createScope();
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

		const scope = container.createScope();
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

		const scope = container.createScope();
		expect(() => scope.resolve(CircularA)).toThrow('CircularA -> CircularB -> CircularA');
	});

	test('detects circular dependency with mixed lifetimes in scope', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerScoped(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		const scope = container.createScope();
		expect(() => scope.resolve(CircularA)).toThrow('Circular dependency detected');
	});
});

describe('scoped + async factory', () => {
	test('async scoped factory resolves within scope', async () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope = container.createScope();
		const result = scope.resolve(AsyncService);
		expect(result).toBeInstanceOf(Promise);
		const instance = await result;
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('scoped-async');
	});

	test('async scoped returns the same Promise within the same scope', () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope = container.createScope();
		const first = scope.resolve(AsyncService);
		const second = scope.resolve(AsyncService);
		expect(first).toBe(second);
	});

	test('async scoped returns different Promises in different scopes', () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope1 = container.createScope();
		const scope2 = container.createScope();
		const first = scope1.resolve(AsyncService);
		const second = scope2.resolve(AsyncService);
		expect(first).not.toBe(second);
	});
});

describe('scope + unregistered token', () => {
	test('throws ContainerError for unregistered token in scope', () => {
		const container = createContainer();
		const scope = container.createScope();
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(ServiceA)).toThrow(ContainerError);
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(ServiceA)).toThrow('ServiceA');
	});
});

describe('scoped registration override', () => {
	test('later scoped registration overrides earlier one for the same token', () => {
		const container = createContainer()
			.registerScoped(RequestContext, () => new RequestContext(1))
			.registerScoped(RequestContext, () => new RequestContext(2));

		const scope = container.createScope();
		expect(scope.resolve(RequestContext).id).toBe(2);
	});
});

describe('scope + dependency graph', () => {
	test('resolves dependency chain with mixed lifetimes in scope', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerScoped(ServiceC, r => new ServiceC(r.resolve(ServiceB)));

		const scope = container.createScope();
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

		const scope = container.createScope();
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
		const scope = container.createScope();
		const instance = scope.tryResolve(RequestContext);
		expect(instance).toBeInstanceOf(RequestContext);
	});

	test('returns the same cached instance within the same scope', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope = container.createScope();
		const first = scope.tryResolve(RequestContext);
		const second = scope.tryResolve(RequestContext);
		expect(first).toBe(second);
	});

	test('returns different instances in different scopes', () => {
		const container = createContainer().registerScoped(RequestContext, () => new RequestContext());
		const scope1 = container.createScope();
		const scope2 = container.createScope();
		const instance1 = scope1.tryResolve(RequestContext);
		const instance2 = scope2.tryResolve(RequestContext);
		expect(instance1).not.toBe(instance2);
	});

	test('works with string token', () => {
		const container = createContainer().registerScoped('requestId', () => Math.random());
		const scope = container.createScope();
		expect(typeof scope.tryResolve('requestId')).toBe('number');
	});

	test('works with Symbol token', () => {
		const token = Symbol('scopedService');
		const container = createContainer().registerScoped(token, () => 42);
		const scope = container.createScope();
		expect(scope.tryResolve(token)).toBe(42);
	});
});

describe('tryResolve (scope + singleton)', () => {
	test('returns the singleton from parent via tryResolve', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const rootInstance = container.resolve(ServiceA);
		const scope = container.createScope();
		const scopeInstance = scope.tryResolve(ServiceA);
		expect(scopeInstance).toBe(rootInstance);
	});

	test('returns the transient instance via tryResolve', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = container.createScope();
		const instance = scope.tryResolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
	});
});

describe('tryResolve (scope + unregistered)', () => {
	test('returns undefined for unregistered class token', () => {
		const container = createContainer();
		const scope = container.createScope();
		expect(scope.tryResolve(Unregistered)).toBeUndefined();
	});

	test('returns undefined for unregistered string token', () => {
		const container = createContainer();
		const scope = container.createScope();
		expect(scope.tryResolve('nonexistent')).toBeUndefined();
	});

	test('returns undefined for unregistered Symbol token', () => {
		const container = createContainer();
		const scope = container.createScope();
		const token = Symbol('unknown');
		expect(scope.tryResolve(token)).toBeUndefined();
	});
});

describe('tryResolve (scope + async)', () => {
	test('returns a Promise for async scoped token', async () => {
		const container = createContainer().registerScoped(AsyncService, async () => new AsyncService('scoped-async'));
		const scope = container.createScope();
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
		const scope = container.createScope();
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

		const scope = container.createScope();
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

		const scope = container.createScope();
		const c = scope.tryResolve(ServiceC) as ServiceC;
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
	});
});
