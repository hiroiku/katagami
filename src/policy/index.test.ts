import { describe, expect, test } from 'bun:test';
import { bindPolicy, checkReturn, observe } from '../container/policy.js';
import { disposable } from '../disposable/index.js';
import {
	type AnyMetadataEntry,
	type Container,
	type ContainerPolicy,
	createContainer,
	createMetadataKey,
	createScope,
	entrypoint,
	type MetadataReader,
	type ReturnEvent,
} from '../index.js';
import type { Registration } from '../resolver/index.js';

describe('共有 policy の固定と合成', () => {
	test('不正な設定型とアクセサーを利用開始前に拒否する', () => {
		for (const policy of [null, 1, { name: 1 }, { requiredMetadata: 'area' }, { beforeReturn: 1 }]) {
			expect(() => createContainer({ policy: policy as never })).toThrow();
		}
		let getterCalls = 0;
		const policy = Object.defineProperty({}, 'name', {
			get() {
				getterCalls++;
				return 'dynamic';
			},
		});
		expect(() => createContainer({ policy })).toThrow('data properties');
		expect(getterCalls).toBe(0);
	});

	test('利用者の定義を freeze せず、必須キーと hook の内部 snapshot を固定する', async () => {
		const area = createMetadataKey<string>()('area');
		const changed = createMetadataKey<string>()('changed');
		const keys = [area];
		const seen: string[] = [];
		const policy = {
			beforeReturn() {
				seen.push('original');
			},
			name: 'original',
			requiredMetadata: keys,
		} satisfies ContainerPolicy;
		const c = createContainer({ policy });
		expect(Object.isFrozen(policy)).toBe(false);
		expect(Object.isFrozen(keys)).toBe(false);
		keys.splice(0, keys.length);
		policy.name = 'changed';
		policy.beforeReturn = () => {
			seen.push('changed');
		};
		expect(() => c.registerScoped('missing', () => 1, { metadata: [] } as never)).toThrow('Required metadata');
		expect(() => c.registerScoped('other', () => 1, { metadata: [changed('x')] } as never)).toThrow(
			'Required metadata',
		);
		const configured = c.registerScoped(
			'run',
			entrypoint(() => () => 1),
			{ metadata: [area('public')] },
		);
		await using operations = createScope(configured, { access: 'operations' });
		expect(await operations.get('run')()).toBe(1);
		expect(seen).toEqual(['original']);
		expect(() => createContainer({ policy })).toThrow();
	});
	test('同じ定義の再利用時は name、キーの並びと参照、hook の変更を検出する', () => {
		const first = createMetadataKey<string>()('first');
		const second = createMetadataKey<string>()('second');
		const twin = createMetadataKey<string>()('first');
		for (const change of ['name', 'order', 'identity', 'hook'] as const) {
			const policy = {
				beforeReturn() {
					return undefined;
				},
				name: 'shared',
				requiredMetadata: [first, second],
			} satisfies ContainerPolicy;
			createContainer({ policy });
			createContainer({ policy });
			if (change === 'name') {
				policy.name = 'changed';
			}
			if (change === 'order') {
				policy.requiredMetadata.reverse();
			}
			if (change === 'identity') {
				policy.requiredMetadata[0] = twin;
			}
			if (change === 'hook') {
				policy.beforeReturn = () => undefined;
			}
			expect(() => createContainer({ policy })).toThrow();
		}
	});
	test('同じ policy を合成し、未指定の部品は全登録を検査して受け入れる', () => {
		const area = createMetadataKey<string>()('area');
		const policy = { requiredMetadata: [area] as const } satisfies ContainerPolicy;
		const same = createContainer({ policy }).registerScoped('same', () => 1, { metadata: [area('core')] });
		const neutral = createContainer().registerScoped('neutral', () => 2, { metadata: [area('core')] });
		const root = createContainer({ policy }).use(same).use(neutral);
		expect(createScope(root).resolve('same')).toBe(1);
		expect(createScope(root).resolve('neutral')).toBe(2);
	});
	test('同名でも別 policy と policy 付き部品の未指定 root への合成を原子的に拒否する', () => {
		const policy = { name: 'shared' } satisfies ContainerPolicy;
		const sameName = { name: 'shared' } satisfies ContainerPolicy;
		const root = createContainer({ policy }).registerScoped('original', () => 1);
		const foreign = createContainer({ policy: sameName })
			.registerScoped('original', () => 2)
			.registerScoped('added', () => 3);
		expect(() => root.use(foreign)).toThrow();
		expect(createScope(root).resolve('original')).toBe(1);
		expect(createScope(root).tryResolve('added')).toBeUndefined();
		const neutral = createContainer().registerScoped('original', () => 4);
		expect(() => neutral.use(root)).toThrow();
		expect(createScope(neutral).resolve('original')).toBe(4);
	});
	test('型消去後も上書き前の欠落を拒否し、resolveAll 用履歴を一部だけ取り込まない', () => {
		const area = createMetadataKey<string>()('area');
		const policy = { requiredMetadata: [area] as const } satisfies ContainerPolicy;
		const root = createContainer({ policy }).registerScoped('value', () => 0, { metadata: [area('root')] });
		const erased: Container<{ value: number }> = createContainer()
			.registerScoped('value', () => 1)
			.registerScoped('value', () => 2, { metadata: [area('classified')] });
		expect(() => root.use(erased as never)).toThrow('Required metadata');
		expect(createScope(root).resolveAll('value')).toEqual([0]);
	});
	test('同じ policy でも別 root の singleton cache を共有せず、use は登録だけを合成する', () => {
		const policy = {} satisfies ContainerPolicy;
		let created = 0;
		const component = createContainer({ policy }).registerSingleton('value', () => ({ id: ++created }));
		const root = createContainer({ policy }).use(component);
		const first = createScope(component).resolve('value');
		const second = createScope(root).resolve('value');
		expect(first).not.toBe(second);
		expect([first.id, second.id]).toEqual([1, 2]);
	});
});

describe('観測した実体の出自と返却検査', () => {
	test('同期・非同期・alias・cache の出自を累積し、同じ登録は重複させない', async () => {
		const area = createMetadataKey<string>()('area');
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
			requiredMetadata: [area] as const,
		} satisfies ContainerPolicy;
		const value = {};
		const c = createContainer({ policy })
			.registerSingleton('base', () => value, { metadata: [area('capability')] })
			.registerScoped('asyncAlias', async r => r.resolve('base'), { metadata: [area('async')] })
			.registerScoped('alias', r => r.resolve('asyncAlias'), { metadata: [area('alias')] })
			.registerScoped(
				'read',
				entrypoint(r => async () => {
					const result = await r.resolve('alias');
					await r.resolve('alias');
					return result;
				}),
				{ metadata: [area('public')] },
			);
		await using operations = createScope(c, { access: 'operations' });
		expect(await operations.get('read')()).toBe(value);
		expect(await operations.get('read')()).toBe(value);
		for (const registrations of seen) {
			expect(registrations.map(r => r.token)).toEqual(['base', 'asyncAlias', 'alias']);
			expect(registrations.map(r => r.metadata.require(area))).toEqual(['capability', 'async', 'alias']);
		}
	});
	test('関数実体も追跡し、旧登録・resolveAll・transient の出自を参照ごとに保つ', async () => {
		const area = createMetadataKey<string>()('area');
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		} satisfies ContainerPolicy;
		const original = () => 1;
		let next = original;
		const c = createContainer({ policy }).registerTransient('value', () => next, { metadata: [area('old')] });
		const resolver = createScope(c);
		expect(resolver.resolve('value')).toBe(original);
		next = () => 2;
		const newer = resolver.resolve('value');
		c.registerTransient('value', () => original, { metadata: [area('new')] });
		resolver.resolveAll('value');
		// 最上位の解決と resolveAll の各要素も、外へ出る時点で検査する。
		expect(seen.map(registrations => registrations.map(r => r.metadata.require(area)))).toEqual([
			['old'],
			['old'],
			['old'],
			['old', 'new'],
		]);
		const returning = createContainer({ policy }).registerScoped(
			'return',
			entrypoint(() => (value: () => number) => value),
		);
		await using operations = createScope(returning, { access: 'operations' });
		expect(await operations.get('return')(original)).toBe(original);
		expect(seen.at(-1)?.map(r => r.metadata.require(area))).toEqual(['old', 'new']);
		expect(await operations.get('return')(newer)).toBe(newer);
		expect(seen.at(-1)?.map(r => r.metadata.require(area))).toEqual(['old']);
	});
	test('親子・兄弟・同 policy の別 root と終了後でも出自を共有する', async () => {
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		} satisfies ContainerPolicy;
		const value = {};
		const owner = createContainer({ policy }).registerScoped('owned', () => value);
		const parent = disposable(createScope(owner));
		const left = disposable(createScope(parent));
		const right = disposable(createScope(parent));
		parent.resolve('owned');
		left.resolve('owned');
		right.resolve('owned');
		await left[Symbol.asyncDispose]();
		await right[Symbol.asyncDispose]();
		await parent[Symbol.asyncDispose]();
		const other = createContainer({ policy })
			.registerScoped('alias', () => value)
			.registerScoped(
				'read',
				entrypoint(r => () => r.resolve('alias')),
			);
		await using operations = createScope(other, { access: 'operations' });
		expect(await operations.get('read')()).toBe(value);
		expect(seen.map(registrations => registrations.map(r => r.token))).toEqual([
			['owned'],
			['owned'],
			['owned'],
			['owned', 'alias'],
		]);
	});
	test('同名の別 policy と policy 未指定の出自は合流しない', async () => {
		const value = {};
		const first = {
			beforeReturn() {
				throw new Error('foreign policy');
			},
			name: 'same',
		} satisfies ContainerPolicy;
		const seen: ReturnEvent['registrations'][] = [];
		const second = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
			name: 'same',
		} satisfies ContainerPolicy;
		// 別 policy の面では自分の検査だけが働き、出自はその方針の中にとどまる。
		expect(() =>
			createScope(createContainer({ policy: first }).registerScoped('foreign', () => value)).resolve('foreign'),
		).toThrow('foreign policy');
		createScope(createContainer().registerScoped('neutral', () => value)).resolve('neutral');
		const c = createContainer({ policy: second }).registerScoped(
			'read',
			entrypoint(() => () => value),
		);
		await using operations = createScope(c, { access: 'operations' });
		expect(await operations.get('read')()).toBe(value);
		expect(seen).toEqual([[]]);
		await using neutral = createScope(
			createContainer().registerScoped(
				'read',
				entrypoint(() => () => value),
			),
			{ access: 'operations' },
		);
		expect(await neutral.get('read')()).toBe(value);
	});
	test('primitive・未観測・入れ子の正常値は空の出自で、reject 理由は検査しない', async () => {
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		} satisfies ContainerPolicy;
		const value = {};
		const unobserved = {};
		const failure = new Error('failed', { cause: value });
		const c = createContainer({ policy })
			.registerScoped('observed', () => value)
			.registerScoped('unobserved', () => unobserved)
			.registerSingleton('primitive', () => 1)
			.registerScoped(
				'read',
				entrypoint(() => (result: unknown) => result),
			)
			.registerScoped(
				'fail',
				entrypoint(() => async () => {
					throw failure;
				}),
			);
		const resolver = createScope(c);
		resolver.resolve('observed');
		resolver.resolve('primitive');
		expect(seen.map(registrations => registrations.map(r => r.token))).toEqual([['observed'], []]);
		await using operations = createScope(c, { access: 'operations' });
		for (const result of [1, 'value', Symbol('value'), null, undefined, unobserved, { value }, () => value]) {
			expect(await operations.get('read')(result)).toBe(result);
		}
		expect(seen.slice(2)).toEqual(Array.from({ length: 8 }, () => []));
		await expect(operations.get('fail')()).rejects.toBe(failure);
		expect(seen).toHaveLength(10);
	});
	test('出自 snapshot は後から増えず、読み取り専用として渡す', async () => {
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		} satisfies ContainerPolicy;
		const value = {};
		const c = createContainer({ policy })
			.registerScoped('first', () => value)
			.registerScoped('second', () => value)
			.registerScoped(
				'read',
				entrypoint(() => () => value),
			);
		const resolver = createScope(c);
		resolver.resolve('first');
		await using operations = createScope(c, { access: 'operations' });
		await operations.get('read')();
		resolver.resolve('second');
		await operations.get('read')();
		expect(seen.map(registrations => registrations.map(r => r.token))).toEqual([
			['first'],
			['first'],
			['first', 'second'],
			['first', 'second'],
		]);
		expect(Object.isFrozen(seen[0])).toBe(true);
		expect(Object.isFrozen(seen[0]?.[0])).toBe(true);
		expect(Object.isFrozen(seen[0]?.[0]?.metadata)).toBe(true);
	});
	test('要求ごとに作り直した同じ内容の登録は、コンテナーの数によらず 1 つの出自として渡す', () => {
		const area = createMetadataKey<string>()('area');
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
			requiredMetadata: [area] as const,
		} satisfies ContainerPolicy;
		class Shared {}
		for (let index = 0; index < 1000; index++) {
			// 要求ごとの組み立てを模し、登録・factory・属性の entry を毎回作り直す。
			const c = createContainer({ policy })
				.registerTransient('shared', () => Shared, { metadata: [area('capability')] })
				.registerScoped('alias', r => r.resolve('shared'), { metadata: [area('public')] });
			expect(createScope(c).resolve('alias')).toBe(Shared);
		}
		expect(seen).toHaveLength(1000);
		expect(new Set(seen.map(registrations => registrations.length))).toEqual(new Set([2]));
		expect(seen.at(-1)?.map(r => [r.token, r.lifetime, r.entrypoint, r.metadata.require(area)])).toEqual([
			['shared', 'transient', false, 'capability'],
			['alias', 'scoped', false, 'public'],
		]);
	});
	test('token・lifetime・entrypoint・属性のどれかが違う出自はすべて渡し、内容が同じ登録だけをまとめる', () => {
		const area = createMetadataKey<string>()('area');
		const sameName = createMetadataKey<string>()('area');
		const extra = createMetadataKey<number>()('extra');
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		} satisfies ContainerPolicy;
		const value = () => 'shared';
		const resolvers: [token: string, resolver: { resolve(token: string): unknown }][] = [
			[
				'value',
				createScope(createContainer({ policy }).registerScoped('value', () => value, { metadata: [area('a')] })),
			],
			// 別のコンテナー・factory・entry でも、内容が同じなら先の出自と区別できない。
			[
				'value',
				createScope(createContainer({ policy }).registerScoped('value', () => value, { metadata: [area('a')] })),
			],
			[
				'other',
				createScope(createContainer({ policy }).registerScoped('other', () => value, { metadata: [area('a')] })),
			],
			[
				'value',
				createScope(createContainer({ policy }).registerSingleton('value', () => value, { metadata: [area('a')] })),
			],
			[
				'value',
				createScope(
					createContainer({ policy }).registerScoped(
						'value',
						entrypoint(() => value),
						{ metadata: [area('a')] },
					),
				),
			],
			[
				'value',
				createScope(createContainer({ policy }).registerScoped('value', () => value, { metadata: [area('b')] })),
			],
			[
				'value',
				createScope(createContainer({ policy }).registerScoped('value', () => value, { metadata: [sameName('a')] })),
			],
			[
				'value',
				createScope(
					createContainer({ policy }).registerScoped('value', () => value, { metadata: [area('a'), extra(1)] }),
				),
			],
			['value', createScope(createContainer({ policy }).registerScoped('value', () => value))],
		];
		for (const [token, resolver] of resolvers) {
			expect(resolver.resolve(token)).toBe(value);
		}
		expect(
			seen
				.at(-1)
				?.map(r => [
					r.token,
					r.lifetime,
					r.entrypoint,
					r.metadata.get(area),
					r.metadata.get(sameName),
					r.metadata.get(extra),
				]),
		).toEqual([
			['value', 'scoped', false, 'a', undefined, undefined],
			['other', 'scoped', false, 'a', undefined, undefined],
			['value', 'singleton', false, 'a', undefined, undefined],
			['value', 'scoped', true, 'a', undefined, undefined],
			['value', 'scoped', false, 'b', undefined, undefined],
			['value', 'scoped', false, undefined, 'a', undefined],
			['value', 'scoped', false, 'a', undefined, 1],
			['value', 'scoped', false, undefined, undefined, undefined],
		]);
	});
	test('属性は並びを問わず、token と属性の値は Object.is で比べて出自をまとめる', () => {
		const area = createMetadataKey<string>()('area');
		const score = createMetadataKey<number>()('score');
		const seen: ReturnEvent['registrations'][] = [];
		const policy = {
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		} satisfies ContainerPolicy;
		const value = {};
		const origins: [token: PropertyKey, metadata: readonly AnyMetadataEntry[]][] = [
			['value', [area('a'), score(1)]],
			['value', [score(1), area('a')]],
			['value', [score(Number.NaN)]],
			['value', [score(Number.NaN)]],
			['value', [score(0)]],
			['value', [score(-0)]],
			[Number.NaN, []],
			[Number.NaN, []],
		];
		for (const [token, metadata] of origins) {
			const c = createContainer({ policy }).registerScoped(token, () => value, { metadata });
			expect(createScope(c).resolve(token)).toBe(value);
		}
		// toEqual の数値比較に頼らず、NaN と -0 を文字列で区別して比べる。
		const show = (n: unknown) => {
			if (Object.is(n, -0)) {
				return '-0';
			}
			return String(n);
		};
		expect(seen.at(-1)?.map(r => [show(r.token), show(r.metadata.get(area)), show(r.metadata.get(score))])).toEqual([
			['value', 'a', '1'],
			['value', 'undefined', 'NaN'],
			['value', 'undefined', '0'],
			['value', 'undefined', '-0'],
			['NaN', 'undefined', 'undefined'],
		]);
	});
	test('属性の組を持たない登録は、同じ reader ならまとめ、比べられなければ別の出自として残す', () => {
		const seen: ReturnEvent['registrations'][] = [];
		const policy = bindPolicy({
			beforeReturn({ registrations }) {
				seen.push(registrations);
			},
		});
		const value = {};
		const reader: MetadataReader = Object.freeze({
			get: () => undefined,
			has: () => false,
			require: () => {
				throw new Error('missing');
			},
		});
		const other: MetadataReader = Object.freeze({ ...reader });
		// 組を作らないビルドが作った登録を、組を欠いた形で模す。
		const foreign = (metadata: MetadataReader) =>
			({ entrypoint: false, factory: () => value, lifetime: 'scoped', metadata }) as unknown as Registration;
		observe(policy, foreign(reader), 'value', value);
		observe(policy, foreign(reader), 'value', value);
		observe(policy, foreign(other), 'value', value);
		checkReturn(policy, value);
		expect(seen.at(-1)?.map(r => r.metadata)).toEqual([reader, other]);
		expect(seen.at(-1)?.[0]?.metadata).toBe(reader);
		expect(seen.at(-1)?.[1]?.metadata).toBe(other);
	});
	test('返却拒否は直接の正常終了値を外へ渡さず、拒否の cause を保持する', async () => {
		const area = createMetadataKey<string>()('area');
		const detail = new Error('specific reason');
		const denied = new Error('capability denied', { cause: detail });
		const policy = {
			beforeReturn({ registrations }) {
				if (registrations.some(r => r.metadata.get(area) === 'capability')) {
					throw denied;
				}
			},
		} satisfies ContainerPolicy;
		const value = {};
		const c = createContainer({ policy })
			.registerScoped('private', async () => value, { metadata: [area('capability')] })
			.registerScoped(
				'read',
				entrypoint(r => async () => await r.resolve('private')),
			);
		await using operations = createScope(c, { access: 'operations' });
		await expect(operations.get('read')()).rejects.toBe(denied);
		expect(denied.cause).toBe(detail);
	});
	test('最上位の解決は禁じた値を外へ出さず、factory が要求した解決では拒まない', async () => {
		const area = createMetadataKey<string>()('area');
		const denied = new Error('capability denied');
		const policy = {
			beforeReturn({ registrations }) {
				if (registrations.some(r => r.metadata.get(area) === 'capability')) {
					throw denied;
				}
			},
		} satisfies ContainerPolicy;
		const capability = { read: () => 'secret' };
		const c = createContainer({ policy })
			.registerSingleton('capability', () => capability, { metadata: [area('capability')] })
			.registerScoped('asyncCapability', async () => capability, { metadata: [area('capability')] })
			.registerScoped('projection', r => ({ value: r.resolve('capability').read() }), { metadata: [area('public')] })
			.registerScoped('asyncProjection', async r => ({ value: (await r.resolve('asyncCapability')).read() }), {
				metadata: [area('public')],
			})
			.registerScoped('directProjection', () => ({ value: scope.resolve('capability').read() }), {
				metadata: [area('public')],
			});
		const scope = createScope(c);
		// 内: factory が要求した解決では拒まず、同期・非同期の投影は外へ出せる。
		expect(scope.resolve('projection')).toEqual({ value: 'secret' });
		// factory が生成中の scope を同期に直接呼んでも、その factory の内側の解決として扱う。
		expect(scope.resolve('directProjection')).toEqual({ value: 'secret' });
		expect(await scope.resolve('asyncProjection')).toEqual({ value: 'secret' });
		// 外: 最上位の解決は、同期の factory の値も非同期 factory の解決値も拒む。
		expect(() => scope.resolve('capability')).toThrow('capability denied');
		expect(() => scope.tryResolve('capability')).toThrow('capability denied');
		expect(() => scope.resolveAll('capability')).toThrow('capability denied');
		await expect(scope.resolve('asyncCapability')).rejects.toBe(denied);
		await expect(scope.tryResolveAll('asyncCapability')?.[0]).rejects.toBe(denied);
		expect(scope.tryResolve('unknown')).toBeUndefined();
	});
	test('最上位の resolveAll は要素ごとに生成と検査を行い、拒否した後の factory を実行しない', () => {
		const area = createMetadataKey<string>()('area');
		const order: string[] = [];
		const policy = {
			beforeReturn({ registrations }) {
				order.push(`check:${registrations.map(r => String(r.token)).join(',')}`);
				if (registrations.some(r => r.metadata.get(area) === 'capability')) {
					throw new Error('capability denied');
				}
			},
		} satisfies ContainerPolicy;
		const c = createContainer({ policy })
			.registerScoped(
				'multi',
				() => {
					order.push('factory:first');
					return {};
				},
				{ metadata: [area('capability')] },
			)
			.registerScoped(
				'multi',
				() => {
					order.push('factory:second');
					return {};
				},
				{ metadata: [area('public')] },
			);
		expect(() => createScope(c).resolveAll('multi')).toThrow('capability denied');
		expect(order).toEqual(['factory:first', 'check:multi']);
	});
	test('非同期 beforeReturn と値を返す hook は結果変換として受理しない', async () => {
		for (const beforeReturn of [
			async () => undefined,
			() => 'replacement',
			async () => {
				await Promise.resolve();
				throw new Error('async denied');
			},
		]) {
			const c = createContainer({ policy: { beforeReturn } }).registerScoped(
				'run',
				entrypoint(() => () => 'original'),
			);
			await using operations = createScope(c, { access: 'operations' });
			await expect(operations.get('run')()).rejects.toThrow();
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	});
});
