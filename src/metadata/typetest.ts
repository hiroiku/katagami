import { disposable } from '../disposable/index.js';
import {
	Container,
	createContainer,
	createMetadataKey,
	createScope,
	entrypoint,
	type RegisteredTokens,
} from '../index.js';
import { createInvocationScope } from '../invocation/index.js';

const area = createMetadataKey<'core' | 'other'>()('area');
const other = createMetadataKey<'core' | 'other'>()('other');
const required = createContainer({ requiredMetadata: [area] });
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
const view = createInvocationScope(container);
const _result: Promise<string> = view.invoke('read', 'value:');
// @ts-expect-error 非公開の登録は呼び出せない。
void view.invoke('number');
// @ts-expect-error 入力型を維持する。
void view.invoke('read', 3);
// @ts-expect-error 未登録は呼び出せない。
void view.invoke('unknown');
// @ts-expect-error resolver 本体を公開しない。
view.resolve('number');
const _token: RegisteredTokens<typeof container> = 'read';
// @ts-expect-error 実登録済みトークンだけが対象。
const _absent: RegisteredTokens<typeof container> = 'absent';
const replacement = createContainer().registerScoped('read', () => 42, { metadata: [area('core')] });
const replaced = createInvocationScope(container.use(replacement));
// @ts-expect-error use が非公開登録で置き換えた公開性は残さない。
void replaced.invoke('read', 'value:');
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
const _asyncResult: Promise<number> = createInvocationScope(asyncContainer).invoke('async', 1);
const disposed = disposable(container);
const _value: number = createScope(disposed).resolve('number');
const _disposedResult: Promise<string> = createInvocationScope(disposed).invoke('read', 'value:');

const _declared = createContainer<{ external: number }, Record<never, never>, readonly [typeof area]>({
	requiredMetadata: [area],
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
void createInvocationScope(legacy).invoke('read', 'x');

const constructed = new Container().registerScoped(
	'constructed',
	entrypoint(() => (n: number) => n + 1),
);
const _constructedResult: Promise<number> = createInvocationScope(constructed).invoke('constructed', 1);
// @ts-expect-error constructor 経由でも未登録操作は公開しない。
void createInvocationScope(constructed).invoke('unknown');

let reassigned = createContainer<{ old: number }>();
const legacyHelper = (input: Container<{ old: number }>): Container<{ old: number }> =>
	input.registerSingleton('old', () => 1);
reassigned = legacyHelper(reassigned);
const legacyOther: Container<{ other: number }> = createContainer().registerSingleton('other', () => 1);
const legacyOverlap: Container<{ constructed: number }> = createContainer().registerSingleton('constructed', () => 2);
const combined = constructed.use(legacyOther);
const _preserved: Promise<number> = createInvocationScope(combined).invoke('constructed', 1);
const overwritten = combined.use(legacyOverlap);
// @ts-expect-error 消去された履歴でも宣言トークンとの重なりは非公開として扱う。
void createInvocationScope(overwritten).invoke('constructed', 1);

const predeclaredOther = createContainer<{ other: number }>().registerSingleton('other', () => 1);
const publicOwner = createContainer().registerScoped(
	'operation',
	entrypoint(() => () => 1),
);
const mixedLegacy = createContainer().use(publicOwner).use(predeclaredOther);
const _mixedLegacyResult: Promise<number> = createInvocationScope(mixedLegacy).invoke('operation');
const nestedComposition = createContainer().use(mixedLegacy).use(predeclaredOther);
const _nestedResult: Promise<number> = createInvocationScope(nestedComposition).invoke('operation');
// @ts-expect-error 混在状態でも不明履歴は必須属性を満たす証拠にはならない。
required.use(predeclaredOther);

const oldChild = createContainer<{ old: number }>().registerSingleton('old', () => 1);
let legacyComposite = createContainer<{ old: number }>().use(oldChild);
legacyComposite = legacyHelper(legacyComposite);
let legacyAccumulateChild = createContainer<{ old: number }>().use(createContainer().registerSingleton('old', () => 1));
legacyAccumulateChild = legacyHelper(legacyAccumulateChild);
const afterLegacyComposition = legacyComposite.use(publicOwner).use(predeclaredOther);
const _afterLegacy: Promise<number> = createInvocationScope(afterLegacyComposition).invoke('operation');

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
