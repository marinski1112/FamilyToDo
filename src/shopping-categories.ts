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
