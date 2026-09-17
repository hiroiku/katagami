import { ContainerError } from '../error/index.js';

const KEY = Symbol.for('katagami.metadata-key.v1');
const ENTRY = Symbol.for('katagami.metadata-entry.v1');

/** 名前は型検査、キーオブジェクトの同一性は実行時の照合に使う。 */
export interface MetadataKey<T, Name extends PropertyKey = PropertyKey> {
	(value: T): MetadataEntry<T, Name>;
	readonly name: Name;
	readonly [KEY]: true;
}

export interface MetadataEntry<T = unknown, Name extends PropertyKey = PropertyKey> {
	readonly key: MetadataKey<T, Name>;
	readonly value: T;
	readonly [ENTRY]: true;
}

export interface AnyMetadataKey {
	readonly name: PropertyKey;
	readonly [KEY]: true;
}
export interface AnyMetadataEntry {
	readonly key: AnyMetadataKey;
	readonly value: unknown;
	readonly [ENTRY]: true;
}
export type MetadataKeyOf<E> = E extends MetadataEntry<infer T, infer N> ? MetadataKey<T, N> : never;

/** 型引数と名前の推論を分け、別名のキーを取り違えない。 */
export function createMetadataKey<T>(): <const Name extends PropertyKey>(name: Name) => MetadataKey<T, Name> {
	return name => {
		const key = (value: T): MetadataEntry<T, typeof name> =>
			Object.freeze({ key: key as MetadataKey<T, typeof name>, value, [ENTRY]: true });
		Object.defineProperties(key, { name: { value: name }, [KEY]: { value: true } });
		return key as MetadataKey<T, typeof name>;
	};
}

export interface MetadataReader {
	get<T>(key: MetadataKey<T>): T | undefined;
	require<T>(key: MetadataKey<T>): T;
	has(key: AnyMetadataKey): boolean;
}

/** 登録時に値を複写し、配列や entry の変更が解決方針へ波及しないようにする。 */
export function readMetadata(
	entries: readonly AnyMetadataEntry[],
	required: readonly AnyMetadataKey[],
): MetadataReader {
	const values = new Map<AnyMetadataKey, unknown>();
	const names = new Set<PropertyKey>();
	for (const entry of entries) {
		if (entry?.[ENTRY] !== true || entry.key?.[KEY] !== true) {
			throw new ContainerError('Invalid metadata entry.');
		}
		if (names.has(entry.key.name)) {
			throw new ContainerError('Duplicate metadata key.');
		}
		names.add(entry.key.name);
		values.set(entry.key, entry.value);
	}
	for (const key of required) {
		if (!values.has(key)) {
			throw new ContainerError('Required metadata is missing.');
		}
	}
	return Object.freeze({
		get: <T>(key: MetadataKey<T>): T | undefined => values.get(key) as T | undefined,
		has: (key: AnyMetadataKey) => values.has(key),
		require: <T>(key: MetadataKey<T>): T => {
			if (!values.has(key)) {
				throw new ContainerError('Required metadata is missing.');
			}
			return values.get(key) as T;
		},
	});
}

export function validateMetadataKeys(keys: readonly AnyMetadataKey[]): void {
	const names = new Set<PropertyKey>();
	for (const key of keys) {
		if (key?.[KEY] !== true) {
			throw new ContainerError('Invalid metadata key.');
		}
		if (names.has(key.name)) {
			throw new ContainerError('Duplicate required metadata key.');
		}
		names.add(key.name);
	}
}

export type RegistrationArguments<
	Required extends readonly AnyMetadataKey[],
	Entries extends readonly AnyMetadataEntry[],
> = Required extends readonly []
	? [options?: { readonly metadata?: Entries }]
	: [
			options: { readonly metadata: Entries } & ([Exclude<Required[number], MetadataKeyOf<Entries[number]>>] extends [
				never,
			]
				? unknown
				: { readonly missingRequiredMetadata: never }),
		];
