import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';
import { router } from 'expo-router';
import { MapPin, QrCode } from 'lucide-react-native';

const MIDNIGHT = '#0D1B1B';
const SURFACE = '#162525';
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const GOLD_LIGHT = '#E0AA42';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT = '#FFFFFF';
const TEXT_SEC = 'rgba(255,255,255,0.55)';
const TEXT_MUTED = 'rgba(255,255,255,0.28)';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function DateBlock({ dateStr }: { dateStr: string }) {
  const d = dateStr ? new Date(dateStr) : null;
  return (
    <LinearGradient
      colors={['#1A6B3C', '#0A3A1F']}
      style={styles.dateBlock}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Text style={styles.dateMonth}>{d ? MONTHS[d.getMonth()] : '---'}</Text>
      <Text style={styles.dateDay}>{d ? d.getDate() : '--'}</Text>
      <Text style={styles.dateYear}>{d ? d.getFullYear() : '----'}</Text>
    </LinearGradient>
  );
}

export default function EventsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['events-mobile'],
    queryFn: () => fetcher('/events?limit=30'),
  });

  const events = data?.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Upcoming</Text>
          <Text style={styles.heading}>Events</Text>
        </View>
        <TouchableOpacity
          style={styles.qrButton}
          onPress={() => router.push('/qr-checkin')}
        >
          <QrCode size={16} color={GOLD} />
          <Text style={styles.qrButtonText}>Scan In</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No Events Yet</Text>
              <Text style={styles.emptyText}>Check back soon for upcoming events.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isFree = !item.ticketPrice || Number(item.ticketPrice) === 0;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.86}
                onPress={() => router.push(`/events/${item.id}`)}
              >
                <DateBlock dateStr={item.startDate ?? item.date} />
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  <View style={styles.cardMeta}>
                    <MapPin size={11} color={TEXT_MUTED} />
                    <Text style={styles.cardMetaText} numberOfLines={1}>
                      {item.lga?.name ?? item.venue ?? 'Ogun State'}
                    </Text>
                  </View>
                </View>
                <View style={styles.priceCol}>
                  <View style={[styles.priceBadge, isFree && styles.priceBadgeFree]}>
                    <Text style={[styles.priceText, isFree && styles.priceTextFree]}>
                      {isFree ? 'FREE' : `₦${Number(item.ticketPrice).toLocaleString()}`}
                    </Text>
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
    paddingBottom: 20,
  },
  label: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500', letterSpacing: 0.5 },
  heading: { fontSize: 28, fontWeight: '800', color: TEXT, marginTop: 2, letterSpacing: -0.5 },

  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(200,150,42,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.3)',
  },
  qrButtonText: { color: GOLD, fontSize: 12, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 24 },

  card: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },

  dateBlock: {
    width: 62,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  dateMonth: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  dateDay: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
    letterSpacing: -1,
  },
  dateYear: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '500',
  },

  cardContent: { flex: 1, paddingVertical: 14, paddingLeft: 14, paddingRight: 4 },
  cardTitle: { color: TEXT, fontWeight: '700', fontSize: 14, marginBottom: 6, lineHeight: 19 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { color: TEXT_MUTED, fontSize: 11, flex: 1 },

  priceCol: { paddingHorizontal: 12, paddingVertical: 14 },
  priceBadge: {
    backgroundColor: 'rgba(200,150,42,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.25)',
  },
  priceBadgeFree: {
    backgroundColor: 'rgba(26,107,60,0.2)',
    borderColor: 'rgba(26,107,60,0.4)',
  },
  priceText: { color: GOLD_LIGHT, fontWeight: '800', fontSize: 11 },
  priceTextFree: { color: '#6EE7A0', fontSize: 11 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyTitle: { color: TEXT_SEC, fontSize: 17, fontWeight: '700' },
  emptyText: { color: TEXT_MUTED, fontSize: 13, textAlign: 'center', maxWidth: 220 },
});
