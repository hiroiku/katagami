/** Executable contracts for the guarantees described in docs/type-safety.md. */

import { disposable } from '../../disposable';
import { createScope } from '../../scope';
import { createContainer } from '..';

const DB = Symbol('database');
const MISSING = Symbol('database');

const accumulated = createContainer()
	.registerSingleton('database', () => ({ query: () => 'ok' }))
	.registerSingleton(DB, async () => ({ query: () => 'async' }))
	.registerScoped('requestId', () => 'request-1');

const scope = createScope(accumulated);
const _query: string = scope.resolve('database').query();
const _async: Promise<{ query: () => string }> = scope.resolve(DB);
// @ts-expect-error — a literal key must have been accumulated through registration
scope.resolve('missing');
// @ts-expect-error — symbols with the same description still have distinct identities
scope.resolve(MISSING);
// @ts-expect-error — asynchronous factories cannot be used as synchronous values
scope.resolve(DB).query();

createContainer()
	.registerScoped('requestId', () => 'request-1')
	// @ts-expect-error — singleton factories do not receive scoped tokens
	.registerSingleton('handler', r => r.resolve('requestId'));

createContainer()
	.registerScoped('requestId', () => 'request-1')
	// @ts-expect-error — transient factories do not receive scoped tokens either
	.registerTransient('handler', r => r.resolve('requestId'));

// Disposable views must preserve registration identity, lifetimes and async types.
const wrapped = disposable(accumulated);
const fromContainer = createScope(wrapped);
const fromScope = createScope(disposable(fromContainer));
const nested = createScope(disposable(fromScope));
for (const view of [fromContainer, fromScope, nested]) {
	const _sync: string = view.resolve('database').query();
	const _request: string = view.resolve('requestId');
	const _promise: Promise<{ query: () => string }> = view.resolve(DB);
	// @ts-expect-error — wrapping does not introduce registrations
	view.resolve('missing');
	// @ts-expect-error — wrapping does not introduce class registrations
	view.resolve(Date);
	// @ts-expect-error — wrapping does not introduce symbol registrations
	view.resolve(MISSING);
	// @ts-expect-error — wrapping must retain the asynchronous result
	const _wrong: { query: () => string } = view.resolve(DB);
}

abstract class SyncService {
	public abstract sync: string;
}
abstract class AsyncService {
	public abstract async: string;
}
abstract class ScopedService {
	public abstract scoped: string;
}
abstract class MissingService {
	public abstract missing: string;
}
const classes = disposable(
	createContainer()
		.registerSingleton(SyncService, () => ({ sync: 'ok' }))
		.registerSingleton(AsyncService, async () => ({ async: 'ok' }))
		.registerScoped(ScopedService, () => ({ scoped: 'ok' })),
);
const classScope = createScope(disposable(createScope(classes)));
const _syncClass: SyncService = classScope.resolve(SyncService);
const _asyncClass: Promise<AsyncService> = classScope.resolve(AsyncService);
const _scopedClass: ScopedService = classScope.resolve(ScopedService);
// @ts-expect-error — a structurally distinct, unregistered class is rejected
classScope.resolve(MissingService);

// Documented boundaries: these compile; a runtime registration is still required.
interface DeclaredServices {
	logger: { log: (message: string) => void };
}
createScope(createContainer<DeclaredServices>()).resolve('logger');

class SameShapeA {
	public value = 1;
}
class SameShapeB {
	public value = 1;
}
createScope(createContainer().registerSingleton(SameShapeA, () => new SameShapeA())).resolve(SameShapeB);

// Separate private member declarations distinguish otherwise identical class tokens.
class BrandedA {
	private declare brand: undefined;
	public value = 1;
}
class BrandedB {
	private declare brand: undefined;
	public value = 1;
}
const branded = createScope(createContainer().registerSingleton(BrandedA, () => new BrandedA()));
// @ts-expect-error — private members declared in different classes are incompatible
branded.resolve(BrandedB);
