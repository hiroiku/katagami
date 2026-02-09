import { describe, expect, test } from 'bun:test';
import { ContainerError } from '../error';
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
		const container = createContainer().registerSingleton(DisposableService, () => new DisposableService());
		const instance = container.resolve(DisposableService);
		expect(instance.disposed).toBe(false);

		await container[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('calls [Symbol.asyncDispose]() on singleton instances', async () => {
		const container = createContainer().registerSingleton(AsyncDisposableService, () => new AsyncDisposableService());
		const instance = container.resolve(AsyncDisposableService);

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

		const container = createContainer()
			.registerSingleton(FirstService, () => new FirstService())
			.registerSingleton(SecondService, () => new SecondService());

		container.resolve(FirstService);
		container.resolve(SecondService);

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

		const container = createContainer().registerSingleton(CountingDisposable, () => new CountingDisposable());
		container.resolve(CountingDisposable);

		await container[Symbol.asyncDispose]();
		await container[Symbol.asyncDispose]();
		expect(disposeCount).toBe(1);
	});

	test('disposes async singleton instances (Promise-wrapped)', async () => {
		const container = createContainer().registerSingleton(
			AsyncDisposableService,
			async () => new AsyncDisposableService(),
		);

		const instance = await container.resolve(AsyncDisposableService);

		await container[Symbol.asyncDispose]();
		expect(instance.disposed).toBe(true);
	});

	test('continues disposing remaining instances when one throws', async () => {
		const container = createContainer()
			.registerSingleton(FailingDisposableService, () => new FailingDisposableService())
			.registerSingleton(DisposableService, () => new DisposableService());

		container.resolve(FailingDisposableService);
		const disposable = container.resolve(DisposableService);

		try {
			await container[Symbol.asyncDispose]();
		} catch (e) {
			expect(e).toBeInstanceOf(AggregateError);
			expect((e as AggregateError).errors).toHaveLength(1);
		}

		expect(disposable.disposed).toBe(true);
	});
});

describe('Container [Symbol.asyncDispose] edge cases', () => {
	test('handles container with no resolved instances', async () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		// Dispose without resolving anything — should not throw
		await container[Symbol.asyncDispose]();
	});

	test('skips primitive singleton instances', async () => {
		const container = createContainer()
			.registerSingleton('str', () => 'hello')
			.registerSingleton('num', () => 42);

		container.resolve('str');
		container.resolve('num');

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

		const container = createContainer()
			.registerSingleton(FailX, () => new FailX())
			.registerSingleton(FailY, () => new FailY());

		container.resolve(FailX);
		container.resolve(FailY);

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
	test('throws ContainerError when resolving from a disposed container', async () => {
		const container = createContainer().registerSingleton(ServiceA, () => new ServiceA());
		await container[Symbol.asyncDispose]();

		expect(() => container.resolve(ServiceA)).toThrow(ContainerError);
		expect(() => container.resolve(ServiceA)).toThrow('disposed container');
	});

	test('throws ContainerError when creating scope from a disposed container', async () => {
		const container = createContainer();
		await container[Symbol.asyncDispose]();

		expect(() => container.createScope()).toThrow(ContainerError);
		expect(() => container.createScope()).toThrow('disposed container');
	});
});

describe('await using integration (container)', () => {
	test('container is automatically disposed at end of block', async () => {
		let instance: DisposableService;
		{
			await using container = createContainer().registerSingleton(DisposableService, () => new DisposableService());
			instance = container.resolve(DisposableService);
			expect(instance.disposed).toBe(false);
		}

		expect(instance.disposed).toBe(true);
	});
});
