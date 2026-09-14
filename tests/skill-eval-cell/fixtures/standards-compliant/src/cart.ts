import { log } from "./log";

export function total(items: { price: number }[]): number {
  log("computing");
  return items.reduce((a, b) => a + b.price, 0);
}
