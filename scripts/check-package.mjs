import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const scratch = mkdtempSync(join(tmpdir(), 'katagami-package-'));
const env = { ...process.env, npm_config_cache: join(scratch, 'cache') };
const run = (command, args, cwd) =>
	execFileSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
	const [pack] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], root));
	assert.ok(pack.files.some(file => file.path === 'docs/ai-coding-agents.md'));
	assert.ok(pack.files.some(file => file.path === 'docs/type-safety.md'));
	assert.ok(pack.files.some(file => file.path === 'llms.txt'));
	assert.ok(!pack.files.some(file => file.path.endsWith('typetest.ts')));
	const consumer = join(scratch, 'consumer');
	mkdirSync(consumer);
	writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
	run(
		'npm',
		[
			'install',
			'--offline',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			'--package-lock=false',
			join(scratch, pack.filename),
		],
		consumer,
	);
	const installed = JSON.parse(readFileSync(join(consumer, 'node_modules/katagami/package.json'), 'utf8'));
	assert.equal(
		Object.keys(installed.dependencies ?? {}).length,
		0,
		'The published package must have zero dependencies.',
	);
	// 共有キーに手で書いた版を、配る dist と package.json の版で突き合わせる。版を上げてキーを書き忘れると、
	// 内部の形や出自の記録が異なる版どうしで混ざるため。
	const shipped = join(consumer, 'node_modules/katagami/dist');
	const sharedKeys = new Set();
	for (const file of readdirSync(shipped, { recursive: true })) {
		if (!/\.c?js$/.test(file)) continue;
		const source = readFileSync(join(shipped, file), 'utf8');
		for (const match of source.matchAll(/Symbol\.for\(\s*["'`](katagami\.[^"'`]+)["'`]\s*\)/g)) {
			sharedKeys.add(match[1]);
		}
	}
	const major = installed.version.split('.')[0];
	// 同じメジャー版のビルドどうしで内部の形を共有するキー。
	const majorBound = new Set(['internals', 'creations', 'constructing']);
	// 利用者が持つ値に付ける目印。目印の形式の世代で区別し、パッケージの版とは結び付けない。
	const formatMarkers = new Set(['entrypoint', 'metadata-key', 'metadata-entry']);
	const classified = new Set();
	for (const key of sharedKeys) {
		// 完全な版を埋め込むキーは、同じ版どうしでだけ共有する。
		const pinned = /^katagami\.([a-z-]+)\.(\d+\.\d+\.\d+)\.v\d+$/.exec(key);
		if (pinned) {
			assert.equal(pinned[2], installed.version, `Shared key ${key} must embed version ${installed.version}.`);
			classified.add(pinned[1]);
			continue;
		}
		const generation = /^katagami\.([a-z-]+)\.v(\d+)$/.exec(key);
		assert.ok(generation, `Shared key ${key} has no recognised version suffix.`);
		const [, name, value] = generation;
		if (majorBound.has(name)) {
			assert.equal(value, major, `Shared key ${key} must use major version ${major}.`);
		} else {
			assert.ok(formatMarkers.has(name), `Shared key ${key} is neither major-bound nor a format marker.`);
		}
		classified.add(name);
	}
	for (const name of [...majorBound, ...formatMarkers, 'policy-state']) {
		assert.ok(classified.has(name), `Shared key for ${name} is missing from the shipped dist.`);
	}
	const checks = `
class Service { read() { return 'ok'; } }
const root = createContainer().registerSingleton(Service, () => new Service());
const scope = createScope(root);
assert.equal(lazy(scope, Service).read(), 'ok');
assert.equal(createScope(disposable(root)).resolve(Service).read(), 'ok');
await disposable(scope)[Symbol.asyncDispose]();
assert.throws(() => scope.resolve(Service), /disposed/);
const area = createMetadataKey()('area');
const policy = { requiredMetadata: [area], beforeReturn({ registrations }) {
 if (registrations.some(r => r.metadata.require(area) === 'capability')) throw new Error('direct capability');
} };
const configured = createContainer({ policy })
 .registerScoped('private', () => 4, { metadata: [area('core')] })
 .registerScoped('capability', async () => ({}), { metadata: [area('capability')] })
 .registerScoped('add', entrypoint(r => n => r.resolve('private') + n), { metadata: [area('public')] })
 .registerScoped('leak', entrypoint(r => async () => await r.resolve('capability')), { metadata: [area('public')] });
const calls = createScope(configured, { access: 'operations' });
const add = calls.get('add');
assert.equal(await add(3), 7);
assert.throws(() => calls.get('private'), /not an entrypoint/);
await assert.rejects(calls.get('leak')(), /direct capability/);
await calls[Symbol.asyncDispose]();
await assert.rejects(add(3), /disposed/);
const fresh = createScope(configured, { access: 'operations' });
assert.equal(await fresh.get('add')(1), 5);
await fresh[Symbol.asyncDispose]();
for (const access of ['operation', 'resolver', null]) {
 assert.throws(() => createScope(configured, { access }), /Unknown scope access/);
}
for (const policy of [undefined, {}]) {
 let subscriptions = 0;
 const handle = { status: () => 'ready', then(resolve) { resolve({ execution: ++subscriptions }); } };
 const container = createContainer({ policy })
  .registerScoped('handle', () => handle)
  .registerScoped('run', entrypoint(r => () => r.resolve('handle')));
 const scope = createScope(container);
 const resolved = scope.resolve('handle');
 assert.equal(resolved, handle);
 assert.equal(scope.resolve('handle'), handle);
 assert.equal(resolved.status(), 'ready');
 await Promise.resolve();
 assert.equal(subscriptions, 0);
 const operations = createScope(container, { access: 'operations' });
 assert.deepEqual(await operations.get('run')(), { execution: 1 });
 assert.deepEqual(await operations.get('run')(), { execution: 2 });
 assert.equal(subscriptions, 2);
 await operations[Symbol.asyncDispose]();
}
`;
	writeFileSync(
		join(consumer, 'esm.mjs'),
		`
import assert from 'node:assert/strict';
import { createContainer, createScope, createMetadataKey, entrypoint } from 'katagami';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
${checks}`,
	);
	writeFileSync(
		join(consumer, 'commonjs.cjs'),
		`
const assert = require('node:assert/strict');
const { createContainer, createScope, createMetadataKey, entrypoint } = require('katagami');
const { disposable } = require('katagami/disposable');
const { lazy } = require('katagami/lazy');
(async () => { ${checks} })().catch(error => { console.error(error); process.exitCode = 1; });`,
	);
	run(process.execPath, ['esm.mjs'], consumer);
	run(process.execPath, ['commonjs.cjs'], consumer);
	writeFileSync(
		join(consumer, 'mixed.mjs'),
		`
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createContainer, createScope, createMetadataKey, entrypoint } from 'katagami';
import { disposable as esmDisposable } from 'katagami/disposable';
const require = createRequire(import.meta.url);
const cjs = require('katagami');
const { disposable: cjsDisposable } = require('katagami/disposable');
let cleanups = 0;
for (const [core, dispose] of [
  [{ createContainer, createScope }, cjsDisposable],
  [cjs, esmDisposable],
]) {
  const root = core.createContainer()
    .registerScoped('resource', () => ({
      [Symbol.dispose]() { cleanups++; },
    }))
    .registerScoped('asyncResource', async () => ({
      [Symbol.dispose]() { cleanups++; },
    }));
  const scope = core.createScope(root);
  scope.resolve('resource');
  await scope.resolve('asyncResource');
  await dispose(scope)[Symbol.asyncDispose]();
}
assert.equal(cleanups, 4);
await assert.rejects(import('katagami/invocation'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
assert.throws(() => require('katagami/invocation'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
for (const [first, second, decorate] of [
 [{ createContainer, createScope }, cjs, cjs],
 [cjs, { createContainer, createScope }, { createMetadataKey, entrypoint }],
]) {
 const key = decorate.createMetadataKey()('area');
 const value = {};
 const records = [];
 const policy = { name: 'shared', requiredMetadata: [key], beforeReturn({ registrations }) {
  records.push(registrations);
  if (registrations.some(r => r.metadata.require(key) === 'capability')) throw new Error('shared capability');
 } };
 const source = first.createContainer({ policy }).registerScoped('origin', async () => value, { metadata: [key('capability')] });
 const root = second.createContainer({ policy })
  .registerScoped('alias', () => value, { metadata: [key('alias')] })
  .registerScoped('read', decorate.entrypoint(r => () => r.resolve('alias')), { metadata: [key('public')] });
 const observed = first.createScope(source);
 // 最上位の解決でも共有した方針が能力の返却を拒む。出自は拒否の前に記録する。
 await assert.rejects(observed.resolve('origin'), /shared capability/);
 await esmDisposable(observed)[Symbol.asyncDispose]();
 const operations = second.createScope(root, { access: 'operations' });
 await assert.rejects(operations.get('read')(), /shared capability/);
 assert.deepEqual(records.map(r => r.map(e => e.token)), [['origin'], ['origin', 'alias']]);
 await operations[Symbol.asyncDispose]();
 assert.throws(() => second.createContainer().use(source));
 const merged = second.createContainer({ policy })
  .use(source)
  .registerScoped('projection', async r => ({ same: (await r.resolve('origin')) === value }), { metadata: [key('public')] });
 assert.deepEqual(await second.createScope(merged).resolve('projection'), { same: true });
 const isolatedRecords = [];
 const separate = { name: 'shared', beforeReturn({ registrations }) { isolatedRecords.push(registrations); } };
 const independent = first.createScope(first.createContainer({ policy: separate }).registerScoped('read', decorate.entrypoint(() => () => value)), { access: 'operations' });
 assert.equal(await independent.get('read')(), value);
 assert.deepEqual(isolatedRecords, [[]]);
 await independent[Symbol.asyncDispose]();
 policy.name = 'changed';
 assert.throws(() => second.createContainer({ policy }), /changed/);
}
// 別のコピーの scope を経由して戻った解決は外側からの解決として扱い、同期の循環はコピーをまたいでも検出する。
for (const [outer, inner] of [[{ createContainer, createScope }, cjs], [cjs, { createContainer, createScope }]]) {
 const events = [];
 const beforeResolve = e => { events.push(String(e.token) + '<-' + String(e.requester?.token ?? '-')); };
 let first;
 const other = inner.createScope(inner.createContainer().registerScoped('x', () => first.resolve('y')), { beforeResolve });
 first = outer.createScope(outer.createContainer().registerScoped('a', () => other.resolve('x')).registerScoped('y', () => 'y'), { beforeResolve });
 assert.equal(first.resolve('a'), 'y');
 assert.deepEqual(events, ['a<--', 'x<--', 'y<--']);
 let s1;
 const s2 = inner.createScope(inner.createContainer().registerScoped('x', () => s1.resolve('y')));
 s1 = outer.createScope(outer.createContainer().registerScoped('a', () => s2.resolve('x')).registerScoped('y', r => r.resolve('a')));
 assert.throws(() => s1.resolve('a'), /Circular dependency detected: a -> y -> a/);
}

`,
	);
	run(process.execPath, ['mixed.mjs'], consumer);
	writeFileSync(
		join(consumer, 'unhandled.mjs'),
		`
import assert from 'node:assert/strict';
import { createContainer, createScope, entrypoint } from 'katagami';
import { disposable } from 'katagami/disposable';
const reasons = [];
process.on('unhandledRejection', reason => { reasons.push(reason); });
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
const creation = new Error('creation failed');
const container = createContainer().registerScoped('broken', async () => { throw creation; });
// 渡した Promise を捨てれば、その失敗は処理系の既定どおり現れる。
void createScope(container).resolve('broken');
await settle();
assert.deepEqual(reasons, [creation]);
// 受け取った失敗は二重に報告しない。
await assert.rejects(createScope(container).resolve('broken'), /creation failed/);
await settle();
assert.deepEqual(reasons, [creation]);
const operationFailure = new Error('operation failed');
const operations = createScope(
 createContainer().registerScoped('fail', entrypoint(() => () => { throw operationFailure; })),
 { access: 'operations' },
);
void operations.get('fail')();
await settle();
assert.deepEqual(reasons, [creation, operationFailure]);
await operations[Symbol.asyncDispose]();
// 破棄は閉じる対象を自分の記帳から取るので、捨てられた生成の失敗を横取りしない。
const closed = new Error('closed while dropped');
const disposedScope = disposable(createScope(createContainer().registerScoped('broken', async () => { throw closed; })));
void disposedScope.resolve('broken');
await disposedScope[Symbol.asyncDispose]();
await settle();
assert.deepEqual(reasons, [creation, operationFailure, closed]);
// 終了の待ち合わせも、捨てられた操作とその内部解決の失敗を横取りしない。
const pendingFailure = new Error('pending operation dropped');
const insideFailure = new Error('inside dropped');
let release;
const gate = new Promise(resolve => { release = resolve; });
const overlapping = createScope(
 createContainer()
  .registerScoped('inside', async () => { throw insideFailure; })
  .registerScoped('slow', entrypoint(r => async () => { void r.resolve('inside'); await gate; throw pendingFailure; })),
 { access: 'operations' },
);
void overlapping.get('slow')();
const closing = overlapping[Symbol.asyncDispose]();
release();
await closing;
await settle();
assert.deepEqual(reasons, [creation, operationFailure, closed, insideFailure, pendingFailure]);
`,
	);
	run(process.execPath, ['unhandled.mjs'], consumer);
	// 回収の有無は同じプロセスの検査に混ぜず、--expose-gc で起動した別プロセスで確かめる。
	writeFileSync(
		join(consumer, 'gc.mjs'),
		`
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from 'katagami';
import { disposable } from 'katagami/disposable';
const cjs = createRequire(import.meta.url)('katagami');
const area = esm.createMetadataKey()('area');
const events = [];
const policy = { requiredMetadata: [area], beforeReturn({ registrations }) {
 events.push(registrations.map(r => r.token).join());
} };
// 要求をまたいで生きる値。出自の記録はこの値に結び付いて残る。
class Shared {}
const refs = [];
let finalized = 0;
const finalization = new FinalizationRegistry(() => { finalized++; });
async function request(core, index) {
 // factory のクロージャーだけが持つ値。出自の記録から登録へ到達できると、これも回収されない。
 const captured = { index };
 const container = core.createContainer({ policy })
  .registerTransient('shared', () => { void captured; return Shared; }, { metadata: [area('capability')] })
  .registerScoped('alias', r => r.resolve('shared'), { metadata: [area('public')] })
  .registerScoped('read', core.entrypoint(r => () => { void captured; return r.resolve('alias'); }), { metadata: [area('public')] });
 const scope = core.createScope(container);
 assert.equal(scope.resolve('alias'), Shared);
 await disposable(scope)[Symbol.asyncDispose]();
 const operations = core.createScope(container, { access: 'operations' });
 assert.equal(await operations.get('read')(), Shared);
 await operations[Symbol.asyncDispose]();
 for (const target of [captured, container, scope, operations]) {
  refs.push(new WeakRef(target));
  finalization.register(target, undefined);
 }
}
const requests = 1000;
for (let index = 0; index < requests; index++) {
 await request(index % 2 === 0 ? esm : cjs, index);
}
// ESM と CJS のどちらで作った登録も、内容が同じなら 1 つの出自にまとまる。
assert.deepEqual(new Set(events), new Set(['shared,alias']));
assert.equal(events.length, requests * 2);
// 回収と FinalizationRegistry の通知は非同期に進むので、揃うまで回収を繰り返す。
const alive = () => refs.filter(ref => ref.deref() !== undefined).length;
for (let round = 0; round < 50 && (alive() > 0 || finalized < refs.length); round++) {
 await new Promise(resolve => setTimeout(resolve, 0));
 globalThis.gc();
}
assert.equal(alive(), 0, 'Origin records must not keep containers, scopes or factory closures alive.');
assert.equal(finalized, refs.length);
// 回収の後も出自の記録は値に残り、区別できる出自の数のまま渡る。
await request(esm, requests);
assert.deepEqual(events.slice(-2), ['shared,alias', 'shared,alias']);
`,
	);
	run(process.execPath, ['--expose-gc', 'gc.mjs'], consumer);
	writeFileSync(
		join(consumer, 'types.ts'),
		`
import { createContainer, createScope, createMetadataKey, entrypoint, type ContainerPolicy } from 'katagami';
import { disposable } from 'katagami/disposable';
const root = disposable(createContainer()
  .registerSingleton('sync', () => 'ok')
  .registerScoped('async', async () => 1));
const scope = createScope(disposable(createScope(root)));
const sync: string = scope.resolve('sync');
const asyncValue: Promise<number> = scope.resolve('async');
// @ts-expect-error — a disposable view cannot introduce a missing token
scope.resolve('missing');
// @ts-expect-error — class identity must not be widened by the disposable view
scope.resolve(Date);
// @ts-expect-error — the async result must stay asynchronous
const wrong: number = scope.resolve('async');
const handle = { status: () => 'ready' as const, then(resolve: (value: number) => void) { resolve(1); } };
const thenableContainer = createContainer({ policy: {} }).registerScoped('handle', () => handle)
 .registerScoped('read', entrypoint(r => () => r.resolve('handle')));
const original: typeof handle = createScope(thenableContainer).resolve('handle');
const status: 'ready' = original.status();
const awaited: Promise<number> = createScope(thenableContainer, { access: 'operations' }).get('read')();
// @ts-expect-error 通常 DI は thenable を native Promise の型へ置き換えない
const changed: Promise<number> = original;
const area = createMetadataKey<string>()('area');
const other = createMetadataKey<string>()('other');
const policy = { requiredMetadata: [area] as const, beforeReturn({ registrations }) {
 const value: string | undefined = registrations[0]?.metadata.get(area);
} } satisfies ContainerPolicy;
const configured = createContainer({ policy });
// @ts-expect-error 必須属性の欠落を拒否する
configured.registerScoped('missing', () => 1);
// @ts-expect-error 同値型でも別名のキーでは満たせない
configured.registerScoped('wrong', () => 1, { metadata: [other('x')] });
const exposed = configured.registerScoped('read', entrypoint(() => (n: number) => n + 1), { metadata: [area('core')] });
const calls = createScope(exposed, { access: 'operations' });
const value: Promise<number> = calls.get('read')(1);
// @ts-expect-error 入力型を失わない
calls.get('read')('wrong');
// @ts-expect-error 未登録の操作を呼び出せない
calls.get('unknown')();
`,
	);
	writeFileSync(join(consumer, 'types.cts'), readFileSync(join(consumer, 'types.ts'), 'utf8'));
	const scopeOptionsFixture = readFileSync(join(root, 'src/scope/typetest.ts'), 'utf8')
		.replaceAll("from '../index.js'", "from 'katagami'")
		.replaceAll("from '../disposable/index.js'", "from 'katagami/disposable'");
	writeFileSync(join(consumer, 'scope-options.ts'), scopeOptionsFixture);
	writeFileSync(join(consumer, 'scope-options.cts'), scopeOptionsFixture);

	writeFileSync(
		join(consumer, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				noEmit: true,
				types: [],
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				lib: ['ES2022', 'ESNext.Disposable'],
			},
			include: ['types.ts', 'types.cts', 'scope-options.ts', 'scope-options.cts'],
		}),
	);
	run(process.execPath, [tsc, '-p', 'tsconfig.json'], consumer);
	const publicFactory = `
import { createContainer, createScope, createMetadataKey, entrypoint, type ContainerPolicy, type OperationsScopeOptions } from 'katagami';
export const AREA = createMetadataKey<'core'>()('area');
export const POLICY = { requiredMetadata: [AREA] as const, beforeReturn({ registrations }) {
 const value: 'core' | undefined = registrations[0]?.metadata.get(AREA);
} } satisfies ContainerPolicy;
export function createComponent({ policy }: { policy: typeof POLICY }) {
 const component = createContainer({ policy });
 // @ts-expect-error 部品の受け渡しでも必須属性の欠落を拒否する
 component.registerScoped('missing', () => 1);
 return component.registerScoped('read', entrypoint(() => (id: string, count?: number, ...flags: boolean[]) => ({ id, count, flags })), { metadata: [AREA('core')] });
}
export function createWorkUnit() {
 const container = createContainer({ policy: POLICY }).use(createComponent({ policy: POLICY }));
 const options = { access: 'operations', beforeResolve(event) { const token: unknown = event.token; } } satisfies OperationsScopeOptions;
 const scope = createScope(container, options);
 return { get: scope.get, read: scope.get('read') };
}
export function createDeclaredComponent() {
 const c = createContainer<{ external: number }, Record<never, never>, typeof POLICY>({ policy: POLICY });
 // @ts-expect-error 事前宣言でも必須属性の欠落を拒否する
 c.registerSingleton('external', () => 1);
 return c.registerSingleton('external', () => 1, { metadata: [AREA('core')] });
}
`;
	writeFileSync(join(consumer, 'declaration.ts'), publicFactory);
	writeFileSync(join(consumer, 'declaration.cts'), publicFactory);
	writeFileSync(
		join(consumer, 'tsconfig.declarations.json'),
		JSON.stringify({
			extends: './tsconfig.json',
			compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: 'declarations' },
			include: ['declaration.ts', 'declaration.cts'],
		}),
	);
	run(process.execPath, [tsc, '-p', 'tsconfig.declarations.json'], consumer);
	const declarationConsumer = `
import { createWorkUnit, createDeclaredComponent } from './declarations/declaration.js';
import { createScope } from 'katagami';
const { get, read } = createWorkUnit();
const value: Promise<{ id: string; count: number | undefined; flags: boolean[] }> = read('id', 2, true);
get('read')('id');
// @ts-expect-error emit 後にも非公開トークンを取得できない
get('missing');
// @ts-expect-error emit 後にも引数型を保持する
read('id', 'invalid');
const declared: number = createScope(createDeclaredComponent()).resolve('external');
`;
	writeFileSync(join(consumer, 'types.ts'), declarationConsumer);
	writeFileSync(join(consumer, 'types.cts'), declarationConsumer.replace('declaration.js', 'declaration.cjs'));
	run(process.execPath, [tsc, '-p', 'tsconfig.json'], consumer);

	cpSync(join(root, 'examples/request-scope'), join(consumer, 'starter'), { recursive: true });
	run(process.execPath, [tsc, '-p', 'starter/tsconfig.json'], consumer);
	const output = run(process.execPath, ['starter/build/demo.js'], consumer);
	assert.match(output, /Hello, Ada!/);
	assert.match(output, /Hello, guest!/);
	console.log(
		`Packed ${pack.filename}: ${pack.size} bytes compressed. ESM, CommonJS, declarations and starter passed on ${process.version}.`,
	);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
