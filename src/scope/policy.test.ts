import { describe, expect, test } from 'bun:test';
import { disposable } from '../disposable/index.js';
import { createContainer, createMetadataKey, createScope, type ResolutionEvent } from '../index.js';

describe('解決時の方針', () => {
	test('キャッシュ、配列、optional 経路すべてを解決前に検査する', () => {
		const key = createMetadataKey<string>()('area');
		const token = Symbol('multi');
		let created = 0;
		let allow = true;
		const events: ResolutionEvent[] = [];
		const c = createContainer()
			.registerSingleton(
				token,
				() => {
					created++;
					return {};
				},
				{ metadata: [key('one')] },
			)
			.registerSingleton(
				token,
				() => {
					created++;
					return {};
				},
				{ metadata: [key('two')] },
			);
		const s = createScope(c, {
			beforeResolve: event => {
				events.push(event);
				if (!allow) {
					throw new Error('denied');
				}
			},
		});
		const value = s.resolve(token);
		expect(s.tryResolve(token)).toBe(value);
		expect(s.resolveAll(token)[1]).toBe(value);
		expect(s.tryResolveAll(token)?.[1]).toBe(value);
		expect(events.map(e => e.metadata.require(key))).toEqual(['two', 'two', 'one', 'two', 'one', 'two']);
		expect(created).toBe(2);
		allow = false;
		for (const resolve of [
			() => s.resolve(token),
			() => s.tryResolve(token),
			() => s.resolveAll(token),
			() => s.tryResolveAll(token),
		]) {
			expect(resolve).toThrow('denied');
		}
		expect(created).toBe(2);
		expect(s.tryResolve('unknown')).toBeUndefined();
	});
	test('子 scope は親の方針を継承し、追加方針で置き換えない', () => {
		const calls: string[] = [];
		const parent = createScope(
			createContainer().registerScoped('value', () => ({})),
			{
				beforeResolve: () => {
					calls.push('parent');
				},
			},
		);
		const child = createScope(parent, {
			beforeResolve: () => {
				calls.push('child');
			},
		});
		expect(child.resolve('value')).not.toBe(parent.resolve('value'));
		expect(calls).toEqual(['parent', 'child', 'parent']);
	});
	test('保持した factory resolver は await 後も呼出元と方針を保持する', async () => {
		const events: ResolutionEvent[] = [];
		const c = createContainer()
			.registerScoped('dependency', () => 7)
			.registerScoped('operation', async r => {
				await Promise.resolve();
				expect(Object.keys(r).sort()).toEqual(['resolve', 'resolveAll', 'tryResolve', 'tryResolveAll']);
				return [
					r.resolve('dependency'),
					r.tryResolve('dependency'),
					...r.resolveAll('dependency'),
					...(r.tryResolveAll('dependency') ?? []),
				];
			});
		const s = createScope(c, {
			beforeResolve: e => {
				events.push(e);
			},
		});
		expect(await s.resolve('operation')).toEqual([7, 7, 7, 7]);
		expect(events.slice(1).every(e => e.requester?.token === 'operation')).toBe(true);
		expect(events[1]?.path).toEqual(['operation', 'dependency']);
		expect(Object.isFrozen(events[1]?.path)).toBe(true);
	});
	test('await 後に singleton が scoped を捕捉しようとしても拒否する', async () => {
		const c = createContainer()
			.registerScoped('scoped', () => 1)
			.registerSingleton('singleton', async r => {
				await Promise.resolve();
				return r.resolve('scoped' as never);
			});
		await expect(createScope(c).resolve('singleton')).rejects.toThrow('Captive dependency');
	});
	test('解決元が終了した後の保持 resolver も拒否する', async () => {
		const c = createContainer()
			.registerScoped('dependency', () => 7)
			.registerScoped('operation', r => () => r.resolve('dependency'));
		const s = disposable(createScope(c));
		const operation = s.resolve('operation');
		await s[Symbol.asyncDispose]();
		expect(operation).toThrow('disposed');
	});
	test('非同期 hook を同期解決の検査として受け入れない', () => {
		const s = createScope(
			createContainer().registerScoped('value', () => 1),
			{ beforeResolve: async () => undefined },
		);
		expect(() => s.resolve('value')).toThrow('synchronously');
	});
});

test('拒否された非同期 hook の後続 rejection も観測する', async () => {
	let created = false;
	const scope = createScope(
		createContainer().registerScoped('value', () => {
			created = true;
			return 1;
		}),
		{
			beforeResolve: async () => {
				await Promise.resolve();
				throw new Error('async denied');
			},
		},
	);
	expect(() => scope.resolve('value')).toThrow('synchronously');
	await new Promise(resolve => setTimeout(resolve, 0));
	expect(created).toBe(false);
});

test('共有 singleton の保持 resolver は生成元 scope に所属する', () => {
	const visited: string[] = [];
	const c = createContainer()
		.registerSingleton('value', () => 1)
		.registerSingleton('read', r => () => r.resolve('value'));
	const first = createScope(c, {
		beforeResolve: e => {
			visited.push(`first:${String(e.token)}`);
		},
	});
	const second = createScope(c, {
		beforeResolve: e => {
			visited.push(`second:${String(e.token)}`);
		},
	});
	expect(first.resolve('read')()).toBe(1);
	expect(second.resolve('read')()).toBe(1);
	expect(visited).toEqual(['first:read', 'first:value', 'second:read', 'first:value']);
});

test('生成済み transient の関数は同じ依存を後から再生成できる', () => {
	const c = createContainer<{ count: (n: number) => number }>().registerTransient('count', r => (n: number): number => {
		if (n === 0) {
			return 0;
		}
		return 1 + r.resolve('count')(n - 1);
	});
	expect(createScope(c).resolve('count')(2)).toBe(2);
});

test('未完了の async factory が同じ transient を生成すれば循環として拒否する', async () => {
	const c = createContainer<{ cycle: Promise<number> }>().registerTransient('cycle', async r => {
		await Promise.resolve();
		return r.resolve('cycle');
	});
	await expect(createScope(c).resolve('cycle')).rejects.toThrow('Circular dependency detected: cycle -> cycle');
});
