import { describe, expect, test } from 'bun:test';
import { createContainer } from '../container';
import { ContainerError } from '../error';
import { createScope } from '.';

// Helper classes for testing
class Handler {
	public constructor(public name: string) {}
}

class AsyncService {
	public constructor(public value: string) {}
}

describe('Scope resolveAll (singleton)', () => {
	test('resolves all singleton instances, sharing with parent container', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('log'))
			.registerSingleton(Handler, () => new Handler('metrics'));

		const containerHandlers = createScope(container).resolveAll(Handler);
		const scope = createScope(container);
		const scopeHandlers = scope.resolveAll(Handler);

		// Same instances shared via singleton cache
		expect(scopeHandlers[0]).toBe(containerHandlers[0]);
		expect(scopeHandlers[1]).toBe(containerHandlers[1]);
	});

	test('singleton created via scope is shared back to container', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('first'))
			.registerSingleton(Handler, () => new Handler('second'));

		const scope = createScope(container);
		const scopeHandlers = scope.resolveAll(Handler);
		const containerHandlers = createScope(container).resolveAll(Handler);

		expect(containerHandlers[0]).toBe(scopeHandlers[0]);
		expect(containerHandlers[1]).toBe(scopeHandlers[1]);
	});
});

describe('Scope resolveAll (scoped)', () => {
	test('resolves all scoped instances within a scope', () => {
		const container = createContainer()
			.registerScoped(Handler, () => new Handler('a'))
			.registerScoped(Handler, () => new Handler('b'));

		const scope = createScope(container);
		const handlers = scope.resolveAll(Handler);
		expect(handlers).toHaveLength(2);
		expect(handlers[0].name).toBe('a');
		expect(handlers[1].name).toBe('b');
	});

	test('scoped instances are cached within the same scope', () => {
		const container = createContainer()
			.registerScoped(Handler, () => new Handler('a'))
			.registerScoped(Handler, () => new Handler('b'));

		const scope = createScope(container);
		const first = scope.resolveAll(Handler);
		const second = scope.resolveAll(Handler);
		expect(first[0]).toBe(second[0]);
		expect(first[1]).toBe(second[1]);
	});

	test('different scopes have different scoped instances', () => {
		const container = createContainer()
			.registerScoped(Handler, () => new Handler('a'))
			.registerScoped(Handler, () => new Handler('b'));

		const scope1 = createScope(container);
		const scope2 = createScope(container);
		const handlers1 = scope1.resolveAll(Handler);
		const handlers2 = scope2.resolveAll(Handler);

		expect(handlers1[0]).not.toBe(handlers2[0]);
		expect(handlers1[1]).not.toBe(handlers2[1]);
	});
});

describe('Scope resolveAll (transient)', () => {
	test('creates new instances on every resolveAll call', () => {
		const container = createContainer()
			.registerTransient(Handler, () => new Handler('a'))
			.registerTransient(Handler, () => new Handler('b'));

		const scope = createScope(container);
		const first = scope.resolveAll(Handler);
		const second = scope.resolveAll(Handler);
		expect(first[0]).not.toBe(second[0]);
		expect(first[1]).not.toBe(second[1]);
	});
});

describe('Scope resolveAll (mixed lifetimes)', () => {
	test('mixed singleton and scoped instances behave correctly', () => {
		const container = createContainer()
			.registerSingleton(Handler, () => new Handler('singleton'))
			.registerScoped(Handler, () => new Handler('scoped'));

		const scope1 = createScope(container);
		const scope2 = createScope(container);

		const handlers1 = scope1.resolveAll(Handler);
		const handlers2 = scope2.resolveAll(Handler);

		// Singleton: shared across scopes
		expect(handlers1[0]).toBe(handlers2[0]);
		// Scoped: different per scope
		expect(handlers1[1]).not.toBe(handlers2[1]);
	});
});

describe('Scope resolveAll (PropertyKey tokens)', () => {
	test('works with string tokens in scope', () => {
		const container = createContainer()
			.registerScoped('handler', () => 'handler-a')
			.registerScoped('handler', () => 'handler-b');

		const scope = createScope(container);
		const values = scope.resolveAll('handler');
		expect(values).toEqual(['handler-a', 'handler-b']);
	});
});

describe('Scope resolveAll (async)', () => {
	test('returns an array of Promises for async scoped factories', async () => {
		const container = createContainer()
			.registerScoped(AsyncService, async () => new AsyncService('a'))
			.registerScoped(AsyncService, async () => new AsyncService('b'));

		const scope = createScope(container);
		const promises = scope.resolveAll(AsyncService);
		expect(promises).toHaveLength(2);

		const instances = await Promise.all(promises);
		expect(instances[0].value).toBe('a');
		expect(instances[1].value).toBe('b');
	});
});

describe('Scope resolveAll (unregistered)', () => {
	test('throws ContainerError for unregistered token', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(() => (scope as never as { resolveAll: (t: unknown) => unknown }).resolveAll(Handler)).toThrow(
			ContainerError,
		);
	});
});

describe('Scope resolveAll (circular dependency)', () => {
	test('detects circular dependency in scope resolveAll', () => {
		class CircA {
			public constructor(public b: CircB) {}
		}

		class CircB {
			public constructor(public a: CircA) {}
		}

		const container = createContainer()
			.registerScoped(CircA, r => new CircA((r as never as { resolve: (t: unknown) => CircB }).resolve(CircB)))
			.registerScoped(CircB, r => new CircB((r as never as { resolve: (t: unknown) => CircA }).resolve(CircA)));

		const scope = createScope(container);
		expect(() => scope.resolveAll(CircA)).toThrow('Circular dependency detected');
	});
});

describe('Scope resolveAll (disposed)', () => {
	test('throws ContainerError when resolving from a disposed scope', async () => {
		const { disposable } = await import('../disposable');
		const container = createContainer()
			.registerScoped(Handler, () => new Handler('a'))
			.registerScoped(Handler, () => new Handler('b'));

		const scope = disposable(createScope(container));
		await scope[Symbol.asyncDispose]();

		expect(() => scope.resolveAll(Handler)).toThrow(ContainerError);
		expect(() => scope.resolveAll(Handler)).toThrow('disposed');
	});
});

describe('Scope tryResolveAll', () => {
	test('returns undefined for unregistered token', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(scope.tryResolveAll(Handler)).toBeUndefined();
	});

	test('returns an array for registered scoped tokens', () => {
		const container = createContainer()
			.registerScoped(Handler, () => new Handler('a'))
			.registerScoped(Handler, () => new Handler('b'));

		const scope = createScope(container);
		const handlers = scope.tryResolveAll(Handler) as Handler[];
		expect(handlers).toHaveLength(2);
		expect(handlers[0].name).toBe('a');
	});
});

describe('Scope resolve and resolveAll cache sharing', () => {
	test('resolve and resolveAll share scoped cache for the last registration', () => {
		const container = createContainer()
			.registerScoped(Handler, () => new Handler('first'))
			.registerScoped(Handler, () => new Handler('second'));

		const scope = createScope(container);
		const resolved = scope.resolve(Handler);
		const all = scope.resolveAll(Handler);

		// The last registration's instance should be the same object
		expect(all[1]).toBe(resolved);
	});
});

describe('Scope resolveAll in factory', () => {
	test('scoped factory can use resolveAll to inject all implementations', () => {
		class EventBus {
			public constructor(public handlers: Handler[]) {}
		}

		const container = createContainer()
			.registerScoped(Handler, () => new Handler('log'))
			.registerScoped(Handler, () => new Handler('metrics'))
			.registerScoped(EventBus, r => new EventBus(r.resolveAll(Handler)));

		const scope = createScope(container);
		const bus = scope.resolve(EventBus);
		expect(bus.handlers).toHaveLength(2);
		expect(bus.handlers[0].name).toBe('log');
		expect(bus.handlers[1].name).toBe('metrics');
	});
});
