import { createApp } from './app.js';

const greet = createApp({
	async findName(id) {
		return new Map([['1', 'Ada']]).get(id);
	},
});

console.log(await greet('1'));
console.log(await greet('unknown'));
