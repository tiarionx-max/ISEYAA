import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher, api } from '../../lib/api';
import { router } from 'expo-router';
import { Filter, MapPin, Heart, Star, ShoppingBag, Sparkles, Check, ArrowRight } from 'lucide-react-native';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  BORDER,
  RADIUS_SM,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  SPACE_4,
  SPACE_5,
  CARD_GRADIENTS,
} from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────
type ActiveTab = 'Events' | 'Stays' | 'Studio' | 'Market';

const TABS: ActiveTab[] = ['Events', 'Stays', 'Studio', 'Market'];

const FILTER_CHIPS: Record<ActiveTab, string[]> = {
  Stays:  ['This weekend', '2 guests', 'Under ₦50k', 'Pool', 'WiFi', 'Pet-friendly'],
  Events: ['This week', 'Free', 'Cultural', 'Music', 'Family', 'Outdoor'],
  Studio: ['This weekend', 'Half-day', 'Solo', 'Group', 'Outdoor', 'Indoor'],
  Market: ['Apparel', 'Home', 'Pantry', 'Under ₦10k', 'Adire', 'Handmade'],
};

const GRADIENT_KEYS = ['gold', 'forest', 'rock', 'dusk', 'indigo'] as const;
type GradientKey = typeof GRADIENT_KEYS[number];

function gradientForIndex(i: number): [string, string] {
  const key = GRADIENT_KEYS[i % GRADIENT_KEYS.length] as GradientKey;
  return CARD_GRADIENTS[key] as [string, string];
}

// ── Shimmer hook ───────────────────────────────────────────────────────
function useShimmerOpacity() {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

// ── Skeleton card ──────────────────────────────────────────────────────
function SkeletonCard() {
  const opacity = useShimmerOpacity();
  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { width: '75%' }]} />
        <View style={[styles.skeletonLine, { width: '48%', marginTop: 10 }]} />
      </View>
    </Animated.View>
  );
}

// ── Tag chip ───────────────────────────────────────────────────────────
function TagChip({ label }: { label: string }) {
  return (
    <View style={styles.tagChip}>
      <Text style={styles.tagChipText}>{label}</Text>
    </View>
  );
}

// ── Heart button ───────────────────────────────────────────────────────
function HeartButton() {
  const [liked, setLiked] = useState(false);
  return (
    <TouchableOpacity style={styles.heartBtn} onPress={() => setLiked((v) => !v)} activeOpacity={0.75}>
      <Heart size={14} color={liked ? '#F87171' : INK} fill={liked ? '#F87171' : 'transparent'} />
    </TouchableOpacity>
  );
}

// ── Feed card ──────────────────────────────────────────────────────────
interface FeedCardProps {
  tag: string;
  title: string;
  location: string;
  price: string;
  priceLabel: string;
  meta: string;
  actionLabel: string;
  gradientIndex: number;
  rating?: number;
  onAction: () => void;
  onPress: () => void;
}

function FeedCard({
  tag,
  title,
  location,
  price,
  priceLabel,
  meta,
  actionLabel,
  gradientIndex,
  rating,
  onAction,
  onPress,
}: FeedCardProps) {
  const colors = gradientForIndex(gradientIndex);
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={onPress}>
      {/* Photo hero */}
      <View style={styles.cardHero}>
        <LinearGradient colors={colors} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <LinearGradient colors={['transparent', 'rgba(5,14,14,0.55)']} style={StyleSheet.absoluteFillObject} start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }} />
        <View style={styles.heroTagWrap}><TagChip label={tag} /></View>
        <View style={styles.heroHeartWrap}><HeartButton /></View>
        {/* Only show star rating when data provides a value */}
        {rating != null && (
          <View style={styles.heroStarWrap}>
            <Star size={11} color={GOLD} fill={GOLD} />
            <Text style={styles.heroRating}>{rating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.locationRow}>
          <MapPin size={11} color={INK_MID} />
          <Text style={styles.locationText} numberOfLines={1}>{location}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{price}</Text>
          <Text style={styles.priceLabelText}>{priceLabel}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardFooter}>
          <Text style={styles.metaText} numberOfLines={1}>{meta}</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.82}>
            <Text style={styles.actionBtnText}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Events feed ────────────────────────────────────────────────────────
function EventsFeed({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  if (isLoading || data.length === 0) {
    return <View style={styles.feedList}><SkeletonCard /><SkeletonCard /></View>;
  }
  return (
    <View style={styles.feedList}>
      {data.map((item: any, i: number) => {
        const isFree = !item.ticketPrice || Number(item.ticketPrice) === 0;
        const price = isFree ? 'FREE' : `₦${Number(item.ticketPrice).toLocaleString()}`;
        const startDate = item.startDate
          ? new Date(item.startDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
          : 'TBA';
        return (
          <FeedCard
            key={item.id ?? i}
            tag="Event"
            title={item.title ?? 'Untitled Event'}
            location={item.lga?.name ?? item.venue ?? 'Ogun State'}
            price={price}
            priceLabel={isFree ? '' : 'per ticket'}
            meta={startDate}
            actionLabel="Reserve"
            gradientIndex={i}
            rating={item.averageRating ?? item.rating}
            onPress={() => router.push(`/events/${item.id}`)}
            onAction={() => router.push(`/events/${item.id}`)}
          />
        );
      })}
    </View>
  );
}

// ── Stays feed ─────────────────────────────────────────────────────────
function StaysFeed({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  if (isLoading || data.length === 0) {
    return <View style={styles.feedList}><SkeletonCard /><SkeletonCard /></View>;
  }
  return (
    <View style={styles.feedList}>
      {data.map((item: any, i: number) => (
        <FeedCard
          key={item.id ?? i}
          tag="Stay"
          title={item.name ?? 'Unnamed Property'}
          location={item.lga?.name ?? item.city ?? 'Ogun State'}
          price={`₦${Number(item.pricePerNight ?? 0).toLocaleString()}`}
          priceLabel="/ night"
          meta={`Up to ${item.maxGuests ?? '—'} guests`}
          actionLabel="Book"
          gradientIndex={i}
          rating={item.averageRating ?? item.rating}
          onPress={() => router.push(`/stays/${item.id}`)}
          onAction={() => router.push(`/stays/${item.id}`)}
        />
      ))}
    </View>
  );
}

// ── Studio feed ────────────────────────────────────────────────────────
function StudioFeed({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  if (isLoading || data.length === 0) {
    return <View style={styles.feedList}><SkeletonCard /><SkeletonCard /></View>;
  }
  return (
    <View style={styles.feedList}>
      {data.map((item: any, i: number) => (
        <FeedCard
          key={item.id ?? i}
          tag="Studio"
          title={item.name ?? 'Studio Space'}
          location={item.lga?.name ?? item.location ?? 'Ogun State'}
          price={`₦${Number(item.pricePerHour ?? 0).toLocaleString()}`}
          priceLabel="/ hour"
          meta={item.type ?? 'Recording'}
          actionLabel="Book Studio"
          gradientIndex={i}
          rating={item.averageRating ?? item.rating}
          onPress={() => router.push({ pathname: '/ai-chat', params: { prompt: `Book ${item.name ?? 'this studio space'} for me` } } as any)}
          onAction={() => router.push({ pathname: '/ai-chat', params: { prompt: `Book ${item.name ?? 'this studio space'} for me` } } as any)}
        />
      ))}
    </View>
  );
}

// ── Market waitlist ─────────────────────────────────────────────────────
function MarketWaitlist() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [joined, setJoined] = useState(false);
  const [position, setPosition] = useState<number | null>(null);

  const join = useMutation({
    mutationFn: (payload: { email?: string; phone?: string; fullName?: string }) =>
      api.post('/waitlist', { source: 'marketplace_mobile', ...payload }).then((r) => r.data),
    onSuccess: (data: any) => {
      setJoined(true);
      setPosition(data?.position ?? null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Could not join waitlist. Please try again.';
      Alert.alert('Something went wrong', Array.isArray(msg) ? msg[0] : msg);
    },
  });

  function submit() {
    if (!email && !phone) {
      Alert.alert('Almost there', 'Enter your email or phone number.');
      return;
    }
    join.mutate({
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      fullName: fullName.trim() || undefined,
    });
  }

  if (joined) {
    return (
      <View style={styles.waitlistRoot}>
        <View style={styles.waitlistConfirmCard}>
          <View style={styles.waitlistCheckCircle}>
            <Check size={26} color={GOLD} strokeWidth={2.5} />
          </View>
          <Text style={styles.waitlistConfirmTitle}>You're in.</Text>
          {position !== null && (
            <Text style={styles.waitlistPosition}>
              You're #<Text style={{ color: GOLD, fontWeight: '700' }}>{position}</Text> on the list.
            </Text>
          )}
          <Text style={styles.waitlistConfirmSub}>
            We'll text or email you the moment the marketplace opens.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.waitlistRoot}>
      <View style={styles.waitlistHeroCard}>
        <View style={styles.waitlistKickerRow}>
          <Sparkles size={13} color={GOLD} />
          <Text style={styles.waitlistKicker}>COMING SOON</Text>
        </View>
        <Text style={styles.waitlistTitle}>Marketplace</Text>
        <Text style={styles.waitlistTitleItalic}>opens soon.</Text>
        <Text style={styles.waitlistDesc}>
          Authentic Adire, handmade goods, and local produce from Ogun State vendors. Join the waitlist for early access — no spam.
        </Text>

        <View style={styles.waitlistBullets}>
          {[
            'Verified Ogun State sellers only',
            'Wallet-native checkout with escrow protection',
            'Early signups get priority access',
          ].map((line, i) => (
            <View key={i} style={styles.waitlistBulletRow}>
              <View style={styles.waitlistBulletDot}>
                <Check size={9} color={GOLD} strokeWidth={3} />
              </View>
              <Text style={styles.waitlistBulletText}>{line}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.waitlistFormCard}>
        <Text style={styles.waitlistFormHeading}>Reserve your spot</Text>

        <TextInput
          style={styles.waitlistInput}
          placeholder="Full name (optional)"
          placeholderTextColor={INK_MID}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.waitlistInput}
          placeholder="you@example.com"
          placeholderTextColor={INK_MID}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.waitlistInput}
          placeholder="+234 801 234 5678 (optional)"
          placeholderTextColor={INK_MID}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <TouchableOpacity
          style={[styles.waitlistCta, join.isPending && { opacity: 0.6 }]}
          onPress={submit}
          activeOpacity={0.85}
          disabled={join.isPending}
        >
          {join.isPending ? (
            <ActivityIndicator color="#050E0E" />
          ) : (
            <>
              <Text style={styles.waitlistCtaText}>Reserve my spot</Text>
              <ArrowRight size={16} color="#050E0E" strokeWidth={2.5} />
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.waitlistFinePrint}>
          We'll only message you about the marketplace launch.
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────
export default function BookScreen() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('Stays');
  const [activeChip, setActiveChip] = useState<number>(0);

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => fetcher('/events?limit=10'),
  });
  const { data: staysData, isLoading: staysLoading } = useQuery({
    queryKey: ['stays'],
    queryFn: () => fetcher('/properties?limit=10'),
  });
  const { data: studioData, isLoading: studioLoading } = useQuery({
    queryKey: ['studio-slots'],
    queryFn: () => fetcher('/studio/feed?limit=10'),
  });

  const events: any[] = eventsData?.data ?? [];
  const stays: any[] = staysData?.data ?? [];
  const studios: any[] = (studioData?.data ?? studioData) ?? [];

  const chips = FILTER_CHIPS[activeTab];

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab);
    setActiveChip(0);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.kicker}>BOOK</Text>
            <View style={styles.displayRow}>
              <Text style={styles.displayTitle}>All of Ogun,{' '}</Text>
              <Text style={styles.displayTitleItalic}>one shelf.</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.filterBtn} activeOpacity={0.75}>
            <Filter size={18} color={INK_MID} />
          </TouchableOpacity>
        </View>

        {/* ── Category switcher ── */}
        <View style={styles.switcherWrap}>
          <View style={styles.switcher}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.switcherTab, isActive && styles.switcherTabActive]}
                  onPress={() => handleTabChange(tab)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.switcherTabText, isActive && styles.switcherTabTextActive]}>{tab}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Filter chips (hidden on Market waitlist) ── */}
        {activeTab !== 'Market' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent} style={styles.chipsScroll}>
            {chips.map((chip, i) => {
              const isFirst = i === activeChip;
              return (
                <TouchableOpacity key={chip} style={[styles.chip, isFirst && styles.chipActive]} onPress={() => setActiveChip(i)} activeOpacity={0.75}>
                  <Text style={[styles.chipText, isFirst && styles.chipTextActive]}>{chip}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Feed ── */}
        {activeTab === 'Events' && <EventsFeed data={events} isLoading={eventsLoading} />}
        {activeTab === 'Stays' && <StaysFeed data={stays} isLoading={staysLoading} />}
        {activeTab === 'Studio' && <StudioFeed data={studios} isLoading={studioLoading} />}
        {activeTab === 'Market' && <MarketWaitlist />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE_MID },
  scrollContent: { paddingBottom: 120 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: SPACE_4, paddingTop: SPACE_4, marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  kicker: { fontFamily: FONT_MONO, fontSize: 10, color: GOLD, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 4 },
  displayRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  displayTitle: { fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: '400', color: INK, lineHeight: 40 },
  displayTitleItalic: { fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: '400', fontStyle: 'italic', color: GOLD, lineHeight: 40 },
  filterBtn: {
    width: 40, height: 40, borderRadius: RADIUS_SM,
    backgroundColor: SURFACE_RAISED, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },

  // Category switcher
  switcherWrap: { marginHorizontal: SPACE_4, marginTop: 14 },
  switcher: { flexDirection: 'row', backgroundColor: SURFACE_RAISED, borderWidth: 1, borderColor: BORDER, borderRadius: RADIUS_MD, padding: 4 },
  switcherTab: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  switcherTabActive: { backgroundColor: GOLD, shadowColor: GOLD, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  switcherTabText: { fontFamily: FONT_UI, fontSize: 13, fontWeight: '600', color: INK_MID },
  switcherTabTextActive: { color: '#050E0E', fontWeight: '700' },

  // Filter chips
  chipsScroll: { marginTop: 14 },
  chipsContent: { paddingHorizontal: SPACE_5, gap: 8 },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: RADIUS_PILL, borderWidth: 1, borderColor: BORDER, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: GOLD_DIM, borderColor: GOLD_LINE },
  chipText: { fontFamily: FONT_UI, fontSize: 12, fontWeight: '500', color: INK_MID },
  chipTextActive: { color: GOLD, fontWeight: '600' },

  // Feed list
  feedList: { paddingHorizontal: SPACE_5, paddingTop: 14, gap: 14 },

  // Feed card
  card: { backgroundColor: SURFACE_RAISED, borderRadius: RADIUS_LG, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  cardHero: { height: 180, width: '100%', position: 'relative' },
  heroTagWrap: { position: 'absolute', top: 10, left: 10 },
  heroHeartWrap: { position: 'absolute', top: 10, right: 10 },
  heroStarWrap: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(5,14,14,0.55)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS_PILL,
  },
  heroRating: { fontFamily: FONT_MONO, fontSize: 11, color: GOLD, fontWeight: '600' },
  heartBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(5,14,14,0.55)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },

  // Card body
  cardBody: { paddingVertical: 14, paddingHorizontal: SPACE_4, gap: 6 },
  cardTitle: { fontFamily: FONT_UI, fontSize: 16, fontWeight: '700', color: INK, lineHeight: 22 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontFamily: FONT_UI, fontSize: 11.5, color: INK_MID, flex: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  priceText: { fontFamily: FONT_MONO, fontSize: 15, fontWeight: '600', color: GOLD },
  priceLabelText: { fontFamily: FONT_UI, fontSize: 11.5, color: INK_MID },
  divider: { height: 1, backgroundColor: BORDER, marginTop: 6, marginBottom: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metaText: { fontFamily: FONT_UI, fontSize: 11.5, color: INK_MID, flex: 1 },
  actionBtn: { height: 36, paddingHorizontal: 16, borderRadius: 10, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontFamily: FONT_UI, fontSize: 13, fontWeight: '700', color: '#050E0E' },

  // Tag chip
  tagChip: { height: 22, paddingHorizontal: 8, borderRadius: RADIUS_PILL, backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_LINE, alignItems: 'center', justifyContent: 'center' },
  tagChipText: { fontFamily: FONT_MONO, fontSize: 9.5, color: GOLD, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },

  // Skeleton
  skeletonCard: { backgroundColor: SURFACE_RAISED, borderRadius: RADIUS_LG, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  skeletonHero: { height: 180, backgroundColor: '#1B3636' },
  skeletonBody: { padding: SPACE_4 },
  skeletonLine: { height: 13, borderRadius: 6, backgroundColor: '#1B3636' },

  // ── Waitlist ────────────────────────────────────────────────────────
  waitlistRoot: {
    paddingHorizontal: SPACE_4,
    paddingTop: 12,
    gap: 14,
  },
  waitlistHeroCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
  },
  waitlistKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  waitlistKicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  waitlistTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 30,
    color: INK,
    lineHeight: 36,
    fontWeight: '400',
  },
  waitlistTitleItalic: {
    fontFamily: FONT_DISPLAY,
    fontSize: 30,
    fontStyle: 'italic',
    color: GOLD,
    lineHeight: 36,
    marginBottom: 14,
  },
  waitlistDesc: {
    fontSize: 13.5,
    color: INK_MID,
    lineHeight: 20,
    marginBottom: 18,
  },
  waitlistBullets: { gap: 10 },
  waitlistBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  waitlistBulletDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  waitlistBulletText: { flex: 1, fontSize: 13, color: INK_MID, lineHeight: 19 },

  waitlistFormCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 12,
  },
  waitlistFormHeading: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    color: INK,
    marginBottom: 4,
  },
  waitlistInput: {
    height: 46,
    borderRadius: RADIUS_SM,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    color: INK,
    fontSize: 14,
  },
  waitlistCta: {
    height: 50,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  waitlistCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#050E0E',
    letterSpacing: 0.2,
  },
  waitlistFinePrint: {
    fontSize: 11,
    color: INK_MID,
    textAlign: 'center',
    marginTop: 2,
  },

  // Confirmation state
  waitlistConfirmCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    padding: 32,
    alignItems: 'center',
  },
  waitlistCheckCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GOLD_DIM,
    borderWidth: 1.5,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  waitlistConfirmTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 26,
    color: INK,
    marginBottom: 6,
  },
  waitlistPosition: {
    fontSize: 14,
    color: INK_MID,
    marginBottom: 8,
  },
  waitlistConfirmSub: {
    fontSize: 13,
    color: INK_MID,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
});
