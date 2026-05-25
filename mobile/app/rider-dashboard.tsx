import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft, Car, MapPin, Clock } from 'lucide-react-native';
import {
  SURFACE_DEEP, SURFACE_MID,
  GOLD, GOLD_DIM, GOLD_LINE,
  CREAM, INK, INK_MID, INK_FAINT,
  BORDER, FONT_DISPLAY, FONT_MONO,
} from '../lib/tokens';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RiderDashboardScreen() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1A2A1A', '#080E08']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(5,14,14,0.6)', 'rgba(5,14,14,0.0)', SURFACE_DEEP]}
        locations={[0, 0.2, 0.7]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <ChevronLeft size={20} color={INK} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerKicker}>ISEYAA RIDES</Text>
            <Text style={styles.headerTitle}>My Rides</Text>
          </View>
        </View>

        {/* No active ride state */}
        <View style={styles.emptyState}>
          <View style={styles.iconCircle}>
            <Car size={40} color={GOLD} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No active ride</Text>
          <Text style={styles.emptySub}>Book a ride to get moving around Ogun State</Text>

          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => {
              router.back();
              router.push('/transport-flow' as any);
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.ctaBtnText}>Book a Ride</Text>
          </TouchableOpacity>
        </View>

        {/* Quick stats row */}
        <View style={styles.statsRow}>
          {[
            { Icon: Clock, label: 'Avg wait', value: '< 5 min' },
            { Icon: MapPin, label: 'Coverage', value: 'All Ogun LGAs' },
            { Icon: Car, label: 'Vehicle types', value: 'Keke · Car' },
          ].map(({ Icon, label, value }) => (
            <View key={label} style={styles.statChip}>
              <Icon size={14} color={GOLD} strokeWidth={1.8} />
              <Text style={styles.statLabel}>{label}</Text>
              <Text style={styles.statValue}>{value}</Text>
            </View>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerKicker: {
    fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1.8,
    color: GOLD, textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 24, color: CREAM,
    fontWeight: '400', letterSpacing: -0.3,
  },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12,
  },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: GOLD_DIM, borderWidth: 1, borderColor: GOLD_LINE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: '400',
    color: CREAM, letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14, color: INK_MID, textAlign: 'center', lineHeight: 21,
  },
  ctaBtn: {
    marginTop: 12, width: '80%', height: 52, borderRadius: 14,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.2 },

  statsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 32,
  },
  statChip: {
    flex: 1, backgroundColor: SURFACE_MID,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 12, gap: 4, alignItems: 'center',
  },
  statLabel: { fontFamily: FONT_MONO, fontSize: 8.5, color: INK_FAINT, letterSpacing: 0.8, textAlign: 'center' },
  statValue: { fontSize: 11, fontWeight: '700', color: INK, textAlign: 'center' },
});
