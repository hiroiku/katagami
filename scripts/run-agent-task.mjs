import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const [task, variant] = process.argv.slice(2);
if (
	!['baseline', 'add-dependency', 'request-isolation', 'async-dependency'].includes(task) ||
	!['manual', 'katagami'].includes(variant)
) {
	throw new Error('Usage: node scripts/run-agent-task.mjs <baseline|task-id> <manual|katagami>');
}
const root = process.cwd();
const fixture = resolve(`benchmarks/agent-wiring/fixtures/${variant}/app.ts`);
const source = readFileSync(fixture, 'utf8');
assert.ok(!/@ts-(?:ignore|expect-error|nocheck)/.test(source), 'Type suppressions are not allowed in trial code.');
const ast = ts.createSourceFile(fixture, source, ts.ScriptTarget.Latest, true);
function rejectBypasses(node) {
	assert.ok(
		node.kind !== ts.SyntaxKind.AnyKeyword && !ts.isAsExpression(node) && !ts.isTypeAssertionExpression(node),
		'Type widening/assertions are not allowed in trial code.',
	);
	ts.forEachChild(node, rejectBypasses);
}
rejectBypasses(ast);
const config = ts.readConfigFile('tsconfig.examples.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram([fixture], { ...parsed.options, rootDir: root });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
assert.equal(
	diagnostics.length,
	0,
	diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'),
);

const scratch = mkdtempSync(join(tmpdir(), 'katagami-agent-task-'));
try {
	const outfile = join(scratch, 'app.mjs');
	await build({
		entryPoints: [fixture],
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		tsconfig: 'tsconfig.examples.json',
	});
	const { createApp } = await import(pathToFileURL(outfile).href);
	const repository = { findName: async id => (id === 'missing' ? undefined : `user-${id}`) };
	const input = repo => (task === 'async-dependency' ? async () => repo : repo);
	const cleaned = [];
	const app = createApp(input(repository), id => cleaned.push(id));
	const [first, second] = await Promise.all([app('a'), app('b')]);
	assert.equal(first.message, 'Hello, user-a!');
	assert.equal(second.message, 'Hello, user-b!');
	assert.notEqual(first.requestId, second.requestId);
	assert.deepEqual(cleaned.slice().sort(), [first.requestId, second.requestId].sort());
	assert.equal((await app('missing')).message, 'Hello, guest!');
	const failure = new Error('repository failed');
	const failedCleanup = [];
	const broken = createApp(
		input({
			findName: async () => {
				throw failure;
			},
		}),
		id => failedCleanup.push(id),
	);
	await assert.rejects(broken('a'), error => error === failure);
	assert.equal(failedCleanup.length, 1);
	if (task === 'add-dependency') {
		const formatted = createApp(
			repository,
			() => {},
			name => `Welcome, ${name}.`,
		);
		assert.equal((await formatted('a')).message, 'Welcome, user-a.');
		assert.equal((await formatted('missing')).message, 'Welcome, guest.');
	} else if (task === 'request-isolation') {
		assert.equal(first.auditRequestId, first.requestId);
		assert.equal(second.auditRequestId, second.requestId);
	} else if (task === 'async-dependency') {
		let loads = 0;
		const initialized = createApp(async () => {
			loads++;
			return repository;
		});
		await Promise.all([initialized('a'), initialized('b')]);
		assert.equal(loads, 1);
		const loadError = new Error('initialization failed');
		const rejects = createApp(async () => {
			throw loadError;
		});
		await assert.rejects(rejects('a'), error => error === loadError);
	}
	console.log(`${variant}/${task}: strict type check and shared acceptance tests passed.`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
