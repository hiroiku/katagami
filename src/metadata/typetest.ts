import { disposable } from '../disposable/index.js';
import {
	Container,
	createContainer,
	createMetadataKey,
	createScope,
	entrypoint,
	type RegisteredTokens,
} from '../index.js';

const area = createMetadataKey<'core' | 'other'>()('area');
const other = createMetadataKey<'core' | 'other'>()('other');
const required = createContainer({ policy: { requiredMetadata: [area] } });
// @ts-expect-error 必須属性を省略できない。
required.registerScoped('missing', () => 1);
// @ts-expect-error 空の属性では不足する。
required.registerTransient('empty', () => 1, { metadata: [] });
// @ts-expect-error 同じ値型でも別名のキーでは満たせない。
required.registerSingleton('wrong', () => 1, { metadata: [other('core')] });
// @ts-expect-error キーが受け取る値型を維持する。
area('invalid');
const container = required
	.registerSingleton('number', () => 3, { metadata: [area('core')] })
	.registerScoped(
		'read',
		entrypoint(r => (prefix: string) => prefix + r.resolve('number')),
		{ metadata: [area('other')] },
	);
const view = createScope(container, { access: 'operations' });
const _result: Promise<string> = view.get('read')('value:');
// @ts-expect-error 非公開の登録は呼び出せない。
void view.get('number')();
// @ts-expect-error 入力型を維持する。
void view.get('read')(3);
// @ts-expect-error 未登録は呼び出せない。
void view.get('unknown')();
// @ts-expect-error resolver 本体を公開しない。
view.resolve('number');
const _token: RegisteredTokens<typeof container> = 'read';
// @ts-expect-error 実登録済みトークンだけが対象。
const _absent: RegisteredTokens<typeof container> = 'absent';
const replacement = createContainer().registerScoped('read', () => 42, { metadata: [area('core')] });
const replaced = createScope(container.use(replacement), { access: 'operations' });
// @ts-expect-error use が非公開登録で置き換えた公開性は残さない。
void replaced.get('read')('value:');
// @ts-expect-error use も必須属性の不足を拒否する。
required.use(createContainer().registerScoped('unclassified', () => 1));
const _scoped = createContainer()
	.registerScoped('local', () => 1)
	.registerSingleton(
		'invalid',
		entrypoint(r => () => {
			// @ts-expect-error 修飾子を挟んでも singleton から scoped へ依存できない。
			return r.resolve('local');
		}),
	);
const asyncContainer = createContainer().registerScoped(
	'async',
	entrypoint(async () => (n: number) => n + 1),
);
const _asyncResult: Promise<number> = createScope(asyncContainer, { access: 'operations' }).get('async')(1);
const disposed = disposable(container);
const _value: number = createScope(disposed).resolve('number');
const _disposedResult: Promise<string> = createScope(disposed, { access: 'operations' }).get('read')('value:');

const _declared = createContainer<
	{ external: number },
	Record<never, never>,
	{ requiredMetadata: readonly [typeof area] }
>({
	policy: { requiredMetadata: [area] },
}).registerScoped(
	'operation',
	entrypoint(r => () => r.resolve('external')),
	{ metadata: [area('core')] },
);
const duplicate = createContainer()
	.registerScoped('duplicate', () => 1)
	.registerScoped('duplicate', () => 2, { metadata: [area('core')] });
// @ts-expect-error resolveAll で選ばれる古い登録にも必須属性が必要。
required.use(duplicate);

const legacy: Container<{ number: number; read: (prefix: string) => string }> = createContainer()
	.registerSingleton('number', () => 1)
	.registerSingleton('read', () => (prefix: string) => prefix);
const _legacyValue: number = createScope(legacy).resolve('number');
// @ts-expect-error 履歴を消去した従来の注釈は、必須属性があるという証拠にならない。
required.use(legacy);
// @ts-expect-error 履歴を消去した従来の注釈から公開操作を捏造しない。
void createScope(legacy, { access: 'operations' }).get('read')('x');

const constructed = new Container().registerScoped(
	'constructed',
	entrypoint(() => (n: number) => n + 1),
);
const _constructedResult: Promise<number> = createScope(constructed, { access: 'operations' }).get('constructed')(1);
// @ts-expect-error constructor 経由でも未登録操作は公開しない。
void createScope(constructed, { access: 'operations' }).get('unknown')();

let reassigned = createContainer<{ old: number }>();
const legacyHelper = (input: Container<{ old: number }>): Container<{ old: number }> =>
	input.registerSingleton('old', () => 1);
reassigned = legacyHelper(reassigned);
const legacyOther: Container<{ other: number }> = createContainer().registerSingleton('other', () => 1);
const legacyOverlap: Container<{ constructed: number }> = createContainer().registerSingleton('constructed', () => 2);
const combined = constructed.use(legacyOther);
const _preserved: Promise<number> = createScope(combined, { access: 'operations' }).get('constructed')(1);
const overwritten = combined.use(legacyOverlap);
// @ts-expect-error 消去された履歴でも宣言トークンとの重なりは非公開として扱う。
void createScope(overwritten, { access: 'operations' }).get('constructed')(1);

const predeclaredOther = createContainer<{ other: number }>().registerSingleton('other', () => 1);
const publicOwner = createContainer().registerScoped(
	'operation',
	entrypoint(() => () => 1),
);
const mixedLegacy = createContainer().use(publicOwner).use(predeclaredOther);
const _mixedLegacyResult: Promise<number> = createScope(mixedLegacy, { access: 'operations' }).get('operation')();
const nestedComposition = createContainer().use(mixedLegacy).use(predeclaredOther);
const _nestedResult: Promise<number> = createScope(nestedComposition, { access: 'operations' }).get('operation')();
// @ts-expect-error 混在状態でも不明履歴は必須属性を満たす証拠にはならない。
required.use(predeclaredOther);

const oldChild = createContainer<{ old: number }>().registerSingleton('old', () => 1);
let legacyComposite = createContainer<{ old: number }>().use(oldChild);
legacyComposite = legacyHelper(legacyComposite);
let legacyAccumulateChild = createContainer<{ old: number }>().use(createContainer().registerSingleton('old', () => 1));
legacyAccumulateChild = legacyHelper(legacyAccumulateChild);
const afterLegacyComposition = legacyComposite.use(publicOwner).use(predeclaredOther);
const _afterLegacy: Promise<number> = createScope(afterLegacyComposition, { access: 'operations' }).get('operation')();

interface ExistingValues {
	number: number;
	text: string;
}
const existingValues: ExistingValues = { number: 1, text: 'value' };
let dynamicRegistration = createContainer<ExistingValues>();
for (const key of ['number', 'text'] as const) {
	dynamicRegistration = dynamicRegistration.registerTransient(key, () => existingValues[key]);
}
const _exactNumber: number = createScope(dynamicRegistration).resolve('number');
const _exactText: string = createScope(dynamicRegistration).resolve('text');
const _transientDenied = createContainer()
	.registerScoped('local', () => 1)
	.registerTransient(
		'operation',
		entrypoint(r => () => {
			// @ts-expect-error entrypoint でも transient factory に scoped 依存を渡さない。
			return r.resolve('local');
		}),
	);

const POLICY = {
	beforeReturn({ registrations }) {
		const _value: 'core' | 'other' | undefined = registrations[0]?.metadata.require(area);
		// @ts-expect-error 出自一覧は読み取り専用。
		registrations.push(registrations[0]);
		if (registrations[0]) {
			// @ts-expect-error 出自の登録内容は読み取り専用。
			registrations[0].token = 'replacement';
		}
	},
	name: 'typed',
	requiredMetadata: [area] as const,
} satisfies import('../index.js').ContainerPolicy;
function createComponent({ policy, areas }: { policy: typeof POLICY; areas: { read: 'core' | 'other' } }) {
	const component = createContainer({ policy });
	// @ts-expect-error 部品へ渡しても必須キーの具体型を消去しない。
	component.registerScoped('missing', () => 1);
	return component.registerScoped(
		'component',
		entrypoint(() => (id: string, count?: number, ...flags: boolean[]) => ({ count, flags, id })),
		{ metadata: [area(areas.read)] },
	);
}
const composed = createContainer({ policy: POLICY }).use(createComponent({ areas: { read: 'core' }, policy: POLICY }));
const componentOperation = createScope(composed, { access: 'operations' }).get('component');
const _componentResult: Promise<{ id: string; count: number | undefined; flags: boolean[] }> = componentOperation(
	'id',
	2,
	true,
	false,
);
void componentOperation('id');
// @ts-expect-error 固定引数を省略できない。
void componentOperation();
// @ts-expect-error optional 引数の型を保持する。
void componentOperation('id', 'bad');
// @ts-expect-error rest 引数の型を保持する。
void componentOperation('id', 2, 'bad');
const declaredWithPolicy = createContainer<{ external: number }, Record<never, never>, typeof POLICY>({
	policy: POLICY,
});
// @ts-expect-error Services 事前宣言でも必須 metadata を省略できない。
declaredWithPolicy.registerSingleton('external', () => 1);
const declaredRegistered = declaredWithPolicy.registerSingleton('external', () => 1, { metadata: [area('core')] });
const _declaredToken: RegisteredTokens<typeof declaredRegistered> = 'external';
const _declaredValue: number = createScope(declaredRegistered).resolve('external');
// @ts-expect-error policy 外の requiredMetadata は受け付けない。
createContainer({ requiredMetadata: [area] });
