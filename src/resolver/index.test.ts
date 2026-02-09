import { describe, expect, test } from 'bun:test';
import { buildCircularPath, tokenToString } from '.';

describe('tokenToString', () => {
	test('returns the name for a named function', () => {
		class MyService {}
		expect(tokenToString(MyService)).toBe('MyService');
	});

	test('returns "anonymous function" for a function without a name', () => {
		const fn = Object.defineProperty(
			() => {
				// Intentionally empty for testing
			},
			'name',
			{ value: '' },
		);
		expect(tokenToString(fn)).toBe('anonymous function');
	});

	test('returns the symbol description for a symbol', () => {
		const sym = Symbol('myToken');
		expect(tokenToString(sym)).toBe('Symbol(myToken)');
	});

	test('returns the string representation for a string token', () => {
		expect(tokenToString('greeting')).toBe('greeting');
	});

	test('returns the string representation for a number token', () => {
		expect(tokenToString(42)).toBe('42');
	});

	test('returns "null" for null', () => {
		expect(tokenToString(null)).toBe('null');
	});

	test('returns "undefined" for undefined', () => {
		expect(tokenToString(undefined)).toBe('undefined');
	});
});

describe('buildCircularPath', () => {
	test('builds path for direct cycle (A -> B -> A)', () => {
		const tokens = new Set<unknown>(['A', 'B']);
		expect(buildCircularPath(tokens, 'A')).toBe('A -> B -> A');
	});

	test('builds path for indirect cycle (A -> B -> C -> A)', () => {
		const tokens = new Set<unknown>(['A', 'B', 'C']);
		expect(buildCircularPath(tokens, 'A')).toBe('A -> B -> C -> A');
	});

	test('extracts only the cycle portion when extra tokens precede the cycle', () => {
		const tokens = new Set<unknown>(['X', 'A', 'B']);
		expect(buildCircularPath(tokens, 'A')).toBe('A -> B -> A');
	});

	test('handles single-element self-cycle', () => {
		const tokens = new Set<unknown>(['A']);
		expect(buildCircularPath(tokens, 'A')).toBe('A -> A');
	});

	test('works with class constructor tokens', () => {
		class ServiceA {}
		class ServiceB {}
		const tokens = new Set<unknown>([ServiceA, ServiceB]);
		expect(buildCircularPath(tokens, ServiceA)).toBe('ServiceA -> ServiceB -> ServiceA');
	});

	test('works with symbol tokens', () => {
		const symA = Symbol('A');
		const symB = Symbol('B');
		const tokens = new Set<unknown>([symA, symB]);
		expect(buildCircularPath(tokens, symA)).toBe('Symbol(A) -> Symbol(B) -> Symbol(A)');
	});
});
