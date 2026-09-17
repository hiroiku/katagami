import { describe, expect, test } from 'bun:test';
import { disposable } from '../disposable/index.js';
import { createContainer, createMetadataKey, createScope, entrypoint } from '../index.js';

describe('登録の metadata', () => {
	test('属性を読むために factory を実行せず、最後の登録を選ぶ', () => {
		const area = createMetadataKey<string>()('area');
		const optional = createMetadataKey<number>()('optional');
		let calls = 0;
		const c = createContainer({ requiredMetadata: [area] })
			.registerScoped(
				'service',
				() => {
					calls++;
					return 1;
				},
				{ metadata: [area('first')] },
			)
			.registerScoped(
				'service',
				entrypoint(() => () => 2),
				{ metadata: [area('last'), optional(3)] },
			);
		const metadata = c.getMetadata('service');
		expect(metadata.require(area)).toBe('last');
		expect(metadata.get(optional)).toBe(3);
		expect(metadata.has(area)).toBe(true);
		const missing = createMetadataKey<string>()('missing');
		expect(metadata.get(missing)).toBeUndefined();
		expect(() => metadata.require(missing)).toThrow('Required metadata');
		expect(calls).toBe(0);
		expect(() => c.getMetadata('missing' as never)).toThrow('not registered');
		expect(Object.isFrozen(metadata)).toBe(true);
	});
	test('配列の変更が登録済み属性を書き換えない', () => {
		const key = createMetadataKey<string>()('area');
		const entries = [key('first')];
		const c = createContainer().registerSingleton('value', () => 1, { metadata: entries });
		entries[0] = key('changed');
		expect(c.getMetadata('value').require(key)).toBe('first');
	});
	test('欠落、同名別 identity、偽の entry、重複を生成前に拒否する', () => {
		const key = createMetadataKey<string>()('area');
		const twin = createMetadataKey<string>()('area');
		const c = createContainer({ requiredMetadata: [key] });
		expect(() => c.registerScoped('missing', () => 1, { metadata: [] } as never)).toThrow('Required metadata');
		expect(() => c.registerScoped('twin', () => 1, { metadata: [twin('a')] })).toThrow('Required metadata');
		expect(() => c.registerScoped('invalid', () => 1, { metadata: [{}] } as never)).toThrow('Invalid metadata');
		expect(() => c.registerScoped('duplicate', () => 1, { metadata: [key('a'), key('b')] })).toThrow(
			'Duplicate metadata',
		);
		expect(() => c.registerScoped('same-name', () => 1, { metadata: [key('a'), twin('b')] })).toThrow(
			'Duplicate metadata',
		);
		expect(() => createContainer({ requiredMetadata: [key, key] })).toThrow('Duplicate required');
		expect(() => createContainer({ requiredMetadata: [{}] } as never)).toThrow('Invalid metadata key');
	});
	test('use は全登録を確認してから反映する', () => {
		const key = createMetadataKey<string>()('area');
		const destination = createContainer({ requiredMetadata: [key] }).registerSingleton('original', () => 1, {
			metadata: [key('a')],
		});
		const invalid = createContainer()
			.registerSingleton('original', () => 2, { metadata: [key('a')] })
			.registerSingleton('missing', () => 3);
		expect(() => destination.use(invalid as never)).toThrow('Required metadata');
		expect(createScope(destination).resolve('original')).toBe(1);
		const twin = createMetadataKey<string>()('area');
		expect(() => destination.use(createContainer().registerScoped('twin', () => 1, { metadata: [twin('a')] }))).toThrow(
			'Required metadata',
		);
		const valid = createContainer().registerScoped('added', () => 4, { metadata: [key('b')] });
		expect(createScope(destination.use(valid)).resolve('added')).toBe(4);
	});
	test('symbol 名と値型を持つキーも同じ規約で使える', () => {
		const key = createMetadataKey<number>()(Symbol('count'));
		const c = createContainer({ requiredMetadata: [key] }).registerTransient('n', () => 1, { metadata: [key(3)] });
		expect(c.getMetadata('n').require(key)).toBe(3);
	});
	test('終了したコンテナーを登録で再利用しない', async () => {
		const c = createContainer();
		await disposable(c)[Symbol.asyncDispose]();
		expect(() => c.registerScoped('late', () => 1)).toThrow('disposed');
		expect(() => c.use(createContainer())).toThrow('disposed');
	});
});
