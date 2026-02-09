import { describe, expect, test } from 'bun:test';
import { disposable } from '../disposable';
import { ContainerError } from '../error';
import { createScope } from '../scope';
import { Container, createContainer } from '.';

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
		expect(createScope(container).resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('works with string token', () => {
		const container = createContainer().registerSingleton('greeting', () => 'hello');
		expect(createScope(container).resolve('greeting')).toBe('hello');
	});

	test('works with Symbol token', () => {
		const token = Symbol('myService');
		const container = createContainer().registerSingleton(token, () => 42);
		expect(createScope(container).resolve(token)).toBe(42);
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
		expect(createScope(container).resolve(ServiceA)).toBeInstanceOf(ServiceA);
	});

	test('works with string token', () => {
		const container = createContainer().registerTransient('value', () => Math.random());
		expect(typeof createScope(container).resolve('value')).toBe('number');
	});
});

describe('resolve (singleton)', () => {
	test('creates instance on first resolve', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const instance = scope.resolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
		expect(instance.value).toBe('A');
	});

	test('returns the same instance on subsequent resolves', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const first = scope.resolve(ServiceA);
		const second = scope.resolve(ServiceA);
		expect(first).toBe(second);
	});
});

describe('resolve (transient)', () => {
	test('creates a new instance on every resolve', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const first = scope.resolve(ServiceA);
		const second = scope.resolve(ServiceA);
		expect(first).not.toBe(second);
		expect(first).toBeInstanceOf(ServiceA);
		expect(second).toBeInstanceOf(ServiceA);
	});
});

describe('registration override', () => {
	test('later registration overrides earlier one for the same token', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA('first'))
			.registerSingleton(ServiceA, () => new ServiceA('second'));

		expect(createScope(container).resolve(ServiceA).value).toBe('second');
	});

	test('lifetime can change on override (singleton -> transient)', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA('singleton'))
			.registerTransient(ServiceA, () => new ServiceA('transient'));

		const scope = createScope(container);
		const first = scope.resolve(ServiceA);
		const second = scope.resolve(ServiceA);
		expect(first).not.toBe(second);
	});

	test('lifetime can change on override (transient -> singleton)', () => {
		const container = createContainer()
			.registerTransient(ServiceA, () => new ServiceA('transient'))
			.registerSingleton(ServiceA, () => new ServiceA('singleton'));

		const scope = createScope(container);
		const first = scope.resolve(ServiceA);
		const second = scope.resolve(ServiceA);
		expect(first).toBe(second);
	});
});

describe('resolve (unregistered)', () => {
	test('throws ContainerError for unregistered token', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(ServiceA)).toThrow(ContainerError);
	});

	test('error message includes the token name', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(ServiceA)).toThrow('ServiceA');
	});

	test('error message includes symbol description', () => {
		const container = createContainer();
		const scope = createScope(container);
		const token = Symbol('myToken');
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve(token)).toThrow('myToken');
	});

	test('error message includes string token', () => {
		const container = createContainer();
		const scope = createScope(container);
		expect(() => (scope as never as { resolve: (t: unknown) => unknown }).resolve('unknownService')).toThrow(
			'unknownService',
		);
	});
});

describe('Resolver injection', () => {
	test('factory can resolve other registered tokens', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

		const b = createScope(container).resolve(ServiceB);
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

		const c = createScope(container).resolve(ServiceC);
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
		expect(c.b.a.value).toBe('A');
	});
});

describe('async singleton (class)', () => {
	test('resolves to a Promise that yields the correct instance', async () => {
		const container = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));
		const scope = createScope(container);
		const result = scope.resolve(AsyncService);
		expect(result).toBeInstanceOf(Promise);
		const instance = await result;
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('async');
	});

	test('returns the same Promise on subsequent resolves', () => {
		const container = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));
		const scope = createScope(container);
		const first = scope.resolve(AsyncService);
		const second = scope.resolve(AsyncService);
		expect(first).toBe(second);
	});
});

describe('async singleton (string)', () => {
	test('resolves async factory with string token', async () => {
		const container = createContainer().registerSingleton('asyncGreeting', async () => 'hello async');
		const result = await createScope(container).resolve('asyncGreeting');
		expect(result).toBe('hello async');
	});
});

describe('async transient', () => {
	test('creates a new Promise on every resolve', async () => {
		const container = createContainer().registerTransient(AsyncService, async () => new AsyncService('transient'));
		const scope = createScope(container);
		const first = scope.resolve(AsyncService);
		const second = scope.resolve(AsyncService);
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

		const instance = await createScope(container).resolve(AsyncService);
		expect(instance.value).toBe('A');
	});

	test('async factory can await async dependency', async () => {
		const container = createContainer()
			.registerSingleton(AsyncService, async () => new AsyncService('dep'))
			.registerSingleton(DependsOnAsync, async r => {
				const async = await r.resolve(AsyncService);
				return new DependsOnAsync(async);
			});

		const instance = await createScope(container).resolve(DependsOnAsync);
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

		const scope = createScope(container);
		const syncResult = scope.resolve(ServiceA);
		const asyncResult = scope.resolve(AsyncService);

		expect(syncResult).toBeInstanceOf(ServiceA);
		expect(asyncResult).toBeInstanceOf(Promise);
		expect(await asyncResult).toBeInstanceOf(AsyncService);
	});
});

// Helper classes for circular dependency tests
class CircularA {
	public constructor(public b: CircularB) {}
}

class CircularB {
	public constructor(public a: CircularA) {}
}

class CircularX {
	public constructor(public y: CircularY) {}
}

class CircularY {
	public constructor(public z: CircularZ) {}
}

class CircularZ {
	public constructor(public x: CircularX) {}
}

describe('circular dependency detection', () => {
	test('detects direct circular dependency (A -> B -> A) with singleton', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerSingleton(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).resolve(CircularA)).toThrow(ContainerError);
	});

	test('detects direct circular dependency (A -> B -> A) with transient', () => {
		const container = createContainer()
			.registerTransient(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerTransient(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).resolve(CircularA)).toThrow(ContainerError);
	});

	test('detects indirect circular dependency (X -> Y -> Z -> X)', () => {
		const container = createContainer()
			.registerSingleton(
				CircularX,
				r => new CircularX((r as never as { resolve: (t: unknown) => CircularY }).resolve(CircularY)),
			)
			.registerSingleton(
				CircularY,
				r => new CircularY((r as never as { resolve: (t: unknown) => CircularZ }).resolve(CircularZ)),
			)
			.registerSingleton(
				CircularZ,
				r => new CircularZ((r as never as { resolve: (t: unknown) => CircularX }).resolve(CircularX)),
			);

		expect(() => createScope(container).resolve(CircularX)).toThrow(ContainerError);
	});

	test('error message includes "Circular dependency detected"', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerSingleton(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).resolve(CircularA)).toThrow('Circular dependency detected');
	});

	test('error message includes the circular path for direct cycle', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerSingleton(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).resolve(CircularA)).toThrow('CircularA -> CircularB -> CircularA');
	});

	test('error message includes the circular path for indirect cycle', () => {
		const container = createContainer()
			.registerSingleton(
				CircularX,
				r => new CircularX((r as never as { resolve: (t: unknown) => CircularY }).resolve(CircularY)),
			)
			.registerSingleton(
				CircularY,
				r => new CircularY((r as never as { resolve: (t: unknown) => CircularZ }).resolve(CircularZ)),
			)
			.registerSingleton(
				CircularZ,
				r => new CircularZ((r as never as { resolve: (t: unknown) => CircularX }).resolve(CircularX)),
			);

		expect(() => createScope(container).resolve(CircularX)).toThrow('CircularX -> CircularY -> CircularZ -> CircularX');
	});

	test('detects circular dependency with async factories', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerSingleton(
				CircularB,
				async r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).resolve(CircularB)).toThrow('Circular dependency detected');
	});

	test('does not affect non-circular dependency chains', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerSingleton(ServiceC, r => new ServiceC(r.resolve(ServiceB)));

		const c = createScope(container).resolve(ServiceC);
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
	});

	test('allows resolving the same singleton multiple times after initial resolve', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)));

		const scope = createScope(container);
		const first = scope.resolve(ServiceB);
		const second = scope.resolve(ServiceB);
		expect(first).toBe(second);
	});

	test('error message shows only the cycle portion when resolving from outside the cycle', () => {
		const container = createContainer()
			.registerSingleton(
				ServiceA,
				r => new ServiceA((r as never as { resolve: (t: unknown) => unknown }).resolve(CircularA) as string),
			)
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerSingleton(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		try {
			createScope(container).resolve(ServiceA);
		} catch (e) {
			expect(e).toBeInstanceOf(ContainerError);
			expect((e as ContainerError).message).toBe('Circular dependency detected: CircularA -> CircularB -> CircularA');
		}
	});

	test('detects self-referencing circular dependency (A -> A)', () => {
		class SelfRef {
			public constructor(public self: SelfRef) {}
		}

		const container = createContainer().registerSingleton(
			SelfRef,
			r => new SelfRef((r as never as { resolve: (t: unknown) => SelfRef }).resolve(SelfRef)),
		);

		expect(() => createScope(container).resolve(SelfRef)).toThrow(ContainerError);
		expect(() => createScope(container).resolve(SelfRef)).toThrow('Circular dependency detected');
		expect(() => createScope(container).resolve(SelfRef)).toThrow('SelfRef -> SelfRef');
	});
});

// Helper class for tryResolve tests
class Unregistered {
	public constructor(public value = 'unregistered') {}
}

describe('tryResolve (singleton)', () => {
	test('returns the instance for a registered singleton class token', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const instance = createScope(container).tryResolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
	});

	test('returns the same cached instance on subsequent calls', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const first = scope.tryResolve(ServiceA);
		const second = scope.tryResolve(ServiceA);
		expect(first).toBe(second);
	});

	test('works with string token', () => {
		const container = createContainer().registerSingleton('greeting', () => 'hello');
		expect(createScope(container).tryResolve('greeting')).toBe('hello');
	});

	test('works with Symbol token', () => {
		const token = Symbol('myService');
		const container = createContainer().registerSingleton(token, () => 42);
		expect(createScope(container).tryResolve(token)).toBe(42);
	});
});

describe('tryResolve (transient)', () => {
	test('returns the instance for a registered transient class token', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const instance = createScope(container).tryResolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
	});

	test('creates a new instance on every call', () => {
		const container = createContainer().registerTransient(ServiceA, () => new ServiceA());
		const scope = createScope(container);
		const first = scope.tryResolve(ServiceA);
		const second = scope.tryResolve(ServiceA);
		expect(first).not.toBe(second);
		expect(first).toBeInstanceOf(ServiceA);
		expect(second).toBeInstanceOf(ServiceA);
	});
});

describe('tryResolve (unregistered)', () => {
	test('returns undefined for unregistered class token', () => {
		const container = createContainer();
		expect(createScope(container).tryResolve(Unregistered)).toBeUndefined();
	});

	test('returns undefined for unregistered string token', () => {
		const container = createContainer();
		expect(createScope(container).tryResolve('nonexistent')).toBeUndefined();
	});

	test('returns undefined for unregistered Symbol token', () => {
		const container = createContainer();
		const token = Symbol('unknown');
		expect(createScope(container).tryResolve(token)).toBeUndefined();
	});
});

describe('tryResolve (async)', () => {
	test('returns a Promise for async singleton', async () => {
		const container = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));
		const scope = createScope(container);
		const result = scope.tryResolve(AsyncService);
		expect(result).toBeInstanceOf(Promise);
		const instance = await (result as Promise<AsyncService>);
		expect(instance).toBeInstanceOf(AsyncService);
		expect(instance.value).toBe('async');
	});

	test('returns the same Promise on subsequent calls', () => {
		const container = createContainer().registerSingleton(AsyncService, async () => new AsyncService('async'));
		const scope = createScope(container);
		const first = scope.tryResolve(AsyncService);
		const second = scope.tryResolve(AsyncService);
		expect(first).toBe(second);
	});
});

describe('tryResolve (error conditions)', () => {
	test('throws ContainerError for disposed scope', async () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		const scope = disposable(createScope(container));
		await scope[Symbol.asyncDispose]();
		expect(() => scope.tryResolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.tryResolve(ServiceA)).toThrow('disposed');
	});

	test('throws ContainerError for circular dependency', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerSingleton(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).tryResolve(CircularA)).toThrow(ContainerError);
		expect(() => createScope(container).tryResolve(CircularA)).toThrow('Circular dependency detected');
	});
});

describe('tryResolve (dependency graph)', () => {
	test('resolves dependency chain via tryResolve', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerSingleton(ServiceB, r => new ServiceB(r.resolve(ServiceA)))
			.registerSingleton(ServiceC, r => new ServiceC(r.resolve(ServiceB)));

		const c = createScope(container).tryResolve(ServiceC) as ServiceC;
		expect(c).toBeInstanceOf(ServiceC);
		expect(c.b).toBeInstanceOf(ServiceB);
		expect(c.b.a).toBeInstanceOf(ServiceA);
	});
});

describe('factory error recovery', () => {
	test('propagates factory error to the caller', () => {
		const container = createContainer().registerSingleton(ServiceA, () => {
			throw new Error('factory failed');
		});

		expect(() => createScope(container).resolve(ServiceA)).toThrow('factory failed');
	});

	test('retries resolution after factory throws — no false circular dependency', () => {
		let callCount = 0;
		const container = createContainer().registerSingleton(ServiceA, () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('first attempt failed');
			}
			return new ServiceA('recovered');
		});

		expect(() => createScope(container).resolve(ServiceA)).toThrow('first attempt failed');

		// Second resolve should retry the factory, not throw circular dependency error
		const instance = createScope(container).resolve(ServiceA);
		expect(instance).toBeInstanceOf(ServiceA);
		expect(instance.value).toBe('recovered');
		expect(callCount).toBe(2);
	});

	test('singleton is not cached when factory throws', () => {
		let callCount = 0;
		const container = createContainer().registerSingleton(ServiceA, () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('init failed');
			}
			return new ServiceA('success');
		});

		expect(() => createScope(container).resolve(ServiceA)).toThrow('init failed');
		expect(callCount).toBe(1);

		// Factory should be called again since no instance was cached
		const instance = createScope(container).resolve(ServiceA);
		expect(instance.value).toBe('success');
		expect(callCount).toBe(2);
	});

	test('transient factory error does not affect subsequent resolves', () => {
		let callCount = 0;
		const container = createContainer().registerTransient(ServiceA, () => {
			callCount++;
			if (callCount === 1) {
				throw new Error('transient failed');
			}
			return new ServiceA('ok');
		});

		expect(() => createScope(container).resolve(ServiceA)).toThrow('transient failed');

		const instance = createScope(container).resolve(ServiceA);
		expect(instance.value).toBe('ok');
	});
});

describe('singleton caching edge cases', () => {
	test('null singleton is cached — factory is called only once', () => {
		let callCount = 0;
		const container = createContainer().registerSingleton('nullable', () => {
			callCount++;
			return null;
		});

		const scope = createScope(container);
		const first = scope.resolve('nullable');
		const second = scope.resolve('nullable');
		expect(first).toBeNull();
		expect(second).toBeNull();
		expect(callCount).toBe(1);
	});

	test('undefined singleton — factory is called again due to cache check using !== undefined', () => {
		let callCount = 0;
		const container = createContainer().registerSingleton('undef', () => {
			callCount++;
			return undefined;
		});

		const scope = createScope(container);
		scope.resolve('undef');
		scope.resolve('undef');

		// The cache check uses `!== undefined`, so undefined values are not properly cached.
		// This documents the current behavior: the factory is called on every resolve.
		expect(callCount).toBeGreaterThan(1);
	});
});

describe('tryResolve in factory', () => {
	test('factory can use tryResolve for a registered token', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA('injected'))
			.registerSingleton(ServiceB, r => {
				const a = r.tryResolve(ServiceA);
				return new ServiceB(a ?? new ServiceA('fallback'));
			});

		const b = createScope(container).resolve(ServiceB);
		expect(b.a.value).toBe('injected');
	});

	test('factory can use tryResolve for an unregistered token — returns undefined', () => {
		const container = createContainer().registerSingleton(ServiceB, r => {
			const a = r.tryResolve(Unregistered) as ServiceA | undefined;
			return new ServiceB(a ?? new ServiceA('fallback'));
		});

		const b = createScope(container).resolve(ServiceB);
		expect(b.a.value).toBe('fallback');
	});
});

describe('async singleton (rejected Promise)', () => {
	test('caches the rejected Promise — subsequent resolves return the same rejected Promise', async () => {
		const container = createContainer().registerSingleton(AsyncService, async (): Promise<AsyncService> => {
			throw new Error('init failed');
		});

		const scope = createScope(container);
		const first = scope.resolve(AsyncService);
		const second = scope.resolve(AsyncService);

		// The same rejected Promise object is cached and returned
		expect(first).toBe(second);
		expect(first).rejects.toThrow('init failed');
	});
});

describe('registration after resolve', () => {
	test('new registration after resolve creates a new instance (per-registration cache)', () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA('first'));

		// Resolve caches the 'first' instance for the first registration
		const cached = createScope(container).resolve(ServiceA);
		expect(cached.value).toBe('first');

		// Add a new registration — resolve() now uses the last registration
		container.registerSingleton(ServiceA, () => new ServiceA('second'));

		const result = createScope(container).resolve(ServiceA);
		expect(result.value).toBe('second');
		expect(result).not.toBe(cached);
	});
});

describe('number token', () => {
	test('works with number token for singleton', () => {
		const container = createContainer().registerSingleton(0, () => 'zero');
		expect(createScope(container).resolve(0)).toBe('zero');
	});

	test('works with number token for transient', () => {
		const container = createContainer().registerTransient(1, () => Math.random());
		const scope = createScope(container);
		const first = scope.resolve(1);
		const second = scope.resolve(1);
		expect(typeof first).toBe('number');
		expect(first).not.toBe(second);
	});
});

describe('mixed lifetime circular dependency', () => {
	test('detects circular dependency across singleton and transient lifetimes', () => {
		const container = createContainer()
			.registerSingleton(
				CircularA,
				r => new CircularA((r as never as { resolve: (t: unknown) => CircularB }).resolve(CircularB)),
			)
			.registerTransient(
				CircularB,
				r => new CircularB((r as never as { resolve: (t: unknown) => CircularA }).resolve(CircularA)),
			);

		expect(() => createScope(container).resolve(CircularA)).toThrow(ContainerError);
		expect(() => createScope(container).resolve(CircularA)).toThrow('Circular dependency detected');
	});
});
