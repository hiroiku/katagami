import { describe, expect, test } from 'bun:test';
import { ContainerError } from './error';

describe('ContainerError', () => {
	test('is an instance of Error', () => {
		const error = new ContainerError('test');
		expect(error).toBeInstanceOf(Error);
	});

	test('has name "ContainerError"', () => {
		const error = new ContainerError('test');
		expect(error.name).toBe('ContainerError');
	});
});
