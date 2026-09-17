import { disposable } from '../disposable/index.js';
import type { Callable } from '../entrypoint/index.js';
import { ContainerError } from '../error/index.js';
import { type ContainerInternals, INTERNALS, type REGISTRATION_STATE } from '../internal.js';
import { Scope, type ScopeOptions } from '../scope/index.js';

type PublicState<S> = S extends { readonly callable: infer F } ? ([F] extends [never] ? never : S) : never;
type Token<S> = PublicState<S> extends infer P ? (P extends { readonly token: infer K } ? K : never) : never;
type Operation<S, K> =
	Extract<PublicState<S>, { readonly token: K }> extends { readonly callable: infer F extends Callable } ? F : never;

export interface InvocationScope<Registrations> extends AsyncDisposable {
	invoke<K extends Token<Registrations>>(
		token: K,
		...args: Parameters<Operation<Registrations, K>>
	): Promise<Awaited<ReturnType<Operation<Registrations, K>>>>;
}

/** 新しい scope を作り、公開操作だけを実行する view を返す。 */
export function createInvocationScope<
	C extends {
		readonly [INTERNALS]: ContainerInternals & { readonly kind: 'container' };
		readonly [REGISTRATION_STATE]: unknown;
	},
>(source: C, options?: ScopeOptions): InvocationScope<C[typeof REGISTRATION_STATE]> {
	const internals = source[INTERNALS];
	if (internals.isDisposed()) {
		throw new ContainerError('Cannot create a scope from a disposed container.');
	}
	const hooks = [...internals.beforeResolve];
	if (options?.beforeResolve) {
		hooks.push(options.beforeResolve);
	}
	const scope = new Scope<
		Record<never, never>,
		never,
		never,
		Record<never, never>,
		never,
		never,
		C[typeof REGISTRATION_STATE]
	>(internals.registrations, internals.singletonCache, hooks);
	return invocation(scope);
}

/** 既存 scope と同じ実体・寿命を使い、終了処理も元の scope へ委譲する。 */
export function invocation<
	C extends {
		readonly [INTERNALS]: ContainerInternals & { readonly kind: 'scope' };
		readonly [REGISTRATION_STATE]: unknown;
	},
>(source: C): InvocationScope<C[typeof REGISTRATION_STATE]> {
	const sourceInternals = source[INTERNALS];
	if (sourceInternals.isDisposed()) {
		throw new ContainerError('Cannot create a view from a disposed scope.');
	}
	if (sourceInternals.invocationView) {
		return sourceInternals.invocationView as InvocationScope<C[typeof REGISTRATION_STATE]>;
	}
	const scope = disposable(source as unknown as Scope);

	let closed = false;
	let disposal: Promise<void> | undefined;
	const pending = new Set<Promise<unknown>>();
	const invoke = (token: unknown, ...args: unknown[]): Promise<unknown> => {
		if (closed || sourceInternals.isDisposed()) {
			return Promise.reject(new ContainerError('Cannot invoke from a disposed scope.'));
		}
		const operation = Promise.resolve().then(async () => {
			const registrations = sourceInternals.registrations.get(token);
			const registration = registrations?.[registrations.length - 1];
			if (!registration) {
				throw new ContainerError('Token is not registered.');
			}
			if (!registration.entrypoint) {
				throw new ContainerError('Token is not an entrypoint.');
			}
			const callable: unknown = await scope.resolve(token as never);
			if (typeof callable !== 'function') {
				throw new ContainerError('Entrypoint factory must return a callable.');
			}
			return callable(...args);
		});
		pending.add(operation);
		void operation.then(
			() => pending.delete(operation),
			() => pending.delete(operation),
		);
		return operation;
	};
	const view = Object.freeze({
		invoke,
		[Symbol.asyncDispose]: (): Promise<void> => {
			if (!disposal) {
				closed = true;
				disposal = (async () => {
					await Promise.allSettled(pending);
					await scope[Symbol.asyncDispose]();
				})();
			}
			return disposal;
		},
	}) as InvocationScope<C[typeof REGISTRATION_STATE]>;
	sourceInternals.invocationView = view;
	return view;
}
