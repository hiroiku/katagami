import { ContainerError } from '../error/index.js';

const KEY = Symbol.for('katagami.metadata-key.v1');
const ENTRY = Symbol.for('katagami.metadata-entry.v1');

/**
 * A typed metadata key. Call it with a value to create a metadata entry for a registration.
 *
 * The name is used by type checking; runtime lookups use the key object's identity.
 */
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

/**
 * Define a typed metadata key.
 *
 * The value type is given first and the name is inferred in a second call, so keys with different
 * names are never confused.
 *
 * @example
 * ```ts
 * const AREA = createMetadataKey<'internal' | 'public'>()('area');
 * container.registerScoped('read', factory, { metadata: [AREA('public')] });
 * ```
 */
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

/** Registration metadata as a key/value pair, so origins can be compared by content. */
export type MetadataPair = readonly [key: AnyMetadataKey, value: unknown];

/** A reader and the key/value pairs for the same registration metadata, built from one copy. */
export interface RegisteredMetadata {
	readonly reader: MetadataReader;
	readonly pairs: readonly MetadataPair[];
}

/** Copy the metadata at registration, so later changes to the array or entries do not affect checks. */
export function readMetadata(
	entries: readonly AnyMetadataEntry[],
	required: readonly AnyMetadataKey[],
): RegisteredMetadata {
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
		pairs: Object.freeze([...values].map(pair => Object.freeze(pair) as MetadataPair)),
		reader: Object.freeze({
			get: <T>(key: MetadataKey<T>): T | undefined => values.get(key) as T | undefined,
			has: (key: AnyMetadataKey) => values.has(key),
			require: <T>(key: MetadataKey<T>): T => {
				if (!values.has(key)) {
					throw new ContainerError('Required metadata is missing.');
				}
				return values.get(key) as T;
			},
		}),
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
