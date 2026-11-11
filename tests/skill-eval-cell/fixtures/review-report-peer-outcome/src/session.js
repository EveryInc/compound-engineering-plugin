export function refreshSession(store, token) {
  const session = store.get(token);
  session.expiresAt = Date.now() + 30 * 60 * 1000;
  store.set(token, session);
  return session;
}
