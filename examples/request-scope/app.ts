import { createContainer, createScope } from 'katagami';
import { disposable } from 'katagami/disposable';

export interface UserRepository {
	findName(id: string): Promise<string | undefined>;
}

/** Inject infrastructure once; create a separate scope for each request. */
export function createApp(repository: UserRepository, onCleanup: (id: string) => void = () => {}) {
	const container = createContainer()
		.registerSingleton('users', () => repository)
		.registerScoped('request', () => ({
			id: crypto.randomUUID(),
			[Symbol.dispose]() {
				onCleanup(this.id);
			},
		}))
		.registerScoped('greeting', r => {
			const users = r.resolve('users');
			const request = r.resolve('request');
			return async (userId: string) => ({
				requestId: request.id,
				message: `Hello, ${(await users.findName(userId)) ?? 'guest'}!`,
			});
		});

	return async (userId: string) => {
		await using scope = disposable(createScope(container));
		return await scope.resolve('greeting')(userId);
	};
}
