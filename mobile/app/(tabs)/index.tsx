import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';
import { cacheGet, cacheSet, toggleBookmark, getBookmarks } from '../../lib/storage';
import { useEffect, useState } from 'react';
import { MapPin, Bookmark, BookmarkCheck, Search, Bell } from 'lucide-react-native';

const MIDNIGHT = '#0D1B1B';
const SURFACE = '#162525';
const GOLD = '#C8962A';
const GOLD_LIGHT = '#E0AA42';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT = '#FFFFFF';
const TEXT_SEC = 'rgba(255,255,255,0.55)';
const TEXT_MUTED = 'rgba(255,255,255,0.28)';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;

const CARD_COLORS: [string, string][] = [
  ['#1A6B3C', '#0A3A1F'],
  ['#1A4A3C', '#0A2A22'],
  ['#2A3A1A', '#152010'],
  ['#1A3A4A', '#0A1F2A'],
  ['#3A2A1A', '#20160A'],
  ['#2A1A3A', '#160A20'],
];

const LGA_FILTERS = ['All', 'Abeokuta', 'Ijebu Ode', 'Sagamu', 'Ota', 'Ilaro'];

function SkeletonCard() {
  return (
    <View style={[styles.card, { opacity: 0.4 }]}>
      <View style={[styles.cardGradient, { backgroundColor: SURFACE }]} />
      <View style={styles.cardBody}>
        <View style={{ height: 12, width: '80%', backgroundColor: SURFACE, borderRadius: 6, marginBottom: 6 }} />
        <View style={{ height: 10, width: '50%', backgroundColor: SURFACE, borderRadius: 6 }} />
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const [search, setSearch] = useState('');
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [attractions, setAttractions] = useState<any[]>([]);
  const [activeLga, setActiveLga] = useState('All');

  useEffect(() => {
    cacheGet<any[]>('attractions').then((cached) => { if (cached) setAttractions(cached); });
    getBookmarks().then(setBookmarks);
  }, []);

  const { data, isSuccess, isFetching } = useQuery({
    queryKey: ['attractions'],
    queryFn: () => fetcher('/attractions?limit=50'),
  });

  useEffect(() => {
    if (isSuccess && Array.isArray(data) && data.length > 0) {
      setAttractions(data);
      cacheSet('attractions', data);
    }
  }, [isSuccess, data]);

  const filtered = attractions.filter((a) => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase());
    const matchLga = activeLga === 'All' || (a.lga?.name ?? '').includes(activeLga);
    return matchSearch && matchLga;
  });

  async function handleBookmark(id: string) {
    const added = await toggleBookmark(id);
    setBookmarks((prev) => added ? [...prev, id] : prev.filter((b) => b !== id));
  }

  const showSkeleton = isFetching && attractions.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Discover</Text>
          <Text style={styles.title}>Ogun State</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn}>
          <Bell size={20} color={TEXT_SEC} />
          <View style={styles.notifDot} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Search size={15} color={TEXT_MUTED} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search attractions, LGAs..."
          placeholderTextColor={TEXT_MUTED}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* LGA Filter Pills — explicit height to prevent web stretching */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        contentContainerStyle={styles.pillContent}
      >
        {LGA_FILTERS.map((lga) => (
          <TouchableOpacity
            key={lga}
            style={[styles.pill, activeLga === lga && styles.pillActive]}
            onPress={() => setActiveLga(lga)}
          >
            <Text style={[styles.pillText, activeLga === lga && styles.pillTextActive]}>
              {lga}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Section label */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>
          {filtered.length > 0 ? `${filtered.length} Attractions` : 'Attractions'}
        </Text>
      </View>

      {/* Grid — skeleton or real data */}
      {showSkeleton ? (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MapPin size={36} color={TEXT_MUTED} />
              <Text style={styles.emptyTitle}>No Attractions Found</Text>
              <Text style={styles.emptyText}>
                {attractions.length === 0
                  ? 'Start the backend to load attractions'
                  : 'Try a different search or filter'}
              </Text>
            </View>
          }
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item, index }) => {
            const [c0, c1] = CARD_COLORS[index % CARD_COLORS.length];
            const isBookmarked = bookmarks.includes(item.id);
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.88}>
                <LinearGradient colors={[c0, c1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardGradient}>
                  <TouchableOpacity
                    onPress={() => handleBookmark(item.id)}
                    style={styles.bookmarkBtn}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    {isBookmarked
                      ? <BookmarkCheck size={16} color={GOLD_LIGHT} />
                      : <Bookmark size={16} color="rgba(255,255,255,0.45)" />}
                  </TouchableOpacity>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText} numberOfLines={1}>
                      {item.category ?? 'Attraction'}
                    </Text>
                  </View>
                </LinearGradient>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.cardLocRow}>
                    <MapPin size={10} color={TEXT_MUTED} />
                    <Text style={styles.cardLoc} numberOfLines={1}>{item.lga?.name ?? 'Ogun State'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MIDNIGHT },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: { fontSize: 12, color: TEXT_MUTED, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 30, fontWeight: '800', color: TEXT, marginTop: 2, letterSpacing: -1 },
  notifBtn: { position: 'relative', padding: 6 },
  notifDot: {
    position: 'absolute', top: 6, right: 6,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: GOLD, borderWidth: 1.5, borderColor: MIDNIGHT,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: SURFACE, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 14, marginLeft: 10 },

  // Explicit height on pillScroll prevents react-native-web from stretching pills
  pillScroll: { height: 38, marginBottom: 14 },
  pillContent: { paddingHorizontal: 16, alignItems: 'center' },
  pill: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: 'rgba(200,150,42,0.18)',
    borderColor: 'rgba(200,150,42,0.5)',
  },
  pillText: { color: TEXT_SEC, fontSize: 12, fontWeight: '500' },
  pillTextActive: { color: GOLD_LIGHT, fontWeight: '700' },

  sectionRow: { paddingHorizontal: 16, marginBottom: 12 },
  sectionLabel: { color: TEXT_SEC, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Skeleton grid
  skeletonGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, gap: 12,
  },

  grid: { paddingHorizontal: 16, paddingBottom: 24 },
  gridRow: { justifyContent: 'space-between', marginBottom: 12 },

  card: {
    width: CARD_W,
    backgroundColor: SURFACE,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardGradient: {
    height: 130,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bookmarkBtn: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 5,
  },
  categoryBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  categoryText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  cardBody: { padding: 10 },
  cardTitle: { color: TEXT, fontSize: 13, fontWeight: '700', marginBottom: 5, lineHeight: 17 },
  cardLocRow: { flexDirection: 'row', alignItems: 'center' },
  cardLoc: { color: TEXT_MUTED, fontSize: 10, marginLeft: 3, flex: 1 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { color: TEXT_SEC, fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyText: { color: TEXT_MUTED, fontSize: 13, textAlign: 'center', maxWidth: 220, lineHeight: 19 },
});
