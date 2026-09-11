import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// NodeNext resolves import/require declarations separately. Keep the CommonJS
// declaration graph in .d.cts files with .cjs module specifiers.
function copyDeclarations(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const file = join(directory, entry.name);
		if (entry.isDirectory()) copyDeclarations(file);
		else if (file.endsWith('.d.ts')) {
			const declaration = readFileSync(file, 'utf8').replace(/(from\s+['"]\.[^'"]*)\.js(['"])/g, '$1.cjs$2');
			writeFileSync(file.replace(/\.d\.ts$/, '.d.cts'), declaration);
		}
	}
}
copyDeclarations('dist');
