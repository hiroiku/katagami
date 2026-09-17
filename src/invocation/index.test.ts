import { describe, expect, test } from 'bun:test';
import { disposable } from '../disposable/index.js';
import { createContainer, createScope, entrypoint } from '../index.js';
import { createInvocationScope, invocation } from './index.js';

describe('公開操作の呼出し', () => {
	test('入力と結果を渡し、非公開依存は内部 resolver から利用する', async () => {
		const visited: unknown[] = [];
		const c = createContainer()
			.registerScoped('private', () => 2)
			.registerScoped(
				'add',
				entrypoint(r => (n: number) => r.resolve('private') + n),
			);
		await using view = createInvocationScope(c, {
			beforeResolve: e => {
				visited.push(e.token);
			},
		});
		expect(await view.invoke('add', 3)).toBe(5);
		expect(visited).toEqual(['add', 'private']);
		expect(Object.keys(view)).toEqual(['invoke']);
		expect(Object.getOwnPropertySymbols(view)).toEqual([Symbol.asyncDispose]);
		expect(Object.isFrozen(view)).toBe(true);
	});
	test('未知・非公開を factory 生成前に拒否する', async () => {
		let calls = 0;
		const c = createContainer().registerScoped('private', () => {
			calls++;
			return () => 1;
		});
		await using view = createInvocationScope(c);
		await expect(view.invoke('private' as never)).rejects.toThrow('not an entrypoint');
		await expect(view.invoke('unknown' as never)).rejects.toThrow('not registered');
		expect(calls).toBe(0);
	});
	test('型消去や mutable alias があっても非公開への置換を拒否する', async () => {
		let privateCalls = 0;
		const c = createContainer().registerScoped(
			'operation',
			entrypoint(() => () => 1),
		);
		await using view = createInvocationScope(c);
		expect(await view.invoke('operation')).toBe(1);
		c.use(
			createContainer().registerScoped('operation', () => {
				privateCalls++;
				return () => 2;
			}),
		);
		await expect(view.invoke('operation')).rejects.toThrow('not an entrypoint');
		expect(privateCalls).toBe(0);
	});
	test('非同期 factory と失敗した操作をそのまま扱う', async () => {
		const c = createContainer()
			.registerScoped(
				'async',
				entrypoint(async () => async (n: number) => n * 2),
			)
			.registerScoped(
				'failure',
				entrypoint(() => () => {
					throw new Error('operation failed');
				}),
			)
			.registerScoped(
				'invalid',
				entrypoint(() => 42 as never),
			);
		await using view = createInvocationScope(c);
		expect(await view.invoke('async', 3)).toBe(6);
		await expect(view.invoke('failure')).rejects.toThrow('operation failed');
		await expect(view.invoke('invalid')).rejects.toThrow('must return a callable');
	});
	test('既存 scope の実体を共有し、終了を冪等に委譲する', async () => {
		let disposed = 0;
		const c = createContainer()
			.registerScoped('resource', () => ({
				id: Math.random(),
				[Symbol.dispose]: () => {
					disposed++;
				},
			}))
			.registerScoped(
				'id',
				entrypoint(r => () => r.resolve('resource').id),
			);
		const s = disposable(createScope(c));
		const resource = s.resolve('resource');
		const view = invocation(s);
		expect(await view.invoke('id')).toBe(resource.id);
		const first = view[Symbol.asyncDispose]();
		expect(view[Symbol.asyncDispose]()).toBe(first);
		await first;
		expect(disposed).toBe(1);
		expect(() => s.resolve('resource')).toThrow('disposed');
		await expect(view.invoke('id')).rejects.toThrow('disposed');
		await s[Symbol.asyncDispose]();
		expect(disposed).toBe(1);
		expect(() => invocation(s)).toThrow('disposed');
	});
	test('終了は実行中操作を待ち、新しい操作を拒否する', async () => {
		const order: string[] = [];
		let finish: (() => void) | undefined;
		const gate = new Promise<void>(resolve => {
			finish = resolve;
		});
		const c = createContainer()
			.registerScoped('resource', () => ({
				[Symbol.dispose]: () => {
					order.push('dispose');
				},
			}))
			.registerScoped(
				'wait',
				entrypoint(r => async () => {
					r.resolve('resource');
					await gate;
					order.push('complete');
					return 1;
				}),
			);
		const view = createInvocationScope(c);
		const running = view.invoke('wait');
		const closing = view[Symbol.asyncDispose]();
		await expect(view.invoke('wait')).rejects.toThrow('disposed');
		finish?.();
		expect(await running).toBe(1);
		await closing;
		expect(order).toEqual(['complete', 'dispose']);
	});
	test('元 scope や container が先に終了した場合も拒否する', async () => {
		const c = createContainer().registerScoped(
			'operation',
			entrypoint(() => () => 1),
		);
		const s = disposable(createScope(c));
		const view = invocation(s);
		await s[Symbol.asyncDispose]();
		await expect(view.invoke('operation')).rejects.toThrow('disposed');
		await view[Symbol.asyncDispose]();
		await disposable(c)[Symbol.asyncDispose]();
		expect(() => createInvocationScope(c)).toThrow('disposed');
	});
});

test('同じ scope の複数 view は所有と終了待ちを共有する', async () => {
	const events: string[] = [];
	let release: (() => void) | undefined;
	const gate = new Promise<void>(resolve => {
		release = resolve;
	});
	const c = createContainer()
		.registerScoped('resource', () => ({
			value: 1,
			[Symbol.dispose]: () => {
				events.push('disposed');
			},
		}))
		.registerScoped(
			'run',
			entrypoint(r => async () => {
				await gate;
				const value = r.resolve('resource').value;
				events.push('finished');
				return value;
			}),
		);
	const scope = createScope(c);
	const first = invocation(scope);
	const second = invocation(scope);
	expect(first).toBe(second);
	const running = second.invoke('run');
	const closing = first[Symbol.asyncDispose]();
	await expect(second.invoke('run')).rejects.toThrow('disposed');
	release?.();
	expect(await running).toBe(1);
	await closing;
	expect(events).toEqual(['finished', 'disposed']);
});
