import { describe, expect, test } from 'bun:test';
import { createContainer } from '../container';
import { disposable } from '../disposable';
import { ContainerError } from '../error';
import { createScope } from '../scope';
import { lazy } from '.';

// Helper classes for testing
class ServiceA {
	public constructor(public value = 'A') {}

	public getValue(): string {
		return this.value;
	}
}

class CountingService {
	public static count = 0;

	public constructor() {
		CountingService.count++;
	}
}

class WithGetter {
	#secret = 42;

	public get secret(): number {
		return this.#secret;
	}

	public set secret(v: number) {
		this.#secret = v;
	}
}

// ---------------------------------------------------------------------------
// Basic behavior
// ---------------------------------------------------------------------------

describe('lazy — basic behavior', () => {
	test('defers resolution until first property access', () => {
		let factoryCalled = false;
		const container = createContainer().registerSingleton(ServiceA, () => {
			factoryCalled = true;
			return new ServiceA();
		});

		const proxy = lazy(container, ServiceA);
		expect(factoryCalled).toBe(false);

		// Trigger resolution
		proxy.value;
		expect(factoryCalled).toBe(true);
	});

	test('caches resolved instance', () => {
		CountingService.count = 0;
		const container = createContainer().registerSingleton(CountingService, () => new CountingService());

		const proxy = lazy(container, CountingService);
		// Access multiple times
		void (proxy as unknown as Record<string, unknown>).constructor;
		void (proxy as unknown as Record<string, unknown>).constructor;
		void (proxy as unknown as Record<string, unknown>).constructor;

		expect(CountingService.count).toBe(1);
	});

	test('reads properties from resolved instance', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA('hello'));
		const proxy = lazy(container, ServiceA);

		expect(proxy.value).toBe('hello');
	});

	test('calls methods with correct this binding', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA('bound'));
		const proxy = lazy(container, ServiceA);

		expect(proxy.getValue()).toBe('bound');
	});

	test('method reference retains this binding', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA('ref'));
		const proxy = lazy(container, ServiceA);

		const fn = proxy.getValue;
		expect(fn()).toBe('ref');
	});
});

// ---------------------------------------------------------------------------
// Lifetime behavior
// ---------------------------------------------------------------------------

describe('lazy — lifetimes', () => {
	test('singleton shares instance across direct and lazy resolve', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());

		const direct = container.resolve(ServiceA);
		const proxy = lazy(container, ServiceA);

		expect(proxy.value).toBe(direct.value);
		// They should be the same singleton instance
		direct.value = 'modified';
		expect(proxy.value).toBe('modified');
	});

	test('transient creates independent instance per lazy proxy', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());

		const proxy1 = lazy(container, ServiceA);
		const proxy2 = lazy(container, ServiceA);

		proxy1.value = 'first';
		expect(proxy2.value).toBe('A'); // independent default
	});

	test('scoped caches within scope', () => {
		const container = createContainer().registerScoped(ServiceA, () => new ServiceA());
		const scope = createScope(container);

		const direct = scope.resolve(ServiceA);
		const proxy = lazy(scope, ServiceA);

		direct.value = 'scoped';
		expect(proxy.value).toBe('scoped');
	});
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('lazy — error propagation', () => {
	test('throws on first access for unregistered token', () => {
		const container = createContainer();

		const proxy = lazy(container as never as { resolve(token: unknown): unknown }, ServiceA);

		expect(() => (proxy as ServiceA).value).toThrow(ContainerError);
	});

	test('retries after factory error', () => {
		let shouldFail = true;
		const container = createContainer().registerSingleton(ServiceA, () => {
			if (shouldFail) {
				throw new Error('temporary failure');
			}
			return new ServiceA('recovered');
		});

		const proxy = lazy(container, ServiceA);

		// First access fails
		expect(() => proxy.value).toThrow('temporary failure');

		// Fix the factory
		shouldFail = false;

		// Retry succeeds
		expect(proxy.value).toBe('recovered');
	});

	test('throws on access after container disposal', async () => {
		const container = disposable(createContainer().registerSingleton(ServiceA, () => new ServiceA()));

		const proxy = lazy(container, ServiceA);

		await container[Symbol.asyncDispose]();

		expect(() => proxy.value).toThrow(ContainerError);
	});
});

// ---------------------------------------------------------------------------
// Proxy transparency
// ---------------------------------------------------------------------------

describe('lazy — proxy transparency', () => {
	test('getPrototypeOf returns correct prototype', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		expect(Object.getPrototypeOf(proxy)).toBe(ServiceA.prototype);
	});

	test('has operator works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		expect('value' in proxy).toBe(true);
		expect('nonexistent' in proxy).toBe(false);
	});

	test('ownKeys returns instance keys', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		expect(Object.keys(proxy)).toEqual(['value']);
	});

	test('set writes to real instance', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		proxy.value = 'updated';
		expect(proxy.value).toBe('updated');
		expect(container.resolve(ServiceA).value).toBe('updated');
	});

	test('getOwnPropertyDescriptor works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		const desc = Object.getOwnPropertyDescriptor(proxy, 'value');
		expect(desc).toBeDefined();
		expect(desc?.value).toBe('A');
	});

	test('defineProperty works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		Object.defineProperty(proxy, 'extra', { configurable: true, value: 123 });
		expect((container.resolve(ServiceA) as unknown as Record<string, unknown>).extra).toBe(123);
	});

	test('deleteProperty works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		// Trigger resolution then delete
		expect(proxy.value).toBe('A');
		delete (proxy as unknown as Record<string, unknown>).value;
		expect(proxy.value).toBeUndefined();
	});

	test('isExtensible works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		expect(Object.isExtensible(proxy)).toBe(true);
	});

	test('preventExtensions works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		Object.preventExtensions(proxy);
		expect(Object.isExtensible(proxy)).toBe(false);
	});

	test('setPrototypeOf works', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const proxy = lazy(container, ServiceA);

		const proto = { custom: true };
		Object.setPrototypeOf(proxy, proto);
		expect(Object.getPrototypeOf(proxy)).toBe(proto);
	});

	test('getter/setter work through proxy', () => {
		const container = createContainer().registerSingleton(WithGetter, () => new WithGetter());
		const proxy = lazy(container, WithGetter);

		expect(proxy.secret).toBe(42);
		proxy.secret = 99;
		expect(proxy.secret).toBe(99);
	});
});

// ---------------------------------------------------------------------------
// Disposable integration
// ---------------------------------------------------------------------------

describe('lazy — disposable integration', () => {
	test('works with DisposableContainer', () => {
		const container = disposable(createContainer().registerSingleton(ServiceA, () => new ServiceA('disposable')));

		const proxy = lazy(container, ServiceA);
		expect(proxy.value).toBe('disposable');
	});

	test('works with DisposableScope', () => {
		const container = createContainer().registerScoped(ServiceA, () => new ServiceA('scoped-disposable'));
		const scope = disposable(createScope(container));

		const proxy = lazy(scope, ServiceA);
		expect(proxy.value).toBe('scoped-disposable');
	});
});
