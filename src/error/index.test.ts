import { describe, expect, test } from 'bun:test';
import { ContainerError } from '.';

describe('ContainerError', () => {
	test('is an instance of Error', () => {
		const error = new ContainerError('test');
		expect(error).toBeInstanceOf(Error);
	});

	test('has name "ContainerError"', () => {
		const error = new ContainerError('test');
		expect(error.name).toBe('ContainerError');
	});

	test('preserves the error message', () => {
		const error = new ContainerError('something went wrong');
		expect(error.message).toBe('something went wrong');
	});

	test('has a stack trace', () => {
		const error = new ContainerError('test');
		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('ContainerError');
	});

	test('is catchable with instanceof', () => {
		let caught = false;

		try {
			throw new ContainerError('test');
		} catch (e) {
			if (e instanceof ContainerError) {
				caught = true;
			}
		}

		expect(caught).toBe(true);
	});

	test('is distinguishable from generic Error via instanceof', () => {
		const containerError = new ContainerError('container');
		const genericError = new Error('generic');

		expect(containerError).toBeInstanceOf(ContainerError);
		expect(genericError).not.toBeInstanceOf(ContainerError);
	});
});
