import { describe, expect, test } from 'bun:test';
import { disposable } from '../disposable/index.js';
import {
	ContainerError,
	type ContainerPolicy,
	createContainer,
	createScope,
	entrypoint,
	type ResolutionEvent,
} from '../index.js';

describe('公開操作の取得と呼び出し', () => {
	test('get は生成せず、公開面は get と非同期終了だけになる', async () => {
		const visited: unknown[] = [];
		let created = 0;
		const c = createContainer()
			.registerScoped('private', () => 2)
			.registerScoped(
				'add',
				entrypoint(r => {
					created++;
					return (n: number) => r.resolve('private') + n;
				}),
			);
		await using operations = createScope(c, {
			access: 'operations',
			beforeResolve: e => {
				visited.push(e.token);
			},
		});
		const add = operations.get('add');
		expect(created).toBe(0);
		expect(visited).toEqual([]);
		const result = add(3);
		expect(result).toBeInstanceOf(Promise);
		expect(await result).toBe(5);
		expect(visited).toEqual(['add', 'private']);
		expect(Object.keys(operations)).toEqual(['get']);
		expect(Object.getOwnPropertySymbols(operations)).toEqual([Symbol.asyncDispose]);
		expect(Object.isFrozen(operations)).toBe(true);
	});
	test('未知・非公開を get で同期的に拒否する', async () => {
		let created = 0;
		const c = createContainer().registerScoped('private', () => {
			created++;
			return () => 1;
		});
		await using operations = createScope(c, { access: 'operations' });
		expect(() => operations.get('private' as never)).toThrow('not an entrypoint');
		expect(() => operations.get('unknown' as never)).toThrow('not registered');
		expect(created).toBe(0);
	});
	test('型を外して渡した未知の access は、通常の scope として通さず拒否する', async () => {
		let created = 0;
		const c = createContainer().registerScoped('value', () => {
			created++;
			return {};
		});
		const source = disposable(createScope(c));
		for (const access of ['operation', 'Operations', 'resolver', '', null, 0, false]) {
			expect(() => createScope(c, { access } as never)).toThrow(ContainerError);
			expect(() => createScope(source, { access } as never)).toThrow('Unknown scope access');
		}
		// 正しい指定（未指定と 'operations'）の挙動は変えない。
		for (const options of [undefined, {}, { access: undefined }]) {
			expect(createScope(c, options).resolve('value')).toBeDefined();
		}
		await using operations = createScope(c, { access: 'operations' });
		expect(Object.keys(operations)).toEqual(['get']);
		expect(created).toBe(3);
		// 拒否した後も、元の scope の状態は変わらない。
		expect(source.resolve('value')).toBeDefined();
		expect(created).toBe(4);
	});
	test('取得済み関数も mutable alias による非公開への置換を実行前に拒否する', async () => {
		let privateCalls = 0;
		const c = createContainer().registerScoped(
			'operation',
			entrypoint(() => () => 1),
		);
		await using operations = createScope(c, { access: 'operations' });
		const run = operations.get('operation');
		expect(await run()).toBe(1);
		c.use(
			createContainer().registerScoped('operation', () => {
				privateCalls++;
				return () => 2;
			}),
		);
		await expect(run()).rejects.toThrow('not an entrypoint');
		expect(() => operations.get('operation')).toThrow('not an entrypoint');
		expect(privateCalls).toBe(0);
	});
	test('非同期 factory、thenable と失敗した操作を扱う', async () => {
		const failure = new Error('operation failed');
		const c = createContainer()
			.registerScoped(
				'async',
				entrypoint(async () => async (n: number) => n * 2),
			)
			.registerScoped(
				'thenable',
				entrypoint(() => () => ({
					// biome-ignore lint/suspicious/noThenProperty: 公開操作が返す thenable の解決を検証する。
					then: (resolve: (value: number) => void) => resolve(7),
				})),
			)
			.registerScoped(
				'failure',
				entrypoint(() => () => {
					throw failure;
				}),
			)
			.registerScoped(
				'invalid',
				entrypoint(() => 42 as never),
			);
		await using operations = createScope(c, { access: 'operations' });
		expect(await operations.get('async')(3)).toBe(6);
		expect(await operations.get('thenable')()).toBe(7);
		await expect(operations.get('failure')()).rejects.toBe(failure);
		await expect(operations.get('invalid')()).rejects.toThrow('must return a callable');
	});
	test('キャッシュされた操作も毎回 beforeResolve を通り、拒否理由を保持する', async () => {
		const denied = new Error('denied');
		let allowed = true;
		let calls = 0;
		const events: ResolutionEvent[] = [];
		const c = createContainer().registerScoped(
			'read',
			entrypoint(() => () => ++calls),
		);
		await using operations = createScope(c, {
			access: 'operations',
			beforeResolve: e => {
				events.push(e);
				if (!allowed) {
					throw denied;
				}
			},
		});
		const read = operations.get('read');
		expect(await read()).toBe(1);
		allowed = false;
		await expect(read()).rejects.toBe(denied);
		expect(events.map(e => e.token)).toEqual(['read', 'read']);
		expect(calls).toBe(1);
	});
	test('終了は await 後の内部解決と返却検査を待ち、取得済み関数を拒否する', async () => {
		const order: string[] = [];
		let release!: () => void;
		let started!: () => void;
		const gate = new Promise<void>(resolve => {
			release = resolve;
		});
		const begun = new Promise<void>(resolve => {
			started = resolve;
		});
		const policy = {
			beforeReturn() {
				order.push('beforeReturn');
			},
		} satisfies ContainerPolicy;
		const c = createContainer({ policy })
			.registerScoped('resource', () => ({
				value: 1,
				[Symbol.dispose]() {
					order.push('dispose');
				},
			}))
			.registerScoped(
				'wait',
				entrypoint(r => async () => {
					started();
					await gate;
					const value = r.resolve('resource').value;
					order.push('complete');
					return value;
				}),
			);
		const operations = createScope(c, { access: 'operations' });
		const run = operations.get('wait');
		const running = run();
		await begun;
		const closing = operations[Symbol.asyncDispose]();
		expect(operations[Symbol.asyncDispose]()).toBe(closing);
		await expect(run()).rejects.toThrow('disposed');
		expect(order).toEqual([]);
		release();
		expect(await running).toBe(1);
		await closing;
		expect(order).toEqual(['complete', 'beforeReturn', 'dispose']);
		await expect(run()).rejects.toThrow('disposed');
	});
	for (const slow of ['ok', 'fail'] as const) {
		test(`終了は ${slow} が最後に終わる場合も進行中の操作をすべて待ち、結果が届いてから破棄する`, async () => {
			const order: string[] = [];
			const failure = new Error('operation failed');
			let release!: () => void;
			let begun!: () => void;
			let remaining = 2;
			const ready = new Promise<void>(resolve => {
				begun = () => {
					remaining--;
					if (remaining === 0) {
						resolve();
					}
				};
			});
			const gate = new Promise<void>(resolve => {
				release = resolve;
			});
			// 遅い方だけに、待ち合わせが無ければ破棄の方が先に終わるだけの間を空ける。
			const finish = async (name: 'ok' | 'fail'): Promise<void> => {
				begun();
				await gate;
				if (name === slow) {
					for (let tick = 0; tick < 40; tick++) {
						await Promise.resolve();
					}
				}
				order.push(name);
			};
			const c = createContainer()
				.registerScoped('resource', () => ({
					[Symbol.dispose]() {
						order.push('dispose');
					},
				}))
				.registerScoped(
					'ok',
					entrypoint(r => async () => {
						r.resolve('resource');
						await finish('ok');
						return 1;
					}),
				)
				.registerScoped(
					'fail',
					entrypoint(() => async () => {
						await finish('fail');
						throw failure;
					}),
				);
			const operations = createScope(c, { access: 'operations' });
			const running = operations
				.get('ok')()
				.then(value => {
					order.push('ok:received');
					return value;
				});
			const failing = operations
				.get('fail')()
				.catch((error: unknown) => {
					order.push('fail:received');
					throw error;
				});
			await ready;
			const closing = operations[Symbol.asyncDispose]();
			release();
			expect(await running).toBe(1);
			await expect(failing).rejects.toBe(failure);
			await closing;
			expect(order.at(-1)).toBe('dispose');
			expect(order.slice(0, -1).sort()).toEqual(['fail', 'fail:received', 'ok', 'ok:received']);
		});
	}
	test('新しい operations scope は scoped cache を引き継がない', async () => {
		let created = 0;
		let disposed = 0;
		const c = createContainer()
			.registerScoped('resource', () => ({
				id: ++created,
				[Symbol.dispose]() {
					disposed++;
				},
			}))
			.registerScoped(
				'id',
				entrypoint(r => () => r.resolve('resource').id),
			);
		const first = createScope(c, { access: 'operations' });
		const second = createScope(c, { access: 'operations' });
		const old = first.get('id');
		expect(await old()).toBe(1);
		expect(await second.get('id')()).toBe(2);
		await first[Symbol.asyncDispose]();
		await expect(old()).rejects.toThrow('disposed');
		expect(await second.get('id')()).toBe(2);
		expect(disposed).toBe(1);
		await second[Symbol.asyncDispose]();
		expect(disposed).toBe(2);
	});
	test('子の終了は親 scope と singleton の所有権を奪わない', async () => {
		const disposed: string[] = [];
		const c = createContainer()
			.registerSingleton('singleton', () => ({
				[Symbol.dispose]() {
					disposed.push('singleton');
				},
			}))
			.registerScoped('scoped', () => ({
				[Symbol.dispose]() {
					disposed.push('scoped');
				},
			}))
			.registerScoped(
				'run',
				entrypoint(r => () => {
					r.resolve('singleton');
					r.resolve('scoped');
					return 1;
				}),
			);
		const parent = disposable(createScope(c));
		parent.resolve('scoped');
		const child = createScope(parent, { access: 'operations' });
		expect(await child.get('run')()).toBe(1);
		await child[Symbol.asyncDispose]();
		expect(disposed).toEqual(['scoped']);
		expect(parent.resolve('scoped')).toBeDefined();
		await parent[Symbol.asyncDispose]();
		expect(disposed).toEqual(['scoped', 'scoped']);
		await disposable(c)[Symbol.asyncDispose]();
		expect(disposed).toEqual(['scoped', 'scoped', 'singleton']);
	});
	test('親の終了後は新しい子を作れず、既存の子は独立した寿命を保つ', async () => {
		const c = createContainer().registerScoped(
			'run',
			entrypoint(() => () => 1),
		);
		const parent = disposable(createScope(c));
		const child = createScope(parent, { access: 'operations' });
		const run = child.get('run');
		await parent[Symbol.asyncDispose]();
		expect(() => createScope(parent, { access: 'operations' })).toThrow('disposed');
		expect(await run()).toBe(1);
		await child[Symbol.asyncDispose]();
		await expect(run()).rejects.toThrow('disposed');
		await disposable(c)[Symbol.asyncDispose]();
		expect(() => createScope(c, { access: 'operations' })).toThrow('disposed');
	});
	test('操作の失敗と終了時エラーをそれぞれの Promise に保持する', async () => {
		const failure = new Error('operation failed');
		const cleanup = new Error('cleanup failed');
		const c = createContainer()
			.registerScoped('resource', () => ({
				[Symbol.asyncDispose]: async () => {
					throw cleanup;
				},
			}))
			.registerScoped(
				'fail',
				entrypoint(r => () => {
					r.resolve('resource');
					throw failure;
				}),
			);
		const operations = createScope(c, { access: 'operations' });
		await expect(operations.get('fail')()).rejects.toBe(failure);
		await expect(operations[Symbol.asyncDispose]()).rejects.toMatchObject({ errors: [cleanup] });
	});
	test('entrypoint の生成の失敗は execute が受け取り、終了は破棄の失敗として報告しない', async () => {
		const failure = new Error('factory failed');
		const c = createContainer().registerScoped(
			'broken',
			entrypoint(async (): Promise<() => number> => {
				throw failure;
			}),
		);
		const operations = createScope(c, { access: 'operations' });
		await expect(operations.get('broken')()).rejects.toBe(failure);
		expect(await operations[Symbol.asyncDispose]()).toBeUndefined();
	});
	test('操作内の requester と singleton の captivity 検査を保つ', async () => {
		const events: ResolutionEvent[] = [];
		const c = createContainer()
			.registerScoped('dependency', () => 1)
			.registerScoped(
				'read',
				entrypoint(r => async () => {
					await Promise.resolve();
					return r.resolve('dependency');
				}),
			)
			.registerSingleton(
				'invalid',
				entrypoint(r => async () => {
					await Promise.resolve();
					return r.resolve('dependency' as never);
				}),
			);
		await using operations = createScope(c, {
			access: 'operations',
			beforeResolve: e => {
				events.push(e);
			},
		});
		expect(await operations.get('read')()).toBe(1);
		expect(events[1]?.requester?.token).toBe('read');
		expect(events[1]?.path).toEqual(['read', 'dependency']);
		await expect(operations.get('invalid')()).rejects.toThrow('Captive dependency');
	});
});
