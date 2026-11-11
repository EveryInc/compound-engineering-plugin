const TTL_MS = 3600 * 1000;
const entries = new Map();

function get(key) {
  const hit = entries.get(key);
  if (!hit || hit.expires < Date.now()) return undefined;
  return hit.value;
}

function set(key, value) {
  entries.set(key, { value, expires: Date.now() + TTL_MS });
}

function invalidate(key) {
  entries.delete(key);
}

module.exports = { get, set, invalidate };
