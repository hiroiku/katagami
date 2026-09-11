export interface UserRepository {
	findName(id: string): Promise<string | undefined>;
}

/** Typed constructor/function injection baseline; no untyped registry. */
export function createApp(repository: UserRepository, onCleanup: (id: string) => void = () => {}) {
	return async (userId: string) => {
		const request = { id: crypto.randomUUID() };
		try {
			return {
				requestId: request.id,
				message: `Hello, ${(await repository.findName(userId)) ?? 'guest'}!`,
			};
		} finally {
			onCleanup(request.id);
		}
	};
}
