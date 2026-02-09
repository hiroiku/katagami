import { describe, expect, test } from 'bun:test';
import { disposable } from '../disposable';
import { ContainerError } from '../error';
import { createScope } from '../scope';
import { createContainer } from '.';

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

class FailingDisposableService {
	public [Symbol.dispose](): void {
		throw new Error('dispose failed');
	}
}

describe('Container [Symbol.asyncDispose]', () => {
	test('calls [Symbol.dispose]() on singleton instances', async () => {
		const container = disposable(createContainer().registerSingleton(DisposableService, () => new DisposableService()));
		const scope = createScope(container);
		const instance = scope.resolve(DisposableService);
		expect(instance.disposed).toBe(false);

		await container[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('calls [Symbol.asyncDispose]() on singleton instances', async () => {
		const container = disposable(
			createContainer().registerSingleton(AsyncDisposableService, () => new AsyncDisposableService()),
		);
		const scope = createScope(container);
		const instance = scope.resolve(AsyncDisposableService);

		await container[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('disposes singleton instances in reverse creation order (LIFO)', async () => {
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

		const container = disposable(
			createContainer()
				.registerSingleton(FirstService, () => new FirstService())
				.registerSingleton(SecondService, () => new SecondService()),
		);

		const scope = createScope(container);
		scope.resolve(FirstService);
		scope.resolve(SecondService);

		await container[Symbol.asyncDispose]();
		expect(order).toEqual(['second', 'first']);
	});

	test('is idempotent — second dispose is a no-op', async () => {
		let disposeCount = 0;

		class CountingDisposable {
			public [Symbol.dispose](): void {
				disposeCount++;
			}
		}

		const container = disposable(
			createContainer().registerSingleton(CountingDisposable, () => new CountingDisposable()),
		);
		const scope = createScope(container);
		scope.resolve(CountingDisposable);

		await container[Symbol.asyncDispose]();
		await container[Symbol.asyncDispose]();
		expect(disposeCount).toBe(1);
	});

	test('disposes async singleton instances (Promise-wrapped)', async () => {
		const container = disposable(
			createContainer().registerSingleton(AsyncDisposableService, async () => new AsyncDisposableService()),
		);

		const scope = createScope(container);
		const instance = await scope.resolve(AsyncDisposableService);

		await container[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('continues disposing remaining instances when one throws', async () => {
		const container = disposable(
			createContainer()
				.registerSingleton(FailingDisposableService, () => new FailingDisposableService())
				.registerSingleton(DisposableService, () => new DisposableService()),
		);

		const scope = createScope(container);
		scope.resolve(FailingDisposableService);
		const instance = scope.resolve(DisposableService);

		try {
			await container[Symbol.asyncDispose]();
		} catch (e) {
			expect(e).toBeInstanceOf(AggregateError);
			expect((e as AggregateError).errors).toHaveLength(1);
		}

		expect(instance.disposed).toBe(true);
	});
});

describe('Container [Symbol.asyncDispose] edge cases', () => {
	test('handles container with no resolved instances', async () => {
		const container = disposable(createContainer().registerSingleton(ServiceA, () => new ServiceA()));
		// Dispose without resolving anything — should not throw
		await container[Symbol.asyncDispose]();
	});

	test('skips primitive singleton instances', async () => {
		const container = disposable(
			createContainer()
				.registerSingleton('str', () => 'hello')
				.registerSingleton('num', () => 42),
		);

		const scope = createScope(container);
		scope.resolve('str');
		scope.resolve('num');

		// Dispose should skip primitives without throwing
		await container[Symbol.asyncDispose]();
	});

	test('throws AggregateError with message when multiple singletons fail', async () => {
		class FailX {
			public [Symbol.dispose](): void {
				throw new Error('fail X');
			}
		}

		class FailY {
			public [Symbol.dispose](): void {
				throw new Error('fail Y');
			}
		}

		const container = disposable(
			createContainer()
				.registerSingleton(FailX, () => new FailX())
				.registerSingleton(FailY, () => new FailY()),
		);

		const scope = createScope(container);
		scope.resolve(FailX);
		scope.resolve(FailY);

		try {
			await container[Symbol.asyncDispose]();
			expect(true).toBe(false);
		} catch (e) {
			expect(e).toBeInstanceOf(AggregateError);
			expect((e as AggregateError).errors).toHaveLength(2);
			expect((e as AggregateError).message).toBe('One or more errors occurred during disposal.');
		}
	});
});

describe('disposed container guards', () => {
	test('throws ContainerError when creating scope from a disposed container', async () => {
		const container = disposable(createContainer().registerSingleton(ServiceA, () => new ServiceA()));
		await container[Symbol.asyncDispose]();

		expect(() => createScope(container)).toThrow(ContainerError);
		expect(() => createScope(container)).toThrow('disposed container');
	});

	test('throws ContainerError when creating scope from a disposed container (no registrations)', async () => {
		const container = disposable(createContainer());
		await container[Symbol.asyncDispose]();

		expect(() => createScope(container)).toThrow(ContainerError);
		expect(() => createScope(container)).toThrow('disposed container');
	});
});

describe('await using integration (container)', () => {
	test('container is automatically disposed at end of block', async () => {
		let instance: DisposableService;
		{
			await using container = disposable(
				createContainer().registerSingleton(DisposableService, () => new DisposableService()),
			);
			const scope = createScope(container);
			instance = scope.resolve(DisposableService);
			expect(instance.disposed).toBe(false);
		}

		expect(instance.disposed).toBe(true);
	});
});

describe('Container transient disposal', () => {
	test('does not dispose transient instances', async () => {
		const container = disposable(
			createContainer()
				.registerTransient(DisposableService, () => new DisposableService())
				.registerSingleton(AsyncDisposableService, () => new AsyncDisposableService()),
		);

		const scope = createScope(container);
		// Resolve transient (not stored in ownInstances) and singleton (stored)
		const transientInstance = scope.resolve(DisposableService);
		const singletonInstance = scope.resolve(AsyncDisposableService);

		await container[Symbol.asyncDispose]();

		// Transient instances are NOT tracked and thus NOT disposed
		expect(transientInstance.disposed).toBe(false);
		// Singleton instances ARE disposed
		expect(singletonInstance.disposed).toBe(true);
	});
});

describe('Container [Symbol.asyncDispose] preference', () => {
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

		const container = disposable(createContainer().registerSingleton(BothDisposable, () => new BothDisposable()));
		const scope = createScope(container);
		const instance = scope.resolve(BothDisposable);

		await container[Symbol.asyncDispose]();
		expect(instance.asyncDisposed).toBe(true);
		expect(instance.syncDisposed).toBe(false);
	});
});

describe('disposable() double invocation', () => {
	test('calling disposable() twice overwrites the dispose handler — both calls work', async () => {
		const container = createContainer().registerSingleton(DisposableService, () => new DisposableService());

		// First disposable() call
		const first = disposable(container);
		// Second disposable() call on the same object — configurable: true allows overwrite
		const second = disposable(container);

		// Both references point to the same underlying container
		expect(first).toBe(second);

		const scope = createScope(second);
		const instance = scope.resolve(DisposableService);
		await second[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});
});

describe('Container disposal effect on child scopes', () => {
	test('container disposal clears singleton cache — scope loses cached singletons', async () => {
		const container = createContainer()
			.registerSingleton(ServiceA, () => new ServiceA())
			.registerScoped(DisposableService, () => new DisposableService());

		const scope = createScope(container);

		// Resolve singleton through scope — cached in shared singletonInstances map
		const singletonViaScope = scope.resolve(ServiceA);
		expect(singletonViaScope).toBeInstanceOf(ServiceA);

		// Dispose the container — clears ownInstances (which IS the instances/singletonInstances map)
		const disposableContainer = disposable(container);
		await disposableContainer[Symbol.asyncDispose]();

		// Scope's singletonInstances map is the same reference, now cleared.
		// Resolving the singleton again through scope will create a new instance.
		// However, the scope itself is not marked as disposed, so it can still resolve.
		// Note: the container IS marked as disposed, but the scope has its own disposed flag.
		const newSingleton = scope.resolve(ServiceA);
		expect(newSingleton).toBeInstanceOf(ServiceA);
		expect(newSingleton).not.toBe(singletonViaScope);
	});
});
