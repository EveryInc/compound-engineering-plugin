const store = new Map();
async function warm(key, loader) {
  if (!store.has(key)) {
    const value = await loader();
    store.set(key, value);
  }
  return store.get(key);
}
module.exports = { warm };
