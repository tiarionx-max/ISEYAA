import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetcher } from '../../lib/api';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Wallet, Ticket, Home, Package, LogOut, ChevronRight, Settings, Shield, MessageSquare } from 'lucide-react-native';

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
const DANGER = '#F87171';

export default function ProfileScreen() {
  const { data: balance } = useQuery({
    queryKey: ['wallet-balance-mobile'],
    queryFn: () => fetcher('/wallet/balance'),
  });

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('access_token');
          router.replace('/login' as any);
        },
      },
    ]);
  }

  const tier = balance?.kyc_tier ?? 0;
  const balanceNgn = Number(balance?.balance_ngn ?? 0);

  const menuSections = [
    {
      title: 'Activity',
      items: [
        { label: 'My Tickets', icon: Ticket, onPress: () => {} },
        { label: 'My Bookings', icon: Home, onPress: () => {} },
        { label: 'My Orders', icon: Package, onPress: () => {} },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'AI Concierge', icon: MessageSquare, onPress: () => router.push('/ai-chat' as any) },
        { label: 'Security', icon: Shield, onPress: () => {} },
        { label: 'Settings', icon: Settings, onPress: () => {} },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Avatar + name */}
        <View style={styles.profileSection}>
          <LinearGradient
            colors={['#1A6B3C', '#0A3A1F']}
            style={styles.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.avatarInitial}>U</Text>
          </LinearGradient>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>My Account</Text>
            <View style={styles.tierBadge}>
              <Shield size={10} color={GOLD} />
              <Text style={styles.tierText}>KYC Tier {tier}</Text>
            </View>
          </View>
        </View>

        {/* Wallet card */}
        <LinearGradient
          colors={['#1A6B3C', '#0D3A20']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.walletCard}
        >
          {/* Decorative circles */}
          <View style={styles.walletCircle1} />
          <View style={styles.walletCircle2} />

          <View style={styles.walletHeader}>
            <View style={styles.walletLabelRow}>
              <Wallet size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.walletLabel}>ISEYAA Wallet</Text>
            </View>
            <View style={styles.walletTierBadge}>
              <Text style={styles.walletTierText}>TIER {tier}</Text>
            </View>
          </View>

          <Text style={styles.walletCurrency}>NGN</Text>
          <Text style={styles.walletAmount}>
            {balanceNgn.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </Text>

          <View style={styles.walletFooter}>
            <Text style={styles.walletLimit}>
              Daily limit: ₦{Number(balance?.daily_limit_ngn ?? 0).toLocaleString()}
            </Text>
            <TouchableOpacity style={styles.topUpBtn}>
              <Text style={styles.topUpText}>Top Up</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Menu sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.title}</Text>
            <View style={styles.menuGroup}>
              {section.items.map(({ label, icon: Icon, onPress }, idx) => (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.menuItem,
                    idx < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={onPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuIconBox}>
                    <Icon size={16} color={TEXT_SEC} />
                  </View>
                  <Text style={styles.menuLabel}>{label}</Text>
                  <ChevronRight size={15} color={TEXT_MUTED} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <View style={styles.logoutIconBox}>
            <LogOut size={16} color={DANGER} />
          </View>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MIDNIGHT },
  scroll: { paddingBottom: 24 },

  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '800', color: TEXT },
  profileInfo: { gap: 5 },
  userName: { fontSize: 20, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(200,150,42,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.2)',
  },
  tierText: { color: GOLD, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  walletCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  walletCircle1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -40,
    right: -30,
  },
  walletCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: -20,
    left: 20,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  walletTierBadge: {
    backgroundColor: 'rgba(200,150,42,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  walletTierText: { color: GOLD_LIGHT, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  walletCurrency: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  walletAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: TEXT,
    marginTop: 2,
    marginBottom: 16,
    letterSpacing: -1,
  },

  walletFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walletLimit: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  topUpBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  topUpText: { color: TEXT, fontSize: 12, fontWeight: '700' },

  menuSection: { marginBottom: 8 },
  menuSectionTitle: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  menuGroup: {
    marginHorizontal: 16,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: SURFACE_HIGH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, color: TEXT, fontSize: 14, fontWeight: '500' },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: SURFACE,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.15)',
  },
  logoutIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(248,113,113,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: DANGER, fontSize: 14, fontWeight: '600' },
});
