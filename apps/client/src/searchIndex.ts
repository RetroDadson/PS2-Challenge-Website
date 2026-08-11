export type SearchIndex<Key> = Map<Key, string[]>;

export function buildSearchIndex<T, Key>(
  items: T[],
  keyOf: (item: T) => Key,
  fieldsOf: (item: T) => Array<string | null | undefined>
): SearchIndex<Key> {
  const index = new Map<Key, string[]>();
  for (const item of items) {
    const fields = fieldsOf(item)
      .filter((value): value is string => !!value)
      .map((value) => value.toLocaleLowerCase("en-GB"));
    index.set(keyOf(item), fields);
  }
  return index;
}

export function matchesSearchIndex<Key>(index: SearchIndex<Key>, key: Key, searchLower: string): boolean {
  const fields = index.get(key);
  if (!fields) return false;
  return fields.some((field) => field.includes(searchLower));
}
