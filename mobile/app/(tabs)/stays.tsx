import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';
import { router } from 'expo-router';
import { MapPin, Users, Star } from 'lucide-react-native';

const MIDNIGHT = '#0D1B1B';
const SURFACE = '#162525';
const GOLD = '#C8962A';
const GOLD_LIGHT = '#E0AA42';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT = '#FFFFFF';
const TEXT_SEC = 'rgba(255,255,255,0.55)';
const TEXT_MUTED = 'rgba(255,255,255,0.28)';

const HERO_PALETTES: [string, string][] = [
  ['#1A5A3C', '#0A2F1F'],
  ['#1A3A5A', '#0A1F2F'],
  ['#3A2A1A', '#20160A'],
  ['#2A1A3A', '#160A20'],
  ['#1A4A3A', '#0A2520'],
];

export default function StaysScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['properties-mobile'],
    queryFn: () => fetcher('/stays/properties?limit=30'),
  });

  const properties = data?.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Find Your</Text>
          <Text style={styles.heading}>Stays</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No Properties</Text>
              <Text style={styles.emptyText}>No stays are listed yet. Check back soon.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const palette = HERO_PALETTES[index % HERO_PALETTES.length];
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.86}
                onPress={() => router.push(`/stays/${item.id}`)}
              >
                {/* Photo hero area */}
                <LinearGradient
                  colors={[palette[0], palette[1]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.cardHero}
                >
                  <View style={styles.ratingBadge}>
                    <Star size={10} color={GOLD} fill={GOLD} />
                    <Text style={styles.ratingText}>4.8</Text>
                  </View>
                </LinearGradient>

                {/* Card body */}
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.priceBlock}>
                      <Text style={styles.priceAmount}>₦{Number(item.pricePerNight ?? 0).toLocaleString()}</Text>
                      <Text style={styles.priceUnit}>/night</Text>
                    </View>
                  </View>

                  <View style={styles.cardMeta}>
                    <View style={styles.metaItem}>
                      <MapPin size={11} color={TEXT_MUTED} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {item.lga?.name ?? item.address ?? 'Ogun State'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Users size={11} color={TEXT_MUTED} />
                      <Text style={styles.metaText}>Up to {item.maxGuests ?? '—'} guests</Text>
                    </View>
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  label: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500', letterSpacing: 0.5 },
  heading: { fontSize: 28, fontWeight: '800', color: TEXT, marginTop: 2, letterSpacing: -0.5 },

  list: { paddingHorizontal: 16, paddingBottom: 24 },

  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  cardHero: {
    height: 150,
    padding: 12,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingText: { color: GOLD_LIGHT, fontSize: 11, fontWeight: '700' },

  cardBody: { padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { color: TEXT, fontWeight: '700', fontSize: 15, lineHeight: 20 },

  priceBlock: { alignItems: 'flex-end', marginLeft: 8 },
  priceAmount: { color: GOLD_LIGHT, fontWeight: '800', fontSize: 16 },
  priceUnit: { color: TEXT_MUTED, fontSize: 10 },

  cardMeta: { flexDirection: 'row', gap: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: TEXT_MUTED, fontSize: 11 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyTitle: { color: TEXT_SEC, fontSize: 17, fontWeight: '700' },
  emptyText: { color: TEXT_MUTED, fontSize: 13, textAlign: 'center', maxWidth: 220 },
});
