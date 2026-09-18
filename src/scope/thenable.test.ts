import { describe, expect, test } from 'bun:test';
import {
	type ContainerPolicy,
	createContainer,
	createMetadataKey,
	createScope,
	entrypoint,
	type ReturnEvent,
} from '../index.js';

describe('thenable な依存実体の互換性', () => {
	for (const withPolicy of [false, true]) {
		for (const lifetime of ['singleton', 'scoped', 'transient'] as const) {
			test(`policy ${withPolicy} の ${lifetime} は元の実体と寿命を保ち、解決だけでは購読しない`, async () => {
				let subscriptions = 0;
				let created = 0;
				const factory = () => {
					const id = ++created;
					return {
						status: () => `ready:${id}`,
						// biome-ignore lint/suspicious/noThenProperty: thenable の独自メソッドと購読回数を検証する。
						then(resolve: (value: number) => void) {
							subscriptions++;
							resolve(id);
						},
					};
				};
				const produced: ReturnType<typeof factory>[] = [];
				const trackedFactory = () => {
					const value = factory();
					produced.push(value);
					return value;
				};
				let policy: ContainerPolicy | undefined;
				if (withPolicy) {
					policy = {};
				}
				const empty = createContainer({ policy });
				const methods = {
					scoped: 'registerScoped',
					singleton: 'registerSingleton',
					transient: 'registerTransient',
				} as const;
				const container = empty[methods[lifetime]]('handle', trackedFactory);
				const scope = createScope(container);
				const first = scope.resolve('handle');
				const again = scope.resolve('handle');
				const sibling = createScope(container).resolve('handle');
				await Promise.resolve();
				expect(first).toBe(produced[0]);
				expect(first.status()).toBe('ready:1');
				expect(subscriptions).toBe(0);
				if (lifetime === 'singleton') {
					expect(again).toBe(first);
					expect(sibling).toBe(first);
					expect(created).toBe(1);
				} else if (lifetime === 'scoped') {
					expect(again).toBe(first);
					expect(sibling).toBe(produced[1]);
					expect(sibling).not.toBe(first);
					expect(created).toBe(2);
				} else {
					expect(again).toBe(produced[1]);
					expect(sibling).toBe(produced[2]);
					expect(again).not.toBe(first);
					expect(sibling).not.toBe(again);
					expect(created).toBe(3);
				}
				expect(await first).toBe(1);
				expect(subscriptions).toBe(1);
			});
		}
	}

	test('解決と cache 取得は then getter を評価しない', async () => {
		let reads = 0;
		let subscriptions = 0;
		const handle = {
			status: () => 'ready',
			// biome-ignore lint/suspicious/noThenProperty: 解決時に then getter を実行しない契約を検証する。
			get then() {
				reads++;
				return (resolve: (value: string) => void) => {
					subscriptions++;
					resolve('done');
				};
			},
		};
		const scope = createScope(createContainer({ policy: {} }).registerScoped('handle', () => handle));
		expect(scope.resolve('handle')).toBe(handle);
		expect(scope.tryResolve('handle')).toBe(handle);
		expect(scope.resolveAll('handle')).toEqual([handle]);
		expect(scope.tryResolveAll('handle')).toEqual([handle]);
		expect(scope.resolve('handle').status()).toBe('ready');
		expect(reads).toBe(0);
		expect(subscriptions).toBe(0);
		expect(await handle).toBe('done');
		expect(reads).toBe(1);
		expect(subscriptions).toBe(1);
	});

	test('購読ごとに値が変わる thenable は操作ごと一度だけ待ち、未観測の成功値へ出自を推定しない', async () => {
		const area = createMetadataKey<string>()('area');
		const origins: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				origins.push(registrations);
				if (registrations.some(r => r.metadata.get(area) === 'capability')) {
					throw new Error('known capability');
				}
			},
		} satisfies ContainerPolicy;
		let subscriptions = 0;
		const handle = {
			status: () => 'ready',
			// biome-ignore lint/suspicious/noThenProperty: 購読による実行回数と成功値の対応を検証する。
			then(resolve: (value: { execution: number }) => void) {
				resolve({ execution: ++subscriptions });
			},
		};
		const container = createContainer({ policy })
			.registerScoped('handle', () => handle, { metadata: [area('capability')] })
			.registerScoped(
				'inspect',
				entrypoint(r => () => {
					const resolved = r.resolve('handle');
					return { same: resolved === handle, status: resolved.status() };
				}),
			)
			.registerScoped(
				'run',
				entrypoint(r => () => r.resolve('handle')),
			);
		// 能力として登録した thenable は、最上位の解決からも外へ出ない。
		expect(() => createScope(container).resolve('handle')).toThrow('known capability');
		await using operations = createScope(container, { access: 'operations' });
		expect(await operations.get('inspect')()).toEqual({ same: true, status: 'ready' });
		await Promise.resolve();
		expect(subscriptions).toBe(0);
		expect(await operations.get('run')()).toEqual({ execution: 1 });
		expect(await operations.get('run')()).toEqual({ execution: 2 });
		expect(subscriptions).toBe(2);
		expect(origins.map(registrations => registrations.map(r => r.token))).toEqual([['handle'], [], [], []]);
	});

	test('async factory で明示して待つ thenable の成功値は一度だけ購読し出自を記録する', async () => {
		const origins: ReturnEvent['registrations'][] = [];
		const denied = new Error('async capability');
		const policy = {
			beforeReturn({ registrations }) {
				origins.push(registrations);
				if (registrations.some(r => r.token === 'capability')) {
					throw denied;
				}
			},
		} satisfies ContainerPolicy;
		let subscriptions = 0;
		const thenable = {
			// biome-ignore lint/suspicious/noThenProperty: async factory による明示的な thenable 待機を検証する。
			then(resolve: (value: { execution: number }) => void) {
				resolve({ execution: ++subscriptions });
			},
		};
		const container = createContainer({ policy })
			.registerSingleton('capability', async () => await thenable)
			.registerScoped('alias', r => r.resolve('capability'))
			.registerScoped(
				'read',
				entrypoint(r => () => r.resolve('alias')),
			);
		await using operations = createScope(container, { access: 'operations' });
		await expect(operations.get('read')()).rejects.toBe(denied);
		await expect(operations.get('read')()).rejects.toBe(denied);
		expect(subscriptions).toBe(1);
		expect(origins.map(registrations => registrations.map(r => r.token))).toEqual([
			['capability', 'alias'],
			['capability', 'alias'],
		]);
	});

	test('非同期の生成は記帳した chain を返し、alias と async factory の成功値の出自を返却前に記録する', async () => {
		const area = createMetadataKey<string>()('area');
		const origins: ReturnEvent['registrations'][] = [];
		const denied = new Error('known capability');
		const policy = {
			beforeReturn({ registrations }) {
				origins.push(registrations);
				if (registrations.some(r => r.metadata.get(area) === 'capability')) {
					throw denied;
				}
			},
		} satisfies ContainerPolicy;
		const value = {};
		const promise = Object.assign(Promise.resolve(value), { status: () => 'pending value' });
		const container = createContainer({ policy })
			.registerSingleton('native', () => promise, { metadata: [area('capability')] })
			.registerScoped('alias', r => r.resolve('native'), { metadata: [area('alias')] })
			.registerScoped('async', async r => await r.resolve('alias'), { metadata: [area('async')] })
			.registerScoped(
				'run',
				entrypoint(r => async () => await r.resolve('async')),
			);
		const scope = createScope(container);
		const native = scope.resolve('native');
		// factory が返した Promise そのものではなく、記帳を済ませた chain の末端を渡す。
		expect(native).not.toBe(promise);
		await expect(native).rejects.toBe(denied);
		await expect(scope.resolve('alias')).rejects.toBe(denied);
		await using operations = createScope(container, { access: 'operations' });
		await expect(operations.get('run')()).rejects.toBe(denied);
		expect(origins.map(registrations => registrations.map(r => r.token))).toEqual([
			['native'],
			['native', 'alias'],
			['native', 'alias', 'async'],
		]);
	});
});
