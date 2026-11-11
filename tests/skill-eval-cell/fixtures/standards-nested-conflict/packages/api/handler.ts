export function handleGetCart(req: { userId: string }) {
  return { userId: req.userId, items: [] as string[] };
}
