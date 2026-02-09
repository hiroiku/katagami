/**
 * Error thrown by the DI container.
 *
 * Represents failures in container operations such as resolving an unregistered token.
 */
export class ContainerError extends Error {
	/**
	 * @param message Error message
	 */
	public constructor(message: string) {
		super(message);
		this.name = 'ContainerError';
	}
}
