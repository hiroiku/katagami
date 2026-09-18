import { describe, expect, test } from 'bun:test';
import { createContainer } from '../container';
import { disposable } from '../disposable';
import { ContainerError } from '../error';
import { INTERNALS } from '../internal';
import { createScope } from '.';

// Helper classes for testing
class ServiceA {
	public constructor(public value = 'A') {}
}

class DisposableService {
	public disposed = false;

	public [Symbol.dispose](): void {
		this.disposed = true;
	}
}

class AsyncDisposableService {
	public disposed = false;

	public async [Symbol.asyncDispose](): Promise<void> {
		this.disposed = true;
	}
}

class NonDisposableService {
	public value = 'non-disposable';
}

class FailingDisposableService {
	public [Symbol.dispose](): void {
		throw new Error('dispose failed');
	}
}

describe('Scope [Symbol.asyncDispose]', () => {
	test('calls [Symbol.dispose]() on scoped instances', async () => {
		const container = createContainer().registerScoped(DisposableService, () => new DisposableService());
		const scope = disposable(createScope(container));
		const instance = scope.resolve(DisposableService);
		expect(instance.disposed).toBe(false);

		await scope[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('calls [Symbol.asyncDispose]() on scoped instances', async () => {
		const container = createContainer().registerScoped(AsyncDisposableService, () => new AsyncDisposableService());
		const scope = disposable(createScope(container));
		const instance = scope.resolve(AsyncDisposableService);
		expect(instance.disposed).toBe(false);

		await scope[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('prefers [Symbol.asyncDispose]() over [Symbol.dispose]() when both exist', async () => {
		class BothDisposable {
			public syncDisposed = false;
			public asyncDisposed = false;

			public [Symbol.dispose](): void {
				this.syncDisposed = true;
			}

			public async [Symbol.asyncDispose](): Promise<void> {
				this.asyncDisposed = true;
			}
		}

		const container = createContainer().registerScoped(BothDisposable, () => new BothDisposable());
		const scope = disposable(createScope(container));
		const instance = scope.resolve(BothDisposable);

		await scope[Symbol.asyncDispose]();
		expect(instance.asyncDisposed).toBe(true);
		expect(instance.syncDisposed).toBe(false);
	});

	test('disposes instances in reverse creation order (LIFO)', async () => {
		const order: string[] = [];

		class FirstService {
			public [Symbol.dispose](): void {
				order.push('first');
			}
		}

		class SecondService {
			public [Symbol.dispose](): void {
				order.push('second');
			}
		}

		class ThirdService {
			public [Symbol.dispose](): void {
				order.push('third');
			}
		}

		const container = createContainer()
			.registerScoped(FirstService, () => new FirstService())
			.registerScoped(SecondService, () => new SecondService())
			.registerScoped(ThirdService, () => new ThirdService());

		const scope = disposable(createScope(container));
		scope.resolve(FirstService);
		scope.resolve(SecondService);
		scope.resolve(ThirdService);

		await scope[Symbol.asyncDispose]();
		expect(order).toEqual(['third', 'second', 'first']);
	});

	test('is idempotent — second dispose is a no-op', async () => {
		let disposeCount = 0;

		class CountingDisposable {
			public [Symbol.dispose](): void {
				disposeCount++;
			}
		}

		const container = createContainer().registerScoped(CountingDisposable, () => new CountingDisposable());
		const scope = disposable(createScope(container));
		scope.resolve(CountingDisposable);

		await scope[Symbol.asyncDispose]();
		await scope[Symbol.asyncDispose]();
		expect(disposeCount).toBe(1);
	});

	test('does not dispose singleton instances', async () => {
		const container = createContainer()
			.registerSingleton(DisposableService, () => new DisposableService())
			.registerScoped(AsyncDisposableService, () => new AsyncDisposableService());

		const scope = disposable(createScope(container));
		const singleton = scope.resolve(DisposableService);
		const scoped = scope.resolve(AsyncDisposableService);

		await scope[Symbol.asyncDispose]();
		expect(singleton.disposed).toBe(false);
		expect(scoped.disposed).toBe(true);
	});

	test('skips instances without dispose methods', async () => {
		const container = createContainer()
			.registerScoped(NonDisposableService, () => new NonDisposableService())
			.registerScoped(DisposableService, () => new DisposableService());

		const scope = disposable(createScope(container));
		const nonDisposable = scope.resolve(NonDisposableService);
		const instance = scope.resolve(DisposableService);

		await scope[Symbol.asyncDispose]();
		expect(nonDisposable.value).toBe('non-disposable');
		expect(instance.disposed).toBe(true);
	});

	test('disposes async factory instances (Promise-wrapped)', async () => {
		const container = createContainer().registerScoped(
			AsyncDisposableService,
			async () => new AsyncDisposableService(),
		);

		const scope = disposable(createScope(container));
		const instance = await scope.resolve(AsyncDisposableService);

		await scope[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('continues disposing remaining instances when one throws', async () => {
		const container = createContainer()
			.registerScoped(FailingDisposableService, () => new FailingDisposableService())
			.registerScoped(DisposableService, () => new DisposableService());

		const scope = disposable(createScope(container));
		scope.resolve(FailingDisposableService);
		const instance = scope.resolve(DisposableService);

		try {
			await scope[Symbol.asyncDispose]();
		} catch (e) {
			expect(e).toBeInstanceOf(AggregateError);
			expect((e as AggregateError).errors).toHaveLength(1);
		}

		expect(instance.disposed).toBe(true);
	});
});

describe('Scope [Symbol.asyncDispose] edge cases', () => {
	test('handles scope with no resolved instances', async () => {
		const container = createContainer().registerScoped(ServiceA, () => new ServiceA());
		const scope = disposable(createScope(container));
		// Dispose without resolving anything — should not throw
		await scope[Symbol.asyncDispose]();
	});

	test('skips primitive instances (string, number, boolean)', async () => {
		const container = createContainer()
			.registerScoped('str', () => 'hello')
			.registerScoped('num', () => 42)
			.registerScoped('bool', () => true);

		const scope = disposable(createScope(container));
		scope.resolve('str');
		scope.resolve('num');
		scope.resolve('bool');

		// Dispose should skip primitives without throwing
		await scope[Symbol.asyncDispose]();
	});

	test('skips null and undefined instances', async () => {
		const container = createContainer()
			.registerScoped('nullable', () => null)
			.registerScoped('undef', () => undefined);

		const scope = disposable(createScope(container));
		scope.resolve('nullable');
		scope.resolve('undef');

		// Dispose should skip null/undefined without throwing
		await scope[Symbol.asyncDispose]();
	});

	test('throws AggregateError when multiple instances fail during disposal', async () => {
		class FailA {
			public [Symbol.dispose](): void {
				throw new Error('fail A');
			}
		}

		class FailB {
			public [Symbol.dispose](): void {
				throw new Error('fail B');
			}
		}

		const container = createContainer()
			.registerScoped(FailA, () => new FailA())
			.registerScoped(FailB, () => new FailB());

		const scope = disposable(createScope(container));
		scope.resolve(FailA);
		scope.resolve(FailB);

		try {
			await scope[Symbol.asyncDispose]();
			// Should not reach here
			expect(true).toBe(false);
		} catch (e) {
			expect(e).toBeInstanceOf(AggregateError);
			expect((e as AggregateError).errors).toHaveLength(2);
		}
	});
});

describe('生成に失敗した資源の破棄', () => {
	test('非同期 factory が拒否された scoped 登録を含む scope は、破棄を正常に完了する', async () => {
		const failure = new Error('factory failed');
		const container = createContainer().registerScoped('broken', async () => {
			throw failure;
		});

		const scope = disposable(createScope(container));
		await expect(scope.resolve('broken')).rejects.toBe(failure);

		expect(await scope[Symbol.asyncDispose]()).toBeUndefined();
	});

	test('生成に失敗した登録より先に作られた実体も、続けて破棄する', async () => {
		let closed = false;
		const failure = new Error('factory failed');
		const container = createContainer()
			.registerScoped('resource', () => ({
				[Symbol.dispose]: () => {
					closed = true;
				},
			}))
			.registerScoped('broken', async () => {
				throw failure;
			});

		const scope = disposable(createScope(container));
		scope.resolve('resource');
		// 逆順では拒否された生成が先頭に来る。そこで打ち切ると、残りの実体は閉じられないまま cache から消える。
		await expect(scope.resolve('broken')).rejects.toBe(failure);

		expect(await scope[Symbol.asyncDispose]()).toBeUndefined();
		expect(closed).toBe(true);
	});

	test('生成できた実体の破棄の失敗は、逆順のまま AggregateError に集約される', async () => {
		const order: string[] = [];
		const firstFailure = new Error('dispose first');
		const secondFailure = new Error('dispose second');
		const container = createContainer()
			.registerScoped('first', () => ({
				[Symbol.dispose]: () => {
					order.push('first');
					throw firstFailure;
				},
			}))
			.registerScoped('second', () => ({
				[Symbol.asyncDispose]: async () => {
					order.push('second');
					throw secondFailure;
				},
			}));

		const scope = disposable(createScope(container));
		scope.resolve('first');
		scope.resolve('second');

		const error = await scope[Symbol.asyncDispose]().then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).errors).toEqual([secondFailure, firstFailure]);
		expect(order).toEqual(['second', 'first']);
	});

	test('生成に失敗したものは AggregateError に入らず、破棄に失敗した実体だけが残る', async () => {
		const creation = new Error('factory failed');
		const cleanup = new Error('dispose failed');
		const container = createContainer()
			.registerScoped('broken', async () => {
				throw creation;
			})
			.registerScoped('resource', () => ({
				[Symbol.dispose]: () => {
					throw cleanup;
				},
			}));

		const scope = disposable(createScope(container));
		await expect(scope.resolve('broken')).rejects.toBe(creation);
		scope.resolve('resource');

		const error = await scope[Symbol.asyncDispose]().then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).errors).toEqual([cleanup]);
	});

	test('生成の失敗は、その token を解決した呼び出し側が受け取る', async () => {
		const failure = new Error('factory failed');
		const container = createContainer().registerScoped('broken', async () => {
			throw failure;
		});

		const scope = disposable(createScope(container));
		const pending = scope.resolve('broken');

		expect(await scope[Symbol.asyncDispose]()).toBeUndefined();
		await expect(pending).rejects.toBe(failure);
	});

	test('生成の記帳を残さないビルドが cache へ載せた Promise も、完了を待って閉じる', async () => {
		const closed: string[] = [];
		const scope = createScope(createContainer());
		// 記帳を残さない別のビルドが、同じ INTERNALS を通して cache へ載せた生成を模す。
		const ownCache = scope[INTERNALS].ownCache;
		ownCache.set(
			{} as never,
			Promise.resolve({
				[Symbol.dispose]: () => {
					closed.push('foreign');
				},
			}),
		);
		ownCache.set({} as never, Promise.reject(new Error('foreign creation failed')));

		expect(await disposable(scope)[Symbol.asyncDispose]()).toBeUndefined();
		expect(closed).toEqual(['foreign']);
	});
});

describe('disposed scope guards', () => {
	test('throws ContainerError when resolving from a disposed scope', async () => {
		const container = createContainer().registerScoped(ServiceA, () => new ServiceA());
		const scope = disposable(createScope(container));
		await scope[Symbol.asyncDispose]();

		expect(() => scope.resolve(ServiceA)).toThrow(ContainerError);
		expect(() => scope.resolve(ServiceA)).toThrow('disposed scope');
	});

	test('throws ContainerError when creating nested scope from a disposed scope', async () => {
		const container = createContainer();
		const scope = disposable(createScope(container));
		await scope[Symbol.asyncDispose]();

		expect(() => createScope(scope)).toThrow(ContainerError);
		expect(() => createScope(scope)).toThrow('disposed container');
	});
});

describe('await using integration (scope)', () => {
	test('scope is automatically disposed at end of block', async () => {
		const container = createContainer().registerScoped(DisposableService, () => new DisposableService());

		let instance: DisposableService;
		{
			await using scope = disposable(createScope(container));
			instance = scope.resolve(DisposableService);
			expect(instance.disposed).toBe(false);
		}

		expect(instance.disposed).toBe(true);
	});
});

describe('Scope transient disposal', () => {
	test('does not dispose transient instances resolved in scope', async () => {
		const container = createContainer()
			.registerTransient(DisposableService, () => new DisposableService())
			.registerScoped(AsyncDisposableService, () => new AsyncDisposableService());

		const scope = disposable(createScope(container));

		// Resolve transient (not stored in ownInstances) and scoped (stored)
		const transientInstance = scope.resolve(DisposableService);
		const scopedInstance = scope.resolve(AsyncDisposableService);

		await scope[Symbol.asyncDispose]();

		// Transient instances are NOT tracked and thus NOT disposed
		expect(transientInstance.disposed).toBe(false);
		// Scoped instances ARE disposed
		expect(scopedInstance.disposed).toBe(true);
	});
});

describe('parent scope disposal effect on child scope', () => {
	test('child scope can still resolve its own scoped instances after parent disposal', async () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(DisposableService, () => new DisposableService());

		const parentScope = disposable(createScope(container));
		const childScope = createScope(parentScope);

		// Resolve in child scope before parent disposal
		const childScoped = childScope.resolve(DisposableService);
		expect(childScoped).toBeInstanceOf(DisposableService);

		// Dispose parent scope — clears parent's ownInstances (scopedInstances)
		await parentScope[Symbol.asyncDispose]();

		// Child scope has its own scopedInstances, so previously resolved scoped instances are still available
		const childScopedAgain = childScope.resolve(DisposableService);
		expect(childScopedAgain).toBe(childScoped);
	});

	test('child scope shares singletonInstances with parent — singleton resolved in child is visible to container', () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(DisposableService, () => new DisposableService());

		const parentScope = createScope(container);
		const childScope = createScope(parentScope);

		// Resolve singleton through child — goes into shared singletonInstances
		const childSingleton = childScope.resolve(ServiceA);
		const parentSingleton = parentScope.resolve(ServiceA);
		const rootScope = createScope(container);
		const rootSingleton = rootScope.resolve(ServiceA);

		expect(childSingleton).toBe(parentSingleton);
		expect(childSingleton).toBe(rootSingleton);
	});
});
