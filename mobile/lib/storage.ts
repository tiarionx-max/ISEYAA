import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  await AsyncStorage.setItem(`cache:${key}`, JSON.stringify(entry));
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
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
