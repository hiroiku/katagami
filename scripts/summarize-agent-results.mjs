import { readFileSync } from 'node:fs';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: node scripts/summarize-agent-results.mjs results.jsonl');
const tasks = new Set(['add-dependency', 'request-isolation', 'async-dependency']);
const records = readFileSync(filename, 'utf8')
	.split('\n')
	.filter(line => line.trim())
	.map(line => JSON.parse(line));
if (!records.length) throw new Error('No trials recorded.');
const groups = new Map();
const attempts = new Set();
for (const row of records) {
	if (!tasks.has(row.task) || !['katagami', 'manual'].includes(row.variant))
		throw new Error('Unknown task or variant.');
	for (const field of ['model', 'settings', 'fixtureCommit', 'log']) {
		if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error(`Missing ${field}`);
	}
	for (const field of ['typecheckPassed', 'testsPassed']) {
		if (typeof row[field] !== 'boolean') throw new Error(`Missing boolean ${field}`);
	}
	if (!Array.isArray(row.forbiddenBypasses) || row.forbiddenBypasses.some(value => typeof value !== 'string'))
		throw new Error('forbiddenBypasses must be an array of descriptions.');
	for (const field of ['inputTokens', 'outputTokens']) {
		if (row[field] !== null && (!Number.isInteger(row[field]) || row[field] < 0))
			throw new Error(`${field} must be a nonnegative integer or null.`);
	}
	if (!Number.isFinite(row.seconds) || row.seconds <= 0) throw new Error('seconds must be measured and positive.');
	if (
		!Number.isInteger(row.attempt) ||
		row.attempt < 1 ||
		!Number.isInteger(row.repairIterations) ||
		row.repairIterations < 0
	)
		throw new Error('Invalid attempt or repairIterations.');
	const key = JSON.stringify([row.task, row.variant, row.model, row.settings, row.fixtureCommit]);
	const attempt = `${key}:${row.attempt}`;
	if (attempts.has(attempt)) throw new Error(`Duplicate attempt: ${attempt}`);
	attempts.add(attempt);
	if (!groups.has(key)) groups.set(key, []);
	groups.get(key).push(row);
}
const median = values => {
	if (!values.length) return null;
	const sorted = values.slice().sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const summary = [...groups].map(([key, rows]) => {
	const [task, variant, model, settings, fixtureCommit] = JSON.parse(key);
	const success = rows.filter(
		row => row.typecheckPassed && row.testsPassed && row.forbiddenBypasses.length === 0,
	).length;
	const completeTokens = rows.filter(row => row.inputTokens !== null && row.outputTokens !== null);
	return {
		task,
		variant,
		model,
		settings,
		fixtureCommit,
		attempts: rows.length,
		success,
		successRate: success / rows.length,
		medianSeconds: median(rows.map(row => row.seconds)),
		tokenObservations: completeTokens.length,
		medianTotalTokens: median(completeTokens.map(row => row.inputTokens + row.outputTokens)),
		medianRepairIterations: median(rows.map(row => row.repairIterations)),
	};
});
console.log(JSON.stringify(summary, null, 2));
