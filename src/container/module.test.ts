import { describe, expect, test } from 'bun:test';
import { createScope } from '../scope';
import { createContainer } from '.';

// Helper classes for testing
class ServiceA {
	public constructor(public value = 'A') {}
}

class ServiceB {
	public constructor(public a: ServiceA) {}
}

class ServiceC {
	public constructor(public value = 'C') {}
}

class AsyncService {
	public constructor(public value: string) {}
}

class ScopedService {
	public constructor(public id = Math.random()) {}
}

describe('use', () => {
	test('copies singleton registrations from source container', () => {
		const module = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const container = createContainer().use(module);
		const instance = container.resolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
		expect(instance.value).toBe('A');
	});

	test('copies transient registrations from source container', () => {
		const module = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const container = createContainer().use(module);
		const a = container.resolve(ServiceA);
		const b = container.resolve(ServiceA);
		expect(a).toBeInstanceOf(ServiceA);
		expect(a).not.toBe(b);
	});

	test('copies scoped registrations from source container', () => {
		const module = createContainer().registerScoped(ScopedService, () => new ScopedService());
		const container = createContainer().use(module);
		const scope = createScope(container);
		const instance = scope.resolve(ScopedService);
		expect(instance).toBeInstanceOf(ScopedService);
	});

	test('does not share singleton instance cache with source container', () => {
		const module = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const resolved = module.resolve(ServiceA);

		const container = createContainer().use(module);
		const instance = container.resolve(ServiceA);

		expect(resolved).toBeInstanceOf(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
		expect(instance).not.toBe(resolved);
	});

	test('resolves dependencies registered via use in factory callbacks', () => {
		const module = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const container = createContainer()
			.use(module)
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

		const b = container.resolve(ServiceB);
		expect(b).toBeInstanceOf(ServiceB);
		expect(b.a).toBeInstanceOf(ServiceA);
	});

	test('supports chaining multiple use calls', () => {
		const moduleA = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const moduleC = createContainer().registerSingleton(ServiceC, () => new ServiceC());

		const container = createContainer().use(moduleA).use(moduleC);

		expect(container.resolve(ServiceA)).toBeInstanceOf(ServiceA);
		expect(container.resolve(ServiceC)).toBeInstanceOf(ServiceC);
	});

	test('supports module composition — module using another module', () => {
		const infraModule = createContainer().registerSingleton(ServiceA, () => new ServiceA());

		const appModule = createContainer()
			.use(infraModule)
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

		const container = createContainer().use(appModule);

		const b = container.resolve(ServiceB);
		expect(b).toBeInstanceOf(ServiceB);
		expect(b.a).toBeInstanceOf(ServiceA);
	});

	test('supports method chaining after use', () => {
		const module = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const container = createContainer()
			.use(module)
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerTransient(ServiceC, () => new ServiceC());

		expect(container.resolve(ServiceA)).toBeInstanceOf(ServiceA);
		expect(container.resolve(ServiceB)).toBeInstanceOf(ServiceB);
		expect(container.resolve(ServiceC)).toBeInstanceOf(ServiceC);
	});

	test('works with PropertyKey tokens', () => {
		const module = createContainer()
			.registerSingleton('greeting', () => 'hello')
			.registerSingleton('count', () => 42);

		const container = createContainer().use(module);

		expect(container.resolve('greeting')).toBe('hello');
		expect(container.resolve('count')).toBe(42);
	});

	test('works with Symbol tokens', () => {
		const token = Symbol('test');
		const module = createContainer().registerSingleton(token, () => 'symbol-value');
		const container = createContainer().use(module);

		expect(container.resolve(token)).toBe('symbol-value');
	});

	test('works with async factories', async () => {
		const module = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));

		const container = createContainer().use(module);
		const instance = await container.resolve(AsyncService);
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('async');
	});

	test('later use overwrites earlier registrations for the same token', () => {
		const moduleA = createContainer().registerSingleton(ServiceA, () => new ServiceA('first'));
		const moduleB = createContainer().registerSingleton(ServiceA, () => new ServiceA('second'));

		const container = createContainer().use(moduleA).use(moduleB);
		expect(container.resolve(ServiceA).value).toBe('second');
	});

	test('scoped tokens from module are resolvable via createScope', () => {
		const module = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(ScopedService, () => new ScopedService());

		const container = createContainer().use(module);
		const scope1 = createScope(container);
		const scope2 = createScope(container);

		// Same within a scope
		expect(scope1.resolve(ScopedService)).toBe(scope1.resolve(ScopedService));
		// Different across scopes
		expect(scope1.resolve(ScopedService)).not.toBe(scope2.resolve(ScopedService));
		// Singleton shared
		expect(scope1.resolve(ServiceA)).toBe(scope2.resolve(ServiceA));
	});

	test('use with an empty container is a no-op', () => {
		const empty = createContainer();
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.use(empty);

		expect(container.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('use copies registrations from a disposed container (no disposed check on source)', async () => {
		const { disposable } = await import('../disposable');
		const module = disposable(createContainer().registerSingleton(ServiceA, () => new ServiceA()));

		// Resolve and then dispose the module container
		await module[Symbol.asyncDispose]();

		// use() only iterates over registrations map — it does not check disposed state
		const container = createContainer().use(module);
		const instance = container.resolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
	});
});
