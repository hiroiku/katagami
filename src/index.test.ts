import { describe, expect, test } from 'bun:test';
import { Container, ContainerError, createContainer, Scope } from './index';

describe('public API exports', () => {
	test('exports createContainer function', () => {
		expect(typeof createContainer).toBe('function');
	});

	test('exports Container class', () => {
		expect(typeof Container).toBe('function');
		expect(createContainer()).toBeInstanceOf(Container);
	});

	test('exports Scope class', () => {
		expect(typeof Scope).toBe('function');
		const scope = createContainer().createScope();
		expect(scope).toBeInstanceOf(Scope);
	});

	test('exports ContainerError class', () => {
		expect(typeof ContainerError).toBe('function');
		expect(new ContainerError('test')).toBeInstanceOf(Error);
	});

	test('end-to-end: register, resolve, and scope via public API', () => {
		class MyService {
			public constructor(public value: string) {}
		}

		const container = createContainer().registerSingleton(MyService, () => new MyService('hello'));

		const instance = container.resolve(MyService);
		expect(instance.value).toBe('hello');

		const scope = container.createScope();
		const scopedInstance = scope.resolve(MyService);
		expect(scopedInstance).toBe(instance);
	});

	test('ContainerError is thrown for unregistered token via public API', () => {
		class Unknown {}
		const container = createContainer();
		expect(() => (container as never as { resolve: (t: unknown) => unknown }).resolve(Unknown)).toThrow(ContainerError);
	});
});
