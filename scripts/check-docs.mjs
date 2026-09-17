import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
function markdownFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		if (entry.name === 'node_modules' || entry.name === 'build') return [];
		const file = join(directory, entry.name);
		return entry.isDirectory() ? markdownFiles(file) : file.endsWith('.md') ? [file] : [];
	});
}
const docs = [
	...readdirSync(root)
		.filter(file => file.endsWith('.md'))
		.map(file => join(root, file)),
	...['docs', 'examples', 'benchmarks'].flatMap(directory => markdownFiles(join(root, directory))),
];
const scratch = mkdtempSync(join(tmpdir(), 'katagami-docs-'));
const origins = new Map();
const failures = [];
try {
	for (const file of docs) {
		const source = readFileSync(file, 'utf8');
		const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
		for (const link of prose.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
			const target = link[1];
			if (/^(?:[a-z]+:|#|\/)/i.test(target)) continue;
			const pathname = decodeURIComponent(target.split(/[?#]/)[0]);
			if (pathname && !existsSync(resolve(dirname(file), pathname))) {
				failures.push(`${relative(root, file)}: broken link ${target}`);
			}
		}
		for (const block of source.matchAll(/^```(?:ts|typescript)\s*\n([\s\S]*?)^```\s*$/gm)) {
			const snippet = join(scratch, `snippet-${origins.size}.ts`);
			const startLine = source.slice(0, block.index).split('\n').length + 1;
			origins.set(snippet, { file, startLine });
			writeFileSync(snippet, `${block[1]}\nexport {};\n`);
		}
	}
	const program = ts.createProgram([...origins.keys()], {
		strict: true,
		noEmit: true,
		types: [],
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		lib: ['lib.es2022.d.ts', 'lib.esnext.disposable.d.ts', 'lib.dom.d.ts'],
		paths: {
			katagami: [join(root, 'src/index.ts')],
			'katagami/disposable': [join(root, 'src/disposable/index.ts')],
			'katagami/lazy': [join(root, 'src/lazy/index.ts')],
			'katagami/invocation': [join(root, 'src/invocation/index.ts')],
		},
	});
	for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
		const origin = origins.get(diagnostic.file?.fileName);
		const line =
			diagnostic.file && diagnostic.start !== undefined
				? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line
				: 0;
		const location = origin
			? `${relative(root, origin.file)}:${origin.startLine + line}`
			: (diagnostic.file?.fileName ?? 'TypeScript');
		failures.push(`${location}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
	}
	if (failures.length) throw new Error(failures.join('\n'));
	console.log(`Checked local links in ${docs.length} Markdown files and compiled ${origins.size} TypeScript examples.`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
