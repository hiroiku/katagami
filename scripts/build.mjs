import { build } from 'esbuild';

// Build the same entry points in both formats. The consumer smoke test checks
// the actual npm tarball, including cross-entry resource cleanup and type inference.
const format = process.argv[2];
if (!['esm', 'cjs'].includes(format)) throw new Error('Expected esm or cjs');
await build({
	entryPoints: ['src/index.ts', 'src/disposable/index.ts', 'src/lazy/index.ts', 'src/invocation/index.ts'],
	bundle: true,
	format,
	splitting: format === 'esm',
	outbase: 'src',
	outdir: 'dist',
	outExtension: { '.js': format === 'cjs' ? '.cjs' : '.js' },
	platform: 'neutral',
	target: 'es2022',
	logLevel: 'info',
});
