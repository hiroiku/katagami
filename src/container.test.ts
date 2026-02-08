import { describe, expect, test } from 'bun:test';
import { Container, createContainer } from './container';
import { ContainerError } from './error';

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

class DependsOnAsync {
	public constructor(public async: AsyncService) {}
}

describe('createContainer', () => {
	test('returns a Container instance', () => {
		const container = createContainer();
		expect(container).toBeInstanceOf(Container);
	});
});

describe('registerSingleton', () => {
	test('returns the container for method chaining', () => {
		const container = createContainer();
		const result = container.registerSingleton(ServiceA, () => new ServiceA());
		expect(result).toBeInstanceOf(Container);
	});

	test('works with class token', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		expect(container.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('works with string token', () => {
		const container = createContainer().registerSingleton('greeting', () => 'hello');
		expect(container.resolve('greeting')).toBe('hello');
	});

	test('works with Symbol token', () => {
		const token = Symbol('myService');
		const container = createContainer().registerSingleton(token, () => 42);
		expect(container.resolve(token)).toBe(42);
	});
});

describe('registerTransient', () => {
	test('returns the container for method chaining', () => {
		const container = createContainer();
		const result = container.registerTransient(ServiceA, () => new ServiceA());
		expect(result).toBeInstanceOf(Container);
	});

	test('works with class token', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		expect(container.resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('works with string token', () => {
		const container = createContainer().registerTransient('value', () => Math.random());
		expect(typeof container.resolve('value')).toBe('number');
	});
});

describe('resolve (singleton)', () => {
	test('creates instance on first resolve', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const instance = container.resolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
		expect(instance.value).toBe('A');
	});

	test('returns the same instance on subsequent resolves', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const first = container.resolve(ServiceA);
		const second = container.resolve(ServiceA);
		expect(first).toBe(second);
	});
});

describe('resolve (transient)', () => {
	test('creates a new instance on every resolve', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const first = container.resolve(ServiceA);
		const second = container.resolve(ServiceA);
		expect(first).not.toBe(second);
		expect(first).toBeInstanceOf(ServiceA);
		expect(second).toBeInstanceOf(ServiceA);
	});
});

describe('resolve (unregistered)', () => {
	test('throws ContainerError for unregistered token', () => {
		const container = createContainer();
		expect(() => container.resolve(ServiceA)).toThrow(ContainerError);
	});

	test('error message includes the token name', () => {
		const container = createContainer();
		expect(() => container.resolve(ServiceA)).toThrow('ServiceA');
	});

	test('error message includes symbol description', () => {
		const container = createContainer();
		const token = Symbol('myToken');
		expect(() => container.resolve(token)).toThrow('myToken');
	});

	test('error message includes string token', () => {
		const container = createContainer();
		expect(() => container.resolve('unknownService')).toThrow('unknownService');
	});
});

describe('Resolver injection', () => {
	test('factory can resolve other registered tokens', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

		const b = container.resolve(ServiceB);
		expect(b).toBeInstanceOf(ServiceB);
		expect(b.a).toBeInstanceOf(ServiceA);
	});
});

describe('dependency graph', () => {
	test('resolves A -> B -> C dependency chain', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerSingleton(ServiceC, r => new ServiceC(r.resolve(ServiceB)));

		const c = container.resolve(ServiceC);
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
		expect(c.b.a.value).toBe('A');
	});
});

describe('async singleton (class)', () => {
	test('resolves to a Promise that yields the correct instance', async () => {
		const container = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));
		const result = container.resolve(AsyncService);
		expect(result).toBeInstanceOf(Promise);
		const instance = await result;
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('async');
	});

	test('returns the same Promise on subsequent resolves', () => {
		const container = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));
		const first = container.resolve(AsyncService);
		const second = container.resolve(AsyncService);
		expect(first).toBe(second);
	});
});

describe('async singleton (string)', () => {
	test('resolves async factory with string token', async () => {
		const container = createContainer().registerSingleton('asyncGreeting', async () => 'hello async');
		const result = await container.resolve('asyncGreeting');
		expect(result).toBe('hello async');
	});
});

describe('async transient', () => {
	test('creates a new Promise on every resolve', async () => {
		const container = createContainer().registerTransient(AsyncService, async () => new AsyncService('transient'));
		const first = container.resolve(AsyncService);
		const second = container.resolve(AsyncService);
		expect(first).not.toBe(second);
		expect(await first).toBeInstanceOf(AsyncService);
		expect(await second).toBeInstanceOf(AsyncService);
	});
});

describe('async dependencies', () => {
	test('async factory can resolve sync dependency', async () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(AsyncService, r => {
				const a = r.resolve(ServiceA);
				return Promise.resolve(new AsyncService(a.value));
			});

		const instance = await container.resolve(AsyncService);
		expect(instance.value).toBe('A');
	});

	test('async factory can await async dependency', async () => {
		const container = createContainer()
			.registerSingleton(AsyncService, async () => new AsyncService('dep'))
			.registerSingleton(DependsOnAsync, async r => {
				const async = await r.resolve(AsyncService);
				return new DependsOnAsync(async);
			});

		const instance = await container.resolve(DependsOnAsync);
		expect(instance).toBeInstanceOf(DependsOnAsync);
		expect(instance.async).toBeInstanceOf(AsyncService);
		expect(instance.async.value).toBe('dep');
	});
});

describe('type inference (sync/async mixed)', () => {
	test('sync resolve returns value, async resolve returns Promise', async () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(AsyncService, async () => new AsyncService('mixed'));

		const syncResult = container.resolve(ServiceA);
		const asyncResult = container.resolve(AsyncService);

		expect(syncResult).toBeInstanceOf(ServiceA);
		expect(asyncResult).toBeInstanceOf(Promise);
		expect(await asyncResult).toBeInstanceOf(AsyncService);
	});
});
