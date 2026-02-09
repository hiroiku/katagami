import type { Container } from '../container';
import type { DisposableContainer, DisposableScope } from '../disposable';
import type { AbstractConstructor } from '../resolver';
import type { Scope } from '../scope';

/**
 * Create a lazy proxy that defers resolution until the first property access.
 *
 * The returned object looks and behaves like `V`, but the underlying instance
 * is not created until a property is read, written, or otherwise accessed.
 * Once resolved the instance is cached — subsequent accesses hit the cache.
 *
 * Only **sync class tokens** are supported. Async tokens and PropertyKey tokens
 * are rejected at the type level.
 *
 * @param source A Container, Scope, DisposableContainer, or DisposableScope
 * @param token  A sync class constructor token
 * @returns A proxy that transparently forwards to the lazily-resolved instance
 *
 * @example
 * ```ts
 * import { createContainer } from 'katagami';
 * import { lazy } from 'katagami/lazy';
 *
 * const container = createContainer()
 *   .registerSingleton(HeavyService, () => new HeavyService());
 *
 * const service = lazy(container, HeavyService);
 * // Instance is NOT created yet
 * service.doSomething(); // resolved here, then cached
 * ```
 */
export function lazy<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	V,
>(source: Container<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>, token: AbstractConstructor<V> & Sync): V;
export function lazy<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	V,
>(
	source: Scope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
	token: AbstractConstructor<V> & (Sync | ScopedSync),
): V;
export function lazy<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	V,
>(
	source: DisposableContainer<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
	token: AbstractConstructor<V> & Sync,
): V;
export function lazy<
	T,
	Sync extends AbstractConstructor,
	Async extends AbstractConstructor,
	ScopedT,
	ScopedSync extends AbstractConstructor,
	ScopedAsync extends AbstractConstructor,
	V,
>(
	source: DisposableScope<T, Sync, Async, ScopedT, ScopedSync, ScopedAsync>,
	token: AbstractConstructor<V> & (Sync | ScopedSync),
): V;
export function lazy(source: { resolve(token: unknown): unknown }, token: AbstractConstructor): unknown {
	let instance: unknown;
	let resolved = false;

	const ensureResolved = (): object => {
		if (!resolved) {
			instance = source.resolve(token);
			resolved = true;
		}
		return instance as object;
	};

	const proxyTarget = Object.create(null);

	return new Proxy(proxyTarget, {
		defineProperty(_, prop, desc) {
			return Reflect.defineProperty(ensureResolved(), prop, desc);
		},
		deleteProperty(_, prop) {
			return Reflect.deleteProperty(ensureResolved(), prop);
		},
		get(_, prop) {
			const target = ensureResolved();
			const value = Reflect.get(target, prop, target);
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		},
		getOwnPropertyDescriptor(_, prop) {
			return Reflect.getOwnPropertyDescriptor(ensureResolved(), prop);
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(ensureResolved());
		},
		has(_, prop) {
			return Reflect.has(ensureResolved(), prop);
		},
		isExtensible() {
			return Reflect.isExtensible(ensureResolved());
		},
		ownKeys() {
			return Reflect.ownKeys(ensureResolved());
		},
		preventExtensions() {
			Reflect.preventExtensions(ensureResolved());
			Reflect.preventExtensions(proxyTarget);
			return true;
		},
		set(_, prop, value) {
			return Reflect.set(ensureResolved(), prop, value, ensureResolved());
		},
		setPrototypeOf(_, proto) {
			return Reflect.setPrototypeOf(ensureResolved(), proto);
		},
	});
}
