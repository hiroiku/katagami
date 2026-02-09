import { describe, expect, test } from 'bun:test';
import { ContainerError } from '../error';
import { createContainer } from '.';

// Helper classes for testing
class ServiceB {
	public constructor(public handlers: Handler[]) {}
}

class Handler {
	public constructor(public name: string) {}
}

class AsyncService {
	public constructor(public value: string) {}
}

describe('resolveAll (singleton)', () => {
	test('returns an array of all registered instances', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('log'))
			.registerSingleton(Handler, () => new Handler('metrics'));

		const handlers = container.resolveAll(Handler);
		expect(handlers).toHaveLength(2);
		expect(handlers[0].name).toBe('log');
		expect(handlers[1].name).toBe('metrics');
	});

	test('returns the same cached instances on subsequent calls', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('log'))
			.registerSingleton(Handler, () => new Handler('metrics'));

		const first = container.resolveAll(Handler);
		const second = container.resolveAll(Handler);
		expect(first[0]).toBe(second[0]);
		expect(first[1]).toBe(second[1]);
	});

	test('returns a single-element array for a single registration', () => {
		const container = createContainer().registerSingleton(Handler, () => new Handler('only'));
		const handlers = container.resolveAll(Handler);
		expect(handlers).toHaveLength(1);
		expect(handlers[0].name).toBe('only');
	});

	test('resolve returns the last registered instance', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('first'))
			.registerSingleton(Handler, () => new Handler('second'))
			.registerSingleton(Handler, () => new Handler('third'));

		expect(container.resolve(Handler).name).toBe('third');
	});

	test('resolve and resolveAll share singleton cache for the last registration', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('first'))
			.registerSingleton(Handler, () => new Handler('second'));

		const resolved = container.resolve(Handler);
		const all = container.resolveAll(Handler);

		// The last registration's instance should be the same object
		expect(all[1]).toBe(resolved);
	});

	test('resolveAll and then resolve share singleton cache', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('first'))
			.registerSingleton(Handler, () => new Handler('second'));

		const all = container.resolveAll(Handler);
		const resolved = container.resolve(Handler);

		expect(resolved).toBe(all[1]);
	});
});

describe('resolveAll (transient)', () => {
	test('creates new instances on every resolveAll call', () => {
		const container = createContainer()
			.registerTransient(Handler, () => new Handler('a'))
			.registerTransient(Handler, () => new Handler('b'));

		const first = container.resolveAll(Handler);
		const second = container.resolveAll(Handler);
		expect(first[0]).not.toBe(second[0]);
		expect(first[1]).not.toBe(second[1]);
	});
});

describe('resolveAll (mixed lifetimes)', () => {
	test('singleton factories are cached, transient factories create new instances', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('cached'))
			.registerTransient(Handler, () => new Handler('fresh'));

		const first = container.resolveAll(Handler);
		const second = container.resolveAll(Handler);

		// Singleton: same instance
		expect(first[0]).toBe(second[0]);
		// Transient: different instances
		expect(first[1]).not.toBe(second[1]);
	});
});

describe('resolveAll (PropertyKey tokens)', () => {
	test('works with string tokens', () => {
		const container = createContainer()
			.registerSingleton('plugin', () => 'plugin-a')
			.registerSingleton('plugin', () => 'plugin-b');

		const plugins = container.resolveAll('plugin');
		expect(plugins).toEqual(['plugin-a', 'plugin-b']);
	});

	test('works with Symbol tokens', () => {
		const token = Symbol('handler');
		const container = createContainer()
			.registerSingleton(token, () => 'first')
			.registerSingleton(token, () => 'second');

		const values = container.resolveAll(token);
		expect(values).toEqual(['first', 'second']);
	});
});

describe('resolveAll (async)', () => {
	test('returns an array of Promises for async factories', async () => {
		const container = createContainer()
			.registerSingleton(AsyncService, async () => new AsyncService('a'))
			.registerSingleton(AsyncService, async () => new AsyncService('b'));

		const promises = container.resolveAll(AsyncService);
		expect(promises).toHaveLength(2);
		expect(promises[0]).toBeInstanceOf(Promise);
		expect(promises[1]).toBeInstanceOf(Promise);

		const instances = await Promise.all(promises);
		expect(instances[0].value).toBe('a');
		expect(instances[1].value).toBe('b');
	});
});

describe('resolveAll (unregistered)', () => {
	test('throws ContainerError for unregistered token', () => {
		const container = createContainer();
		expect(() => (container as never as { resolveAll: (t: unknown) => unknown }).resolveAll(Handler)).toThrow(
			ContainerError,
		);
	});

	test('error message includes the token name', () => {
		const container = createContainer();
		expect(() => (container as never as { resolveAll: (t: unknown) => unknown }).resolveAll(Handler)).toThrow(
			'Handler',
		);
	});
});

describe('resolveAll (scoped from root)', () => {
	test('throws ContainerError when resolving scoped token from root container', () => {
		const container = createContainer().registerScoped(Handler, () => new Handler('scoped'));
		expect(() => (container as never as { resolveAll: (t: unknown) => unknown }).resolveAll(Handler)).toThrow(
			'Cannot resolve scoped token',
		);
	});
});

describe('resolveAll (circular dependency)', () => {
	test('detects circular dependency in resolveAll', () => {
		class CircA {
			public constructor(public b: CircB) {}
		}

		class CircB {
			public constructor(public a: CircA) {}
		}

		const container = createContainer()
			.registerSingleton(CircA, r => new CircA((r as never as { resolve: (t: unknown) => CircB }).resolve(CircB)))
			.registerSingleton(CircB, r => new CircB((r as never as { resolve: (t: unknown) => CircA }).resolve(CircA)));

		expect(() => container.resolveAll(CircA)).toThrow('Circular dependency detected');
	});
});

describe('resolveAll (disposed)', () => {
	test('throws ContainerError when resolving from a disposed container', async () => {
		const { disposable } = await import('../disposable');
		const container = disposable(
			createContainer()
				.registerSingleton(Handler, () => new Handler('a'))
				.registerSingleton(Handler, () => new Handler('b')),
		);

		await container[Symbol.asyncDispose]();
		expect(() => container.resolveAll(Handler)).toThrow(ContainerError);
		expect(() => container.resolveAll(Handler)).toThrow('disposed');
	});
});

describe('resolveAll in factory (plugin injection pattern)', () => {
	test('factory can use resolveAll to inject all implementations', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('log'))
			.registerSingleton(Handler, () => new Handler('metrics'))
			.registerSingleton(ServiceB, r => new ServiceB(r.resolveAll(Handler)));

		const bus = container.resolve(ServiceB);
		expect(bus.handlers).toHaveLength(2);
		expect(bus.handlers[0].name).toBe('log');
		expect(bus.handlers[1].name).toBe('metrics');
	});
});

describe('tryResolveAll', () => {
	test('returns undefined for unregistered token', () => {
		const container = createContainer();
		expect(container.tryResolveAll(Handler)).toBeUndefined();
	});

	test('returns an array for registered tokens', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('a'))
			.registerSingleton(Handler, () => new Handler('b'));

		const handlers = container.tryResolveAll(Handler) as Handler[];
		expect(handlers).toHaveLength(2);
		expect(handlers[0].name).toBe('a');
		expect(handlers[1].name).toBe('b');
	});

	test('returns undefined for unregistered string token', () => {
		const container = createContainer();
		expect(container.tryResolveAll('nonexistent')).toBeUndefined();
	});

	test('throws ContainerError for circular dependency', () => {
		class CircA {
			public constructor(public b: CircB) {}
		}

		class CircB {
			public constructor(public a: CircA) {}
		}

		const container = createContainer()
			.registerSingleton(CircA, r => new CircA((r as never as { resolve: (t: unknown) => CircB }).resolve(CircB)))
			.registerSingleton(CircB, r => new CircB((r as never as { resolve: (t: unknown) => CircA }).resolve(CircA)));

		expect(() => container.tryResolveAll(CircA)).toThrow('Circular dependency detected');
	});
});

describe('resolveAll preserves registration order', () => {
	test('instances are returned in the same order as registered', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('first'))
			.registerSingleton(Handler, () => new Handler('second'))
			.registerSingleton(Handler, () => new Handler('third'));

		const handlers = container.resolveAll(Handler);
		expect(handlers.map(h => h.name)).toEqual(['first', 'second', 'third']);
	});
});
