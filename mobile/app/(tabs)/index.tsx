import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  Animated,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';
import { cacheGet, cacheSet, toggleBookmark, getBookmarks } from '../../lib/storage';
import { NewsTicker } from '../../components/NewsTicker';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  MapPin,
  Bell,
  Search,
  Mic,
  Car,
  Home,
  Ticket,
  ShoppingBag,
  QrCode,
  Star,
  Heart,
  LucideProps,
} from 'lucide-react-native';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  SURFACE_ELEV,
  FOREST,
  FOREST_LIGHT,
  FOREST_DEEP,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_MID,
  SUCCESS,
  SUCCESS_TEXT,
  RADIUS_SM,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
  SPACE_1,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  SPACE_8,
  SPACE_10,
  SPACE_12,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  CARD_GRADIENTS,
} from '../../lib/tokens';

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function SkeletonCard({ width, height }: { width: number; height: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{ width, height, borderRadius: RADIUS_LG, backgroundColor: SURFACE_RAISED, opacity }}
    />
  );
}

function EventSkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        width: 240,
        height: 210,
        borderRadius: RADIUS_LG,
        backgroundColor: SURFACE_RAISED,
        opacity,
        marginRight: SPACE_3,
      }}
    />
  );
}

// ── Animated card press wrapper ───────────────────────────────────────────────

function AnimatedCard({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      stiffness: 300,
      damping: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 300,
      damping: 20,
    }).start();
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── Live badge with pulsing dot ───────────────────────────────────────────────

function LiveBadge() {
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity: pulseOpacity }]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

// ── Event card (horizontal list) ─────────────────────────────────────────────

const GRADIENT_KEYS = Object.keys(CARD_GRADIENTS) as Array<keyof typeof CARD_GRADIENTS>;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function EventCard({ item, index }: { item: any; index: number }) {
  const key = GRADIENT_KEYS[index % GRADIENT_KEYS.length];
  const [c0, c1] = CARD_GRADIENTS[key];
  const dateStr: string = item.startDate ?? item.date ?? '';
  const d = dateStr ? new Date(dateStr) : null;
  const isLive = item.status === 'LIVE' || item.isLive;

  return (
    <AnimatedCard
      style={styles.eventCard}
      onPress={() => router.push(`/events/${item.id}` as any)}
    >
      {/* Photo placeholder — full-bleed gradient */}
      <LinearGradient
        colors={[c0, c1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.eventCardPhoto}
      >
        {/* Scrim */}
        <LinearGradient
          colors={['transparent', 'rgba(5,14,14,0.65)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Date badge — top left */}
        {d && (
          <View style={styles.eventDateBadge}>
            <Text style={styles.eventDateDay}>{d.getDate()}</Text>
            <Text style={styles.eventDateMonth}>{MONTHS[d.getMonth()]}</Text>
          </View>
        )}
        {/* LIVE badge — top right */}
        {isLive && (
          <View style={styles.eventLivePos}>
            <LiveBadge />
          </View>
        )}
      </LinearGradient>

      {/* Bottom content */}
      <View style={styles.eventCardBody}>
        {/* Tag chip */}
        <View style={styles.eventTagChip}>
          <Text style={styles.eventTagText} numberOfLines={1}>
            {(item.category ?? 'Event').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.eventCardTitle} numberOfLines={1}>
          {item.title ?? item.name}
        </Text>
        <View style={styles.eventLocRow}>
          <MapPin size={11} color={INK_FAINT} />
          <Text style={styles.eventLocText} numberOfLines={1}>
            {item.venue ?? item.location ?? 'Ogun State'}
          </Text>
        </View>
      </View>
    </AnimatedCard>
  );
}

// ── Attraction grid card (2-col) ──────────────────────────────────────────────

function AttractionCard({
  item,
  index,
  cardWidth,
  isBookmarked,
  onBookmark,
}: {
  item: any;
  index: number;
  cardWidth: number;
  isBookmarked: boolean;
  onBookmark: (id: string) => void;
}) {
  const key = GRADIENT_KEYS[index % GRADIENT_KEYS.length];
  const [c0, c1] = CARD_GRADIENTS[key];
  const rating: number = item.rating ?? 4.2;
  const distance: string = item.distance ?? '1.2 km';

  return (
    <AnimatedCard
      style={[styles.attractionCard, { width: cardWidth }]}
      onPress={() => router.push({ pathname: '/ai-chat', params: { prompt: `Tell me about ${item.name} attraction` } } as any)}
    >
      {/* Photo (real if available, gradient placeholder fallback) */}
      <View style={styles.attractionPhoto}>
        {item.imageUrls?.[0] ? (
          <Image
            source={{ uri: item.imageUrls[0] }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={[c0, c1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        {/* Heart bookmark — top right, circular glass */}
        <TouchableOpacity
          onPress={() => onBookmark(item.id)}
          style={styles.heartBtn}
          accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Heart
            size={14}
            color={isBookmarked ? GOLD : INK_FAINT}
            fill={isBookmarked ? GOLD : 'transparent'}
          />
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={styles.attractionBody}>
        <Text style={styles.attractionName} numberOfLines={2}>
          {item.name}
        </Text>
        {/* Sub info row: star rating + distance */}
        <View style={styles.attractionMeta}>
          <Star size={11} color={GOLD} fill={GOLD} />
          <Text style={styles.attractionRating}>{rating.toFixed(1)}</Text>
          <Text style={styles.attractionDistance}>{distance}</Text>
        </View>
      </View>
    </AnimatedCard>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  kicker,
  title,
  linkLabel = 'See all',
  onLink,
}: {
  kicker: string;
  title: string;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={styles.sectionKicker}>{kicker}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onLink && (
        <TouchableOpacity onPress={onLink}>
          <Text style={styles.sectionLink}>{linkLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Greeting helpers ──────────────────────────────────────────────────────────

function getYorubaTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'E kú aaro';
  if (h < 17) return 'E kú ọsán';
  return 'E kú irọlẹ';
}

function getEnglishGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function getCurrentDayName(): string {
  return new Date().toLocaleDateString('en-NG', { weekday: 'long' });
}

function getFirstName(name?: string): string {
  if (!name?.trim()) return '';
  return name.trim().split(/\s+/)[0];
}

// ── Quick action definitions ──────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Book Ride', Icon: Car, route: '/(tabs)/concierge?mode=ride' },
  { label: 'Find Stay', Icon: Home, route: '/(tabs)/book?section=stays' },
  { label: 'Buy Ticket', Icon: Ticket, route: '/(tabs)/book?section=events' },
  { label: 'Order Food', Icon: ShoppingBag, route: '/(tabs)/book?section=marketplace' },
  { label: 'Scan', Icon: QrCode, route: '/qr-checkin' },
] as const;

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const CARD_W = (screenWidth - 48) / 2;

  const [search, setSearch] = useState('');
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [attractions, setAttractions] = useState<any[]>([]);

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
    retry: 1,
    staleTime: 5 * 60_000,
  });
  const firstName = getFirstName(meData?.firstName);

  // Load cached attractions + bookmarks on mount
  useEffect(() => {
    cacheGet<any[]>('attractions').then((cached) => {
      if (cached) setAttractions(cached);
    });
    getBookmarks().then(setBookmarks);
  }, []);

  // Attractions query (preserved)
  const {
    data: attractionsData,
    isSuccess: attractionsSuccess,
    isFetching: attractionsFetching,
  } = useQuery({
    queryKey: ['attractions'],
    queryFn: () => fetcher('/attractions?limit=50'),
  });

  useEffect(() => {
    if (attractionsSuccess && Array.isArray(attractionsData) && attractionsData.length > 0) {
      setAttractions(attractionsData);
      cacheSet('attractions', attractionsData);
    }
  }, [attractionsSuccess, attractionsData]);

  // Events query
  const { data: eventsData, isFetching: eventsFetching } = useQuery({
    queryKey: ['events-discover'],
    queryFn: () => fetcher('/events?limit=10'),
  });

  const events: any[] = Array.isArray(eventsData) ? eventsData : (eventsData?.data ?? []);

  const filteredAttractions = attractions.filter(
    (a) => !search || a.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleBookmark(id: string) {
    const added = await toggleBookmark(id);
    setBookmarks((prev) => (added ? [...prev, id] : prev.filter((b) => b !== id)));
  }

  const showAttractionSkeleton = attractionsFetching && attractions.length === 0;
  const showEventSkeleton = eventsFetching && events.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <NewsTicker />
        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <View style={styles.heroWrapper}>
          {/* Clipped background layer — gradients + ornament */}
          <View style={styles.heroBackground}>
            <LinearGradient
              colors={[CARD_GRADIENTS.dusk[0], CARD_GRADIENTS.dusk[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={[
                'rgba(5,14,14,0.5)',
                'rgba(5,14,14,0.2)',
                'rgba(5,14,14,0.85)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </View>

          {/* Top row: location pill + bell */}
          <View style={styles.heroTopRow}>
            {/* Location pill — glass morphism */}
            <View style={styles.locationPill}>
              <MapPin size={13} color={GOLD} />
              <Text style={styles.locationPillText}>Abeokuta, Ogun</Text>
            </View>

            {/* Bell button */}
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => router.push('/notifications' as any)}
              accessibilityLabel="Notifications"
            >
              <Bell size={16} color={INK} />
            </TouchableOpacity>
          </View>

          {/* Greeting block */}
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingKicker}>{getYorubaTimeGreeting()} · {getCurrentDayName()}</Text>
            <View style={styles.greetingDisplay}>
              <Text style={styles.greetingLine}>{getEnglishGreeting()}</Text>
              {firstName ? <Text style={styles.greetingName}> {firstName}.</Text> : null}
            </View>
          </View>

          {/* Floating search bar — overlaps hero bottom edge */}
          <View style={styles.heroSearchOuter}>
            <View style={styles.heroSearchBar}>
              <Search size={16} color={INK_FAINT} />
              <TextInput
                style={styles.heroSearchInput}
                placeholder="Search Ogun — places, events, rides"
                placeholderTextColor={INK_FAINT}
                value={search}
                onChangeText={setSearch}
                onFocus={() => router.push('/search' as any)}
              />
              <View style={styles.micBtn}>
                <Mic size={14} color={GOLD} />
              </View>
            </View>
          </View>
        </View>

        {/* ── QUICK ACTIONS ─────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickScroll}
          contentContainerStyle={styles.quickContent}
        >
          {QUICK_ACTIONS.map(({ label, Icon, route }) => (
            <TouchableOpacity
              key={label}
              style={styles.quickPill}
              onPress={() => router.push(route as any)}
              accessibilityRole="button"
            >
              <View style={styles.quickIconBox}>
                <Icon size={16} color={GOLD} />
              </View>
              <Text style={styles.quickPillText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── HAPPENING NOW ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            kicker="HAPPENING NOW"
            title="This week in Ogun"
            onLink={() => router.push('/(tabs)/book' as any)}
          />
          {showEventSkeleton ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventListContent}
            >
              <EventSkeletonCard />
              <EventSkeletonCard />
              <EventSkeletonCard />
            </ScrollView>
          ) : events.length === 0 ? (
            <View style={styles.emptyHorizontal}>
              <Text style={styles.emptyHorizontalText}>No events right now</Text>
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventListContent}
              snapToInterval={252} // 240 card + 12 gap
              decelerationRate="fast"
              renderItem={({ item, index }) => <EventCard item={item} index={index} />}
            />
          )}
        </View>

        {/* ── NEAR YOU ──────────────────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionLast]}>
          <SectionHeader
            kicker="NEAR YOU"
            title="Within 5 km"
            linkLabel="Map"
            onLink={() => {}}
          />
          {showAttractionSkeleton ? (
            <View style={styles.attractionGrid}>
              <SkeletonCard width={CARD_W} height={200} />
              <SkeletonCard width={CARD_W} height={200} />
              <SkeletonCard width={CARD_W} height={200} />
              <SkeletonCard width={CARD_W} height={200} />
            </View>
          ) : filteredAttractions.length === 0 ? (
            <View style={styles.empty}>
              <MapPin size={36} color={INK_FAINT} />
              <Text style={styles.emptyTitle}>Nothing nearby yet</Text>
              <Text style={styles.emptyBody}>Try a different area or check back later.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredAttractions}
              keyExtractor={(item) => item.id}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.attractionRow}
              ItemSeparatorComponent={() => <View style={{ height: SPACE_3 }} />}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              renderItem={({ item, index }) => (
                <AttractionCard
                  item={item}
                  index={index}
                  cardWidth={CARD_W}
                  isBookmarked={bookmarks.includes(item.id)}
                  onBookmark={handleBookmark}
                />
              )}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_MID,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroWrapper: {
    height: 310,
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
    paddingBottom: SPACE_8,
    justifyContent: 'space-between',
    position: 'relative',
  },
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 28,
    overflow: 'hidden',
  },
  // Top row
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_1,
    backgroundColor: 'rgba(5,14,14,0.45)',
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: BORDER_MID,
    paddingHorizontal: SPACE_3,
    paddingVertical: 6,
  },
  locationPillText: {
    fontFamily: TYPE.caption.fontFamily,
    fontSize: 12,
    fontWeight: '600' as const,
    color: INK,
    letterSpacing: 0.2,
    marginLeft: 2,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(5,14,14,0.45)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Greeting
  greetingBlock: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: SPACE_6,
  },
  greetingKicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1.8,
    color: GOLD,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  greetingDisplay: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  greetingLine: {
    fontFamily: FONT_DISPLAY,
    fontSize: 38,
    fontWeight: '400' as const,
    color: CREAM,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  greetingName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 38,
    fontWeight: '400' as const,
    fontStyle: 'italic' as const,
    color: GOLD_BRIGHT,
    lineHeight: 44,
    letterSpacing: -0.5,
    marginLeft: 6,
  },

  // Floating search bar
  heroSearchOuter: {
    position: 'absolute',
    bottom: -22,
    left: SPACE_4,
    right: SPACE_4,
  },
  heroSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22,43,43,0.85)',
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER_MID,
    height: 50,
    paddingHorizontal: SPACE_4,
    gap: SPACE_2,
  },
  heroSearchInput: {
    flex: 1,
    fontFamily: TYPE.body.fontFamily,
    fontSize: 14,
    color: INK,
    height: '100%',
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS_SM,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Quick actions ────────────────────────────────────────────────────────
  quickScroll: {
    marginTop: 46,
  },
  quickContent: {
    paddingHorizontal: SPACE_4,
    gap: SPACE_2,
    alignItems: 'center',
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_MID,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingLeft: 10,
    paddingRight: SPACE_3,
    height: 44,
    marginRight: SPACE_2,
    gap: SPACE_2,
  },
  quickIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPillText: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 13,
    fontWeight: '700' as const,
    color: INK,
    letterSpacing: 0,
  },

  // ── Section layout ───────────────────────────────────────────────────────
  section: {
    marginTop: 26,
  },
  sectionLast: {
    marginTop: 28,
    paddingBottom: SPACE_4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: SPACE_4,
    marginBottom: SPACE_3,
  },
  sectionHeaderLeft: {
    gap: 2,
  },
  sectionKicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1.8,
    color: GOLD,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontFamily: TYPE.heading.fontFamily,
    fontSize: 20,
    fontWeight: '400' as const,
    color: CREAM,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  sectionLink: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 13,
    fontWeight: '500' as const,
    color: GOLD,
    letterSpacing: 0,
  },

  // ── Event cards ──────────────────────────────────────────────────────────
  eventListContent: {
    paddingLeft: SPACE_4,
    paddingRight: SPACE_2,
  },
  eventCard: {
    width: 240,
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER_MID,
    marginRight: SPACE_3,
    elevation: 8,
    shadowColor: SURFACE_DEEP,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  eventCardPhoto: {
    height: 150,
    padding: SPACE_2,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  eventDateBadge: {
    backgroundColor: 'rgba(5,14,14,0.65)',
    borderRadius: RADIUS_SM,
    paddingHorizontal: SPACE_2,
    paddingVertical: SPACE_1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  eventDateDay: {
    fontFamily: FONT_MONO,
    fontSize: 18,
    fontWeight: '800' as const,
    color: GOLD,
    lineHeight: 22,
  },
  eventDateMonth: {
    fontFamily: FONT_MONO,
    fontSize: 8,
    fontWeight: '700' as const,
    color: GOLD,
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight: 11,
  },
  eventLivePos: {
    position: 'absolute',
    top: SPACE_2,
    right: SPACE_2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5,14,14,0.7)',
    borderRadius: RADIUS_PILL,
    paddingHorizontal: SPACE_2,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: SUCCESS,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SUCCESS,
  },
  liveText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    fontWeight: '700' as const,
    color: SUCCESS_TEXT,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  eventCardBody: {
    padding: SPACE_3,
    gap: 4,
  },
  eventTagChip: {
    alignSelf: 'flex-start',
    backgroundColor: GOLD_DIM,
    borderRadius: RADIUS_SM,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    marginBottom: 2,
  },
  eventTagText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    fontWeight: '700' as const,
    color: GOLD,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  eventCardTitle: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 15,
    fontWeight: '700' as const,
    color: INK,
    lineHeight: 20,
  },
  eventLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  eventLocText: {
    fontFamily: TYPE.caption.fontFamily,
    fontSize: 11,
    color: INK_FAINT,
    flex: 1,
    lineHeight: 15,
  },

  // ── Attraction grid ──────────────────────────────────────────────────────
  attractionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACE_4,
    gap: SPACE_3,
  },
  attractionRow: {
    paddingHorizontal: SPACE_4,
    gap: SPACE_3,
  },
  attractionCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 6,
    shadowColor: SURFACE_DEEP,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  attractionPhoto: {
    height: 96,
    padding: SPACE_2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  heartBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(5,14,14,0.55)',
    borderWidth: 1,
    borderColor: BORDER_MID,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attractionBody: {
    padding: SPACE_3,
    gap: 5,
  },
  attractionName: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 13,
    fontWeight: '700' as const,
    color: INK,
    lineHeight: 17,
  },
  attractionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attractionRating: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    fontWeight: '600' as const,
    color: GOLD,
    letterSpacing: -0.1,
  },
  attractionDistance: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: CREAM,
    letterSpacing: -0.1,
    marginLeft: 'auto',
    opacity: 0.7,
  },

  // ── Empty states ─────────────────────────────────────────────────────────
  emptyHorizontal: {
    height: 100,
    marginHorizontal: SPACE_4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyHorizontalText: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 14,
    color: INK_FAINT,
  },
  empty: {
    alignItems: 'center',
    paddingTop: SPACE_12,
    paddingHorizontal: SPACE_4,
    gap: SPACE_2,
  },
  emptyTitle: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 15,
    fontWeight: '700' as const,
    color: INK_MID,
    marginTop: SPACE_2,
  },
  emptyBody: {
    fontFamily: TYPE.body.fontFamily,
    fontSize: 13,
    color: INK_FAINT,
    textAlign: 'center',
    maxWidth: 220,
    lineHeight: 20,
  },
});
