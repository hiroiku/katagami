import { checkReturn } from '../container/policy.js';
import { disposable } from '../disposable/index.js';
import type { Callable } from '../entrypoint/index.js';
import { ContainerError } from '../error/index.js';
import { INTERNALS } from '../internal.js';
import type { Scope, ScopeOptions } from './index.js';

type PublicState<S> = S extends { readonly callable: infer F } ? ([F] extends [never] ? never : S) : never;
type Token<S> = PublicState<S> extends infer P ? (P extends { readonly token: infer K } ? K : never) : never;
type Operation<S, K> =
	Extract<PublicState<S>, { readonly token: K }> extends { readonly callable: infer F extends Callable } ? F : never;

export interface OperationsScopeOptions extends Omit<ScopeOptions, 'access'> {
	readonly access: 'operations';
}

export interface OperationsScope<Registrations> extends AsyncDisposable {
	get<K extends Token<Registrations>>(
		token: K,
	): (...args: Parameters<Operation<Registrations, K>>) => Promise<Awaited<ReturnType<Operation<Registrations, K>>>>;
}

/** Build an operations scope: keep the resolver inside, and stop new calls and wait for running ones in one place. */
export function operations<Registrations>(source: Scope): OperationsScope<Registrations> {
	const internals = source[INTERNALS];
	const scope = disposable(source);
	let closed = false;
	let disposal: Promise<void> | undefined;
	// 終了の待ち合わせには、呼び出し元へ返す Promise ではなく自前の完了通知を使う。待つために listener を
	// 付けるのは自分で作った Promise だけになり、呼び出し元が捨てた失敗の扱いには影響しない。
	const pending = new Set<Promise<void>>();
	const assertOpen = (): void => {
		if (closed || internals.isDisposed()) {
			throw new ContainerError('Cannot invoke from a disposed scope.');
		}
	};
	const assertEntrypoint = (token: unknown): void => {
		const registrations = internals.registrations.get(token);
		const registration = registrations?.[registrations.length - 1];
		if (!registration) {
			throw new ContainerError('Token is not registered.');
		}
		if (!registration.entrypoint) {
			throw new ContainerError('Token is not an entrypoint.');
		}
	};
	const execute = (token: unknown, args: unknown[]): Promise<unknown> => {
		try {
			assertOpen();
		} catch (error) {
			return Promise.reject(error);
		}
		const body = Promise.resolve().then(async () => {
			assertEntrypoint(token);
			// 解決した呼び出し関数はこの面の内側にとどまるため、返却検査は操作の結果にだけ適用する。
			const callable: unknown = await internals.resolveInternal(token);
			if (typeof callable !== 'function') {
				throw new ContainerError('Entrypoint factory must return a callable.');
			}
			const result: unknown = await callable(...args);
			checkReturn(internals.policy, result);
			return result;
		});
		// 呼び出し元へ返す Promise と完了通知は、どちらも自前の body から作る。呼び出し元へ返す方を先に
		// 作るので、結果が呼び出し元へ届いてから終了が資源の破棄へ進む。返す方には listener を付けない。
		const operation = body.then(result => result);
		const running: Promise<void> = body.then(
			() => {
				pending.delete(running);
			},
			() => {
				pending.delete(running);
			},
		);
		pending.add(running);
		return operation;
	};
	return Object.freeze({
		get: (token: unknown) => {
			assertOpen();
			assertEntrypoint(token);
			return (...args: unknown[]) => execute(token, args);
		},
		[Symbol.asyncDispose]: (): Promise<void> => {
			if (!disposal) {
				closed = true;
				disposal = (async () => {
					await Promise.all(pending);
					await scope[Symbol.asyncDispose]();
				})();
			}
			return disposal;
		},
	}) as OperationsScope<Registrations>;
}
