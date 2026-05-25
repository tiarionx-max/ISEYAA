import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../lib/api';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import {
  Search,
  Mic,
  ArrowLeft,
  MapPin,
  ShoppingBag,
  Music,
  Clock,
} from 'lucide-react-native';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  FOREST,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_MID,
  FONT_DISPLAY,
  FONT_MONO,
} from '../lib/tokens';

// ── Adire ornament ────────────────────────────────────────────────────────────

function AdireOrnament({ size = 80, opacity = 0.2 }: { size?: number; opacity?: number }) {
  const s = size;
  const c = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} opacity={opacity}>
      <Rect
        x={s * 0.1}
        y={s * 0.1}
        width={s * 0.8}
        height={s * 0.8}
        fill="none"
        stroke={GOLD}
        strokeWidth={s * 0.018}
      />
      <Rect
        x={s * 0.2}
        y={s * 0.2}
        width={s * 0.6}
        height={s * 0.6}
        fill="none"
        stroke={GOLD}
        strokeWidth={s * 0.012}
      />
      <Line
        x1={s * 0.1}
        y1={s * 0.1}
        x2={s * 0.9}
        y2={s * 0.9}
        stroke={GOLD}
        strokeWidth={s * 0.01}
      />
      <Line
        x1={s * 0.9}
        y1={s * 0.1}
        x2={s * 0.1}
        y2={s * 0.9}
        stroke={GOLD}
        strokeWidth={s * 0.01}
      />
      <Circle cx={c} cy={c} r={s * 0.12} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Circle cx={c} cy={c} r={s * 0.05} fill={GOLD} />
    </Svg>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionKicker}>{kicker}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPE_CHIPS = ['All', 'Places', 'Events', 'Stays', 'Studio', 'Market', 'People'] as const;

type ScopeChip = (typeof SCOPE_CHIPS)[number];

const SUGGESTIONS = [
  { title: 'Olumo Rock', sub: 'attraction', Icon: MapPin },
  { title: 'Olumo Heritage Lodge', sub: 'stay · 1.4 km', Icon: MapPin },
  { title: 'Olumo Arts Market', sub: 'market', Icon: ShoppingBag },
  { title: 'Olumo Festival Grounds', sub: 'event venue', Icon: Music },
] as const;

const RECENT_SEARCHES = ['adire workshop', 'Abeokuta hotels', 'Lisabi Festival', 'suya spots'] as const;

const KEYBOARD_SUGGESTIONS = ['adire', 'adire wrap', 'adire workshop'] as const;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeScope, setActiveScope] = useState<ScopeChip>('All');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const shouldSearch = debouncedQuery.length >= 2;
  const scope = activeScope.toLowerCase();

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['search', debouncedQuery, activeScope],
    queryFn: async () => {
      const q = encodeURIComponent(debouncedQuery);
      if (scope === 'events') return fetcher(`/events?search=${q}&limit=8`);
      if (scope === 'stays') return fetcher(`/stays?search=${q}&limit=8`);
      if (scope === 'places') return fetcher(`/tourism/attractions?search=${q}&limit=8`);
      const [atts, evts] = await Promise.allSettled([
        fetcher(`/tourism/attractions?search=${q}&limit=4`),
        fetcher(`/events?search=${q}&limit=4`),
      ]);
      const items = [
        ...((atts.status === 'fulfilled' ? atts.value?.data : null) ?? []).map((x: any) => ({ ...x, _type: 'place' })),
        ...((evts.status === 'fulfilled' ? evts.value?.data : null) ?? []).map((x: any) => ({ ...x, _type: 'event' })),
      ];
      return { data: items };
    },
    enabled: shouldSearch,
  });

  const liveResults: any[] = shouldSearch ? (searchData?.data ?? []) : [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color={INK} />
        </TouchableOpacity>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Search size={16} color={INK_MID} />
          <TextInput
            style={styles.searchInput}
            placeholder="Where to in Ogun…"
            placeholderTextColor={INK_FAINT}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search input"
          />
          <TouchableOpacity
            style={styles.micBtn}
            accessibilityRole="button"
            accessibilityLabel="Voice search"
          >
            <Mic size={15} color={GOLD} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scope chips ──────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {SCOPE_CHIPS.map((chip) => {
          const isActive = chip === activeScope;
          return (
            <TouchableOpacity
              key={chip}
              style={[styles.scopeChip, isActive && styles.scopeChipActive]}
              onPress={() => setActiveScope(chip)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.scopeChipText, isActive && styles.scopeChipTextActive]}>
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Main scroll area ─────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Live search results ─────────────────────────────────────────── */}
        {shouldSearch && (
          <View style={styles.topResultSection}>
            {searchLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <ActivityIndicator color={GOLD} />
              </View>
            ) : liveResults.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <Text style={{ fontFamily: FONT_MONO, fontSize: 11, color: INK_FAINT, letterSpacing: 1 }}>
                  No results for "{debouncedQuery}"
                </Text>
              </View>
            ) : (
              <View style={styles.suggestionsList}>
                {liveResults.map((item: any, i: number) => (
                  <TouchableOpacity
                    key={item.id ?? i}
                    style={[styles.suggestionRow, i < liveResults.length - 1 && styles.suggestionRowBorder]}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (item._type === 'event') router.push(`/events/${item.id}`);
                      else if (item._type === 'stay') router.push(`/stays/${item.id}`);
                    }}
                  >
                    <View style={styles.suggestionIconBox}>
                      <MapPin size={16} color={GOLD} />
                    </View>
                    <View style={styles.suggestionTextBlock}>
                      <Text style={styles.suggestionTitle} numberOfLines={1}>{item.name ?? item.title ?? 'Unknown'}</Text>
                    </View>
                    <Text style={styles.suggestionSub}>{item._type ?? item.category ?? ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Discovery sections (shown only when not searching) ──────────── */}
        {!shouldSearch && (
          <>
            <View style={styles.topResultSection}>
              <SectionHeader kicker="TOP RESULT" title="Near you" />

              {/* Hero card */}
              <View style={styles.heroCard}>
                <LinearGradient
                  colors={['#2A1A2A', '#100810']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroCardGradient}
                >
                  {/* Adire ornament top-right */}
                  <View style={styles.heroAdire} pointerEvents="none">
                    <AdireOrnament size={80} opacity={0.22} />
                  </View>

                  {/* Bottom-left content */}
                  <View style={styles.heroCardBottom}>
                    <Text style={styles.heroKicker}>2.1 km away</Text>
                    <Text style={styles.heroCardTitle}>Olumo Rock Tourist Centre</Text>
                    <View style={styles.heroTagChip}>
                      <Text style={styles.heroTagText}>Attraction</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            </View>

            {/* ── Suggestions list ───────────────────────────────────────────── */}
            <View style={styles.suggestionsList}>
              {SUGGESTIONS.map((item, index) => {
                const IconComp = item.Icon;
                const isFirst = item.title.startsWith('Olumo');
                return (
                  <TouchableOpacity
                    key={item.title}
                    style={[
                      styles.suggestionRow,
                      index < SUGGESTIONS.length - 1 && styles.suggestionRowBorder,
                    ]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <View style={styles.suggestionIconBox}>
                      <IconComp size={16} color={GOLD} />
                    </View>
                    <View style={styles.suggestionTextBlock}>
                      {isFirst ? (
                        <Text style={styles.suggestionTitle} numberOfLines={1}>
                          <Text style={styles.suggestionTitleGold}>Olumo</Text>
                          {item.title.slice(5)}
                        </Text>
                      ) : (
                        <Text style={styles.suggestionTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.suggestionSub}>{item.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Recent searches ────────────────────────────────────────────── */}
            <View style={styles.recentSection}>
              <SectionHeader kicker="RECENT" title="Searches" />
              <View style={styles.recentChipsRow}>
                {RECENT_SEARCHES.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={styles.recentChip}
                    onPress={() => setQuery(term)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Clock size={11} color={INK_FAINT} />
                    <Text style={styles.recentChipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Keyboard suggestion bar ──────────────────────────────────────────── */}
      <View style={styles.keyboardBar}>
        {KEYBOARD_SUGGESTIONS.map((term) => (
          <TouchableOpacity
            key={term}
            style={styles.keyboardChip}
            onPress={() => setQuery(term)}
            activeOpacity={0.7}
          >
            <Text style={styles.keyboardChipText}>{term}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1.5,
    borderColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    gap: 8,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: INK,
    height: '100%',
  },
  micBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scope chips ──────────────────────────────────────────────────────────────
  chipsScroll: {
    marginTop: 12,
  },
  chipsContent: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  scopeChip: {
    height: 30,
    borderRadius: 99,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeChipActive: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD_LINE,
  },
  scopeChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: INK_MID,
  },
  scopeChipTextActive: {
    color: GOLD,
  },

  // ── Scroll area ───────────────────────────────────────────────────────────────
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60, // space above keyboard bar
  },

  // ── Section header ───────────────────────────────────────────────────────────
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 2,
  },
  sectionKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: GOLD,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '400',
    color: CREAM,
    lineHeight: 24,
    letterSpacing: -0.2,
  },

  // ── Top result / hero card ────────────────────────────────────────────────────
  topResultSection: {
    paddingTop: 20,
  },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    height: 130,
    overflow: 'hidden',
  },
  heroCardGradient: {
    flex: 1,
    padding: 14,
    justifyContent: 'flex-end',
  },
  heroAdire: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  heroCardBottom: {
    gap: 4,
  },
  heroKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.4,
    color: GOLD,
    textTransform: 'uppercase',
  },
  heroCardTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '400',
    color: CREAM,
    lineHeight: 24,
  },
  heroTagChip: {
    alignSelf: 'flex-start',
    backgroundColor: FOREST,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: INK,
    letterSpacing: 0.2,
  },

  // ── Suggestions list ──────────────────────────────────────────────────────────
  suggestionsList: {
    marginTop: 16,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  suggestionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  suggestionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: SURFACE_MID,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTextBlock: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: INK,
    lineHeight: 18,
  },
  suggestionTitleGold: {
    color: GOLD,
  },
  suggestionSub: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    color: INK_FAINT,
    textTransform: 'lowercase',
    textAlign: 'right',
  },

  // ── Recent searches ───────────────────────────────────────────────────────────
  recentSection: {
    marginTop: 20,
  },
  recentChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
  },
  recentChipText: {
    fontSize: 11,
    color: INK_MID,
    fontWeight: '500',
  },

  // ── Keyboard suggestion bar ───────────────────────────────────────────────────
  keyboardBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: SURFACE_MID,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  keyboardChip: {
    backgroundColor: SURFACE_ELEV,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  keyboardChipText: {
    fontSize: 11.5,
    color: INK,
    fontWeight: '500',
  },
});
