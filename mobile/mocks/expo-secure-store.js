// Web stub for expo-secure-store — falls back to localStorage on web.
const getItemAsync = async (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const setItemAsync = async (key, value) => {
  try { localStorage.setItem(key, String(value)); } catch {}
};
const deleteItemAsync = async (key) => {
  try { localStorage.removeItem(key); } catch {}
};
module.exports = { getItemAsync, setItemAsync, deleteItemAsync };
module.exports.default = { getItemAsync, setItemAsync, deleteItemAsync };
