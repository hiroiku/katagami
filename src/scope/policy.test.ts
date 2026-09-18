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

test.each([
	'scoped',
	'singleton',
] as const)('未完了の async な %s が cache 済みの自分を待てば、止まらず循環として拒否し、破棄も完了する', async lifetime => {
	const container = createContainer<{ cycle: Promise<number> }>();
	const factory = async (r: { resolve(token: 'cycle'): Promise<number> }) => {
		await Promise.resolve();
		return r.resolve('cycle');
	};
	const register = {
		scoped: () => container.registerScoped('cycle', factory),
		singleton: () => container.registerSingleton('cycle', factory),
	};
	const c = register[lifetime]();
	const scope = disposable(createScope(c));
	await expect(scope.resolve('cycle')).rejects.toThrow('Circular dependency detected: cycle -> cycle');
	await scope[Symbol.asyncDispose]();
	await disposable(c)[Symbol.asyncDispose]();
});

test('factory が捕捉した同じ scope から同期に解決しても、captive と循環を検出する', () => {
	const c = createContainer()
		.registerScoped('request', () => ({}))
		.registerSingleton('shared', () => scope.resolve('request'))
		.registerScoped('a', (): unknown => scope.resolve('b'))
		.registerScoped('b', (r): unknown => (r as unknown as { resolve(token: string): unknown }).resolve('a'));
	const scope = createScope(c) as unknown as { resolve(token: string): unknown };
	expect(() => scope.resolve('shared')).toThrow('Captive dependency detected: scoped token "request"');
	expect(() => scope.resolve('a')).toThrow('Circular dependency detected: a -> b -> a');
});

test.each([
	'scoped',
	'singleton',
] as const)('生成を終えた依存が保持した resolver は、未完了の %s を別の呼び出し元のために待たずに返す', async lifetime => {
	const { promise: gate, resolve: release } = Promise.withResolvers<void>();
	type Back = { getA(): Promise<object> };
	const container = createContainer<{ A: Promise<object>; B: Back }>();
	const a = async (r: { resolve(token: 'B'): Back }) => {
		await Promise.resolve();
		const b = r.resolve('B');
		await gate;
		return { b };
	};
	const b = (r: { resolve(token: 'A'): Promise<object> }): Back => ({ getA: () => r.resolve('A') });
	const register = {
		scoped: () => container.registerScoped('A', a).registerScoped('B', b),
		singleton: () => container.registerSingleton('A', a).registerSingleton('B', b),
	};
	const c = register[lifetime]();
	const first = createScope(c);
	const pending = first.resolve('A');
	await Promise.resolve();
	await Promise.resolve();
	// 別の呼び出し元（singleton なら兄弟の scope）が、A の保留中に B の逆参照を使う。
	const callers = { scoped: first, singleton: createScope(c) };
	const caller = callers[lifetime];
	const viaB = caller.resolve('B').getA();
	release();
	expect(await viaB).toBe(await pending);
});

test('別の scope を経由して戻った解決は、外側の factory を要求元にしない', () => {
	const events: string[] = [];
	const hook = (e: ResolutionEvent) => {
		events.push(`${String(e.token)}<-${String(e.requester?.token ?? 'outside')}:${e.path.map(String).join('>')}`);
	};
	const other = createScope(
		createContainer().registerScoped('x', (): unknown => first.resolve('y')),
		{ beforeResolve: hook },
	);
	const first = createScope(
		createContainer()
			.registerScoped('a', (): unknown => other.resolve('x'))
			.registerScoped('y', () => 'y'),
		{ beforeResolve: hook },
	) as unknown as { resolve(token: string): unknown };
	expect(first.resolve('a')).toBe('y');
	expect(events).toEqual(['a<-outside:a', 'x<-outside:x', 'y<-outside:y']);
});

test.each([
	'scoped',
	'transient',
] as const)('同期に実行中の %s を、生成を終えた依存の resolver から解決し直せば循環として拒否する', lifetime => {
	type Back = { getA(): unknown };
	const container = createContainer<{ A: unknown; B: Back }>();
	const a = (r: { resolve(token: 'B'): Back }) => r.resolve('B').getA();
	const b = (r: { resolve(token: 'A'): unknown }): Back => ({ getA: () => r.resolve('A') });
	const register = {
		scoped: () => container.registerScoped('A', a).registerScoped('B', b),
		transient: () => container.registerTransient('A', a).registerTransient('B', b),
	};
	expect(() => createScope(register[lifetime]()).resolve('A')).toThrow('Circular dependency detected: A -> A');
});

test('別の scope を経由して同期に戻った解決でも、実行中の生成への循環を拒否する', () => {
	const other = createScope(createContainer().registerScoped('x', (): unknown => first.resolve('y')));
	const first = createScope(
		createContainer()
			.registerScoped('a', (): unknown => other.resolve('x'))
			.registerScoped('y', (r): unknown => (r as unknown as { resolve(token: string): unknown }).resolve('a')),
	) as unknown as { resolve(token: string): unknown };
	expect(() => first.resolve('a')).toThrow('Circular dependency detected: a -> y -> a');
});

test('同期に実行中の singleton を別の scope から解決し直せば循環として拒否する', () => {
	const c = createContainer().registerSingleton('shared', (): unknown => other.resolve('shared'));
	const other = createScope(c) as unknown as { resolve(token: string): unknown };
	expect(() => createScope(c).resolve('shared')).toThrow('Circular dependency detected: shared -> shared');
});

test('同じ部品を use した別のコンテナーの singleton は、生成中でも別の生成として解決できる', () => {
	let nested = false;
	const other = { scope: undefined as unknown as { resolve(token: 'config'): object } };
	const module = createContainer().registerSingleton('config', (): object => {
		if (nested) {
			return { base: true };
		}
		nested = true;
		return { nested: other.scope.resolve('config') };
	});
	other.scope = createScope(createContainer().use(module));
	expect(createScope(createContainer().use(module)).resolve('config')).toEqual({ nested: { base: true } });
});
