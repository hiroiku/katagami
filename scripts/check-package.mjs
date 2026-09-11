import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

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
	const checks = `
class Service { read() { return 'ok'; } }
const root = createContainer().registerSingleton(Service, () => new Service());
const scope = createScope(root);
assert.equal(lazy(scope, Service).read(), 'ok');
assert.equal(createScope(disposable(root)).resolve(Service).read(), 'ok');
await disposable(scope)[Symbol.asyncDispose]();
assert.throws(() => scope.resolve(Service), /disposed/);
`;
	writeFileSync(
		join(consumer, 'esm.mjs'),
		`
import assert from 'node:assert/strict';
import { createContainer, createScope } from 'katagami';
import { disposable } from 'katagami/disposable';
import { lazy } from 'katagami/lazy';
${checks}`,
	);
	writeFileSync(
		join(consumer, 'commonjs.cjs'),
		`
const assert = require('node:assert/strict');
const { createContainer, createScope } = require('katagami');
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
import { createContainer, createScope } from 'katagami';
import { disposable as esmDisposable } from 'katagami/disposable';
const require = createRequire(import.meta.url);
const cjs = require('katagami');
const { disposable: cjsDisposable } = require('katagami/disposable');
let cleanups = 0;
for (const [core, dispose] of [
  [{ createContainer, createScope }, cjsDisposable],
  [cjs, esmDisposable],
]) {
  const root = core.createContainer().registerScoped('resource', () => ({
    [Symbol.dispose]() { cleanups++; },
  }));
  const scope = core.createScope(root);
  scope.resolve('resource');
  await dispose(scope)[Symbol.asyncDispose]();
}
assert.equal(cleanups, 2);
`,
	);
	run(process.execPath, ['mixed.mjs'], consumer);
	writeFileSync(
		join(consumer, 'types.ts'),
		`
import { createContainer, createScope } from 'katagami';
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
`,
	);
	writeFileSync(join(consumer, 'types.cts'), readFileSync(join(consumer, 'types.ts'), 'utf8'));
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
			include: ['types.ts', 'types.cts'],
		}),
	);
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
