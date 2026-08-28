export function total(items) {
  console.log("computing");
  return items.reduce((a, b) => a + b.price, 0);
}
