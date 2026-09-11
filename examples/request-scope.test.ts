import { expect, test } from 'bun:test';
import { createApp } from './request-scope/app';

test('concurrent requests have separate state and dispose their own resources', async () => {
	const cleaned: string[] = [];
	const greet = createApp({ findName: async id => `user-${id}` }, id => cleaned.push(id));
	const [first, second] = await Promise.all([greet('a'), greet('b')]);
	expect(first.message).toBe('Hello, user-a!');
	expect(second.message).toBe('Hello, user-b!');
	expect(first.requestId).not.toBe(second.requestId);
	expect(cleaned.sort()).toEqual([first.requestId, second.requestId].sort());
});

test('infrastructure can be replaced with a fake and unknown users become guests', async () => {
	const greet = createApp({ findName: async () => undefined });
	expect((await greet('missing')).message).toBe('Hello, guest!');
});

test('request cleanup still runs when infrastructure rejects', async () => {
	const cleaned: string[] = [];
	const failure = new Error('database unavailable');
	const greet = createApp(
		{
			findName: async () => {
				throw failure;
			},
		},
		id => cleaned.push(id),
	);
	await expect(greet('1')).rejects.toBe(failure);
	expect(cleaned).toHaveLength(1);
});
