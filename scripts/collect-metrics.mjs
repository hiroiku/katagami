import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const output = outputIndex === -1 ? null : args[outputIndex + 1];
if (outputIndex !== -1 && (!output || output.startsWith('--'))) throw new Error('--output requires a file path');
const errors = [];
async function get(url) {
	try {
		const response = await fetch(url, {
			headers: { 'User-Agent': 'katagami-metrics' },
			signal: AbortSignal.timeout(15000),
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	} catch (error) {
		errors.push({ url, message: error.message });
		return null;
	}
}
const [week, month, daily, repo] = await Promise.all([
	get('https://api.npmjs.org/downloads/point/last-week/katagami'),
	get('https://api.npmjs.org/downloads/point/last-month/katagami'),
	get('https://api.npmjs.org/downloads/range/last-year/katagami'),
	get('https://api.github.com/repos/hiroiku/katagami'),
]);
const days = (daily?.downloads ?? []).slice().sort((a, b) => a.day.localeCompare(b.day));
const periods = [];
for (let back = 0; back < 8; back++) {
	const end = days.length - back * 7;
	const entries = days.slice(Math.max(0, end - 7), end);
	if (end < 7 || entries.length !== 7) break;
	periods.push({
		start: entries[0].day,
		end: entries[6].day,
		downloads: entries.reduce((sum, item) => sum + item.downloads, 0),
	});
}
const metrics = {
	collectedAt: new Date().toISOString(),
	package: 'katagami',
	npm: { week, month, nonOverlappingWeeks: periods.reverse() },
	github: repo
		? {
				stars: repo.stargazers_count,
				forks: repo.forks_count,
				topics: repo.topics,
				homepage: repo.homepage,
				pushedAt: repo.pushed_at,
			}
		: null,
	errors,
};
if (args.includes('--traffic')) {
	metrics.privateTraffic = {};
	for (const name of ['views', 'clones', 'popular/referrers', 'popular/paths']) {
		try {
			metrics.privateTraffic[name] = JSON.parse(
				execFileSync('gh', ['api', `repos/hiroiku/katagami/traffic/${name}`], {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
				}),
			);
		} catch {
			metrics.privateTraffic[name] = null;
			errors.push({
				source: `github/traffic/${name}`,
				message: 'Unavailable; owner access and gh authentication are required.',
			});
		}
	}
}
const json = `${JSON.stringify(metrics, null, 2)}\n`;
if (output) {
	const file = resolve(output);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, json);
	console.log(
		`Saved ${file}${args.includes('--traffic') ? ' (contains private repository analytics; keep local)' : ''}`,
	);
} else {
	console.log(json);
}
if (errors.length) {
	console.error(`${errors.length} metric source(s) unavailable; missing values are null, not zero.`);
	process.exitCode = 1;
}
