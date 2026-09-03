export const SHOPPING_CATEGORY_MAX_LENGTH = 255;

// Canonical defaults for new Shopping category selectors. A family-scoped
// catalog row with the same name may later disable a default without changing
// category strings already stored on Shopping rows.
export const DEFAULT_SHOPPING_CATEGORY_NAMES = [
  '食品',
  '日用品',
  '子供',
  '薬・衛生',
  'その他',
] as const;

export function normalizeShoppingCategoryName(value: unknown): string {
  return String(value ?? '').trim();
}

export function isValidShoppingCategoryName(value: unknown): boolean {
  const name = normalizeShoppingCategoryName(value);
  return name.length > 0 && name.length <= SHOPPING_CATEGORY_MAX_LENGTH;
}

export function shoppingCategoryKey(value: unknown): string {
  return normalizeShoppingCategoryName(value).toLowerCase();
}

export type ShoppingCategoryCatalogRow = {
  name?: unknown;
  enabled?: unknown;
};

/**
 * Resolve the family selector from canonical defaults plus catalog overrides.
 * Disabled rows suppress an equal default; enabled rows append/re-enable their
 * stored spelling. Historical shopping_items.category strings are independent.
 */
export function resolveShoppingCategoryOptions(rows: ShoppingCategoryCatalogRow[]): string[] {
  const catalog = new Map<string, {name:string;enabled:boolean}>();
  for (const row of rows) {
    const name = normalizeShoppingCategoryName(row.name);
    if (!isValidShoppingCategoryName(name)) continue;
    catalog.set(shoppingCategoryKey(name), {name, enabled:Number(row.enabled) === 1});
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const defaultName of DEFAULT_SHOPPING_CATEGORY_NAMES) {
    const key = shoppingCategoryKey(defaultName);
    const override = catalog.get(key);
    if (override && !override.enabled) continue;
    const name = override?.enabled ? override.name : defaultName;
    result.push(name);
    seen.add(key);
  }
  for (const [key, entry] of catalog) {
    if (!entry.enabled || seen.has(key)) continue;
    result.push(entry.name);
    seen.add(key);
  }
  return result;
}
