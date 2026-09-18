import { disposable } from '../disposable/index.js';
import { createContainer, createScope, entrypoint, type OperationsScopeOptions, type ScopeOptions } from '../index.js';

const container = createContainer()
	.registerScoped('private', () => 1)
	.registerScoped(
		'read',
		entrypoint(r => (increment: number) => r.resolve('private') + increment),
	);
const scope = createScope(container);
const disposableContainer = disposable(container);
const disposableScope = disposable(scope);

const widenedOptions = {
	access: 'operations',
	beforeResolve() {
		return undefined;
	},
};
// @ts-expect-error access が string に広がった変数を通常 scope の overload へ落とさない。
createScope(container, widenedOptions);
// @ts-expect-error 親が Scope でも access の意図を消去しない。
createScope(scope, widenedOptions);
// @ts-expect-error 親が DisposableContainer でも access の意図を消去しない。
createScope(disposableContainer, widenedOptions);
// @ts-expect-error 親が DisposableScope でも access の意図を消去しない。
createScope(disposableScope, widenedOptions);
// @ts-expect-error ScopeOptions へ退避しても operations の設定を通常 scope として渡せない。
const _hiddenWidenedOptions: ScopeOptions = widenedOptions;

// @ts-expect-error 書き間違えた access を通常 scope の指定として受け付けない。
createScope(container, { access: 'operation' });
// @ts-expect-error 親が Scope でも書き間違えた access を受け付けない。
createScope(scope, { access: 'Operations' });
// @ts-expect-error 親が DisposableContainer でも書き間違えた access を受け付けない。
createScope(disposableContainer, { access: 'resolver' });
// @ts-expect-error 親が DisposableScope でも書き間違えた access を受け付けない。
createScope(disposableScope, { access: '' });

const operationsOptions = {
	access: 'operations',
	beforeResolve(event) {
		const _token: unknown = event.token;
	},
} satisfies OperationsScopeOptions;
// @ts-expect-error literal を保持した場合も通常 ScopeOptions との互換性は持たない。
const _hiddenOperationsOptions: ScopeOptions = operationsOptions;
const annotatedOperationsOptions: OperationsScopeOptions = operationsOptions;
// @ts-expect-error 公開型への注釈でも通常 ScopeOptions に意図を隠せない。
const _hiddenAnnotatedOptions: ScopeOptions = annotatedOperationsOptions;

for (const operations of [
	createScope(container, operationsOptions),
	createScope(scope, operationsOptions),
	createScope(disposableContainer, operationsOptions),
	createScope(disposableScope, operationsOptions),
	createScope(container, annotatedOperationsOptions),
	createScope(container, { access: 'operations' }),
	createScope(scope, { access: 'operations' }),
	createScope(disposableContainer, { access: 'operations' }),
	createScope(disposableScope, { access: 'operations' }),
]) {
	const _result: Promise<number> = operations.get('read')(1);
	// @ts-expect-error 公開操作の引数型を保持する。
	void operations.get('read')('invalid');
	// @ts-expect-error operations scope は resolver を公開しない。
	operations.resolve('private');
	// @ts-expect-error 非公開依存は操作として取得できない。
	operations.get('private');
}

const ordinaryOptions = {
	beforeResolve(event) {
		const _token: unknown = event.token;
	},
} satisfies ScopeOptions;
const annotatedOrdinaryOptions: ScopeOptions = ordinaryOptions;
for (const ordinary of [
	createScope(container),
	createScope(scope),
	createScope(disposableContainer),
	createScope(disposableScope),
	createScope(container, ordinaryOptions),
	createScope(scope, ordinaryOptions),
	createScope(disposableContainer, ordinaryOptions),
	createScope(disposableScope, ordinaryOptions),
	createScope(container, annotatedOrdinaryOptions),
	createScope(container, {}),
	createScope(scope, {}),
	createScope(disposableContainer, {}),
	createScope(disposableScope, {}),
]) {
	const _value: number = ordinary.resolve('private');
	const _operation: (increment: number) => number = ordinary.resolve('read');
	// @ts-expect-error 通常 scope の公開面を operations と誤認しない。
	ordinary.get('read');
}
