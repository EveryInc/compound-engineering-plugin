// Copyright Example Corp
export function total(items: { price: number }[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
