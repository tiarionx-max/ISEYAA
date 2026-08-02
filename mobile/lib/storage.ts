import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  try {
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify(entry));
  } catch {
    // Caching is best-effort: a quota rejection (SQLITE_FULL / QuotaExceeded) or a
    // serialization failure must never crash the screen that was only trying to warm
    // the offline cache. Swallow it — the next fetch simply misses the cache.
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      // Evict the expired entry so stale keys don't accumulate unbounded in storage.
      await AsyncStorage.removeItem(`cache:${key}`);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function cacheRemove(key: string): Promise<void> {
  await AsyncStorage.removeItem(`cache:${key}`);
}

// Bookmark helpers
export async function toggleBookmark(attractionId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem('bookmarks');
  const bookmarks: string[] = raw ? JSON.parse(raw) : [];
  const idx = bookmarks.indexOf(attractionId);
  if (idx === -1) {
    bookmarks.push(attractionId);
    await AsyncStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    return true;
  } else {
    bookmarks.splice(idx, 1);
    await AsyncStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    return false;
  }
}

export async function getBookmarks(): Promise<string[]> {
  const raw = await AsyncStorage.getItem('bookmarks');
  return raw ? JSON.parse(raw) : [];
}

// Recent search terms — most-recent-first, capped at 8 entries.
const MAX_RECENT_SEARCHES = 8;

export async function getRecentSearches(): Promise<string[]> {
  const raw = await AsyncStorage.getItem('recent_searches');
  return raw ? JSON.parse(raw) : [];
}

export async function addRecentSearch(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches();
  const existing = await getRecentSearches();
  const deduped = [trimmed, ...existing.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())];
  const capped = deduped.slice(0, MAX_RECENT_SEARCHES);
  await AsyncStorage.setItem('recent_searches', JSON.stringify(capped));
  return capped;
}
