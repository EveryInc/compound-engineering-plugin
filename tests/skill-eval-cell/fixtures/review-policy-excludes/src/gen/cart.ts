export function total(items: { price: number }[]): number {
  console.log("computing");
  return items.reduce((a, b) => a + b.price, 0);
}
