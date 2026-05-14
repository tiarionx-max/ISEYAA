import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';
import { Music, Clock, Zap } from 'lucide-react-native';

const MIDNIGHT = '#0D1B1B';
const SURFACE = '#162525';
const SURFACE_HIGH = '#1E3232';
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const GOLD_LIGHT = '#E0AA42';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT = '#FFFFFF';
const TEXT_SEC = 'rgba(255,255,255,0.55)';
const TEXT_MUTED = 'rgba(255,255,255,0.28)';

const SLOT_GRADIENTS: Record<string, [string, string]> = {
  RECORDING: ['#1A3A2A', '#0A201A'],
  MIXING: ['#1A2A3A', '#0A1A20'],
  MASTERING: ['#2A1A3A', '#160A20'],
  REHEARSAL: ['#3A2A1A', '#200D06'],
};

function WaveformBar({ height }: { height: number }) {
  return (
    <View
      style={{
        width: 3,
        height,
        borderRadius: 2,
        backgroundColor: `rgba(200,150,42,${0.3 + (height / 24) * 0.7})`,
        marginHorizontal: 1,
      }}
    />
  );
}

function Waveform() {
  const bars = [6, 12, 18, 10, 22, 8, 16, 20, 14, 24, 10, 18, 12, 6];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 28 }}>
      {bars.map((h, i) => <WaveformBar key={i} height={h} />)}
    </View>
  );
}

export default function StudioScreen() {
  const { data: slots, isLoading } = useQuery({
    queryKey: ['studio-slots-mobile'],
    queryFn: () => fetcher('/studio/slots'),
  });
  const { data: feed } = useQuery({
    queryKey: ['studio-feed-mobile'],
    queryFn: () => fetcher('/studio/feed?limit=10'),
  });

  const slotList: any[] = slots ?? [];
  const feedList: any[] = feed?.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header banner */}
        <LinearGradient
          colors={['#1A3A2A', MIDNIGHT]}
          style={styles.heroBanner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>Creative Space</Text>
              <Text style={styles.heroTitle}>Recording{'\n'}Studio</Text>
              <Waveform />
            </View>
            <View style={styles.heroIcon}>
              <Music size={48} color="rgba(200,150,42,0.2)" />
            </View>
          </View>
        </LinearGradient>

        {/* Available Slots */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Slots</Text>
          {isLoading ? (
            <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />
          ) : slotList.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No studio slots available right now.</Text>
            </View>
          ) : (
            slotList.map((slot: any) => {
              const gradColors = SLOT_GRADIENTS[slot.type] ?? ['#1A2A1A', '#0A160A'];
              return (
                <LinearGradient
                  key={slot.id}
                  colors={[gradColors[0], gradColors[1]]}
                  style={styles.slotCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={styles.slotHeader}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{slot.type}</Text>
                    </View>
                    {slot.isGovernmentPriority && (
                      <View style={styles.govBadge}>
                        <Zap size={10} color={GOLD} />
                        <Text style={styles.govBadgeText}>PRIORITY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.slotName}>{slot.name}</Text>
                  <View style={styles.slotMeta}>
                    <View style={styles.metaItem}>
                      <Text style={styles.priceText}>
                        ₦{Number(slot.pricePerHour).toLocaleString()}
                      </Text>
                      <Text style={styles.metaUnit}>/hr</Text>
                    </View>
                    <View style={styles.metaSep} />
                    <View style={styles.metaItem}>
                      <Clock size={11} color={TEXT_MUTED} />
                      <Text style={styles.metaTextSmall}>{slot.durationMinutes} min</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.bookButton}>
                    <Text style={styles.bookButtonText}>Book Session</Text>
                  </TouchableOpacity>
                </LinearGradient>
              );
            })
          )}
        </View>

        {/* Creative Feed */}
        {feedList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Creative Feed</Text>
            {feedList.map((item: any) => (
              <View key={item.id} style={styles.feedItem}>
                <View style={styles.feedLeft}>
                  <View style={styles.feedIconBox}>
                    <Music size={14} color={GOLD} />
                  </View>
                </View>
                <View style={styles.feedContent}>
                  <Text style={styles.feedTitle} numberOfLines={1}>
                    {item.title ?? item.originalName}
                  </Text>
                  <View style={styles.feedMeta}>
                    <Text style={styles.feedType}>{item.type}</Text>
                    <Text style={styles.feedDot}>·</Text>
                    <Text style={styles.feedAuthor}>{item.uploadedBy?.firstName ?? 'Artist'}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MIDNIGHT },

  heroBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(26,107,60,0.25)',
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 20,
    paddingBottom: 22,
  },
  heroLeft: { gap: 8 },
  heroLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600', letterSpacing: 1 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: TEXT, letterSpacing: -0.5, lineHeight: 30 },
  heroIcon: { opacity: 0.6 },

  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 14,
    letterSpacing: 0.2,
  },

  slotCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  slotHeader: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBadge: {
    backgroundColor: 'rgba(200,150,42,0.15)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.25)',
  },
  typeBadgeText: { color: GOLD_LIGHT, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  govBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(200,150,42,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  govBadgeText: { color: GOLD, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  slotName: { color: TEXT, fontWeight: '700', fontSize: 16, marginBottom: 10 },
  slotMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  priceText: { color: GOLD_LIGHT, fontWeight: '800', fontSize: 18 },
  metaUnit: { color: TEXT_MUTED, fontSize: 11 },
  metaSep: { width: 1, height: 14, backgroundColor: BORDER, marginHorizontal: 12 },
  metaTextSmall: { color: TEXT_MUTED, fontSize: 12 },

  bookButton: {
    backgroundColor: 'rgba(26,107,60,0.5)',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(26,107,60,0.5)',
  },
  bookButtonText: { color: TEXT, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },

  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  feedLeft: {},
  feedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(200,150,42,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.2)',
  },
  feedContent: { flex: 1 },
  feedTitle: { color: TEXT, fontSize: 13, fontWeight: '600', marginBottom: 3 },
  feedMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedType: { color: GOLD, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  feedDot: { color: TEXT_MUTED, fontSize: 10 },
  feedAuthor: { color: TEXT_MUTED, fontSize: 10 },

  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: TEXT_MUTED, fontSize: 13, textAlign: 'center' },
});
