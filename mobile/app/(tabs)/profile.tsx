import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetcher, api, getErrorMessage } from '../../lib/api';
import { getBookmarks } from '../../lib/storage';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { PressableScale } from '../../components/ui/PressableScale';

// expo-haptics — loaded dynamically so missing package is a runtime no-op, not a TS error
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Haptics: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch (_) {
  // Package not installed — haptic feedback is silently skipped
}

import {
  Check,
  CheckCircle,
  ChevronRight,
  Car,
  Shield,
  Ticket,
  ShoppingBag,
  Heart,
  Clock,
  Home,
  Store,
  MessageSquare,
  Pencil,
  Trash2,
  KeyRound,
  Navigation,
  LayoutDashboard,
  Megaphone,
  BarChart3,
  type LucideProps,
} from 'lucide-react-native';

import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  FOREST,
  FOREST_LIGHT,
  GOLD,
  GOLD_BRIGHT,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  SUCCESS,
  ERROR,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  RADIUS_SM,
  RADIUS_LG,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_8,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';

// ── Shared local helper duplicated across mutation screens — reconciles the
// active session role to DRIVER before any driver mutation (mirrors
// organiser-dashboard.tsx's ensureOrganiserRole; RolesGuard checks the single
// active `role`, not `registeredRoles[]`, so a prior role switch could
// otherwise 403 this action even though the user already holds DRIVER). ────
async function ensureDriverRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'DRIVER') {
    const { data } = await api.patch('/users/me/role', { role: 'DRIVER' });
    if (data?.accessToken && data?.refreshToken) {
      await SecureStore.setItemAsync('access_token', data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    }
  }
}

// ── Types ──────────────────────────────────────────

interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  createdAt?: string;
  // 08-07: host detection — backend GET /users/me returns these.
  registeredRoles?: string[];
  otpChannel?: 'SMS' | 'WHATSAPP' | 'EMAIL';
  avatarUrl?: string | null;
}

interface WalletBalance {
  balance_ngn: number;
  kyc_tier: number;
  daily_limit_ngn: number;
}

// ── Helpers ────────────────────────────────────────

function getInitials(name?: string, phone?: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return 'DA';
}

function getMemberSince(createdAt?: string): string {
  if (!createdAt) return 'Mar 2024';
  const d = new Date(createdAt);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getHandle(name?: string, phone?: string): string {
  if (name && name.trim()) {
    return name.trim().toLowerCase().replace(/\s+/g, '');
  }
  if (phone) return phone.slice(-6);
  return 'damiola';
}

function otpChannelLabel(channel?: string): string {
  if (channel === 'WHATSAPP') return 'WhatsApp';
  if (channel === 'EMAIL') return 'Email';
  return 'SMS';
}

// ── Avatar Ring ────────────────────────────────────

function AvatarRing({ initials, avatarUrl }: { initials: string; avatarUrl?: string | null }) {
  return (
    <View style={avatarStyles.outerRing}>
      <LinearGradient
        colors={[GOLD, GOLD_BRIGHT, GOLD, FOREST_LIGHT, GOLD]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={avatarStyles.gradientRing}
      >
        <View style={avatarStyles.innerCircle}>
          {avatarUrl ? (
            <View style={avatarStyles.photoCircle}>
              <ExpoImage
                source={{ uri: avatarUrl }}
                style={avatarStyles.photoImage}
                contentFit="cover"
                transition={200}
              />
            </View>
          ) : (
            <LinearGradient
              colors={['#3a2820', '#1c130d']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={avatarStyles.photoCircle}
            >
              <Text style={avatarStyles.initials}>{initials}</Text>
            </LinearGradient>
          )}
        </View>
      </LinearGradient>
      {/* Verified badge */}
      <View style={avatarStyles.badge}>
        <Check size={11} color="#050E0E" />
      </View>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  outerRing: {
    width: 72,
    height: 72,
    position: 'relative',
  },
  gradientRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: SURFACE_DEEP,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  initials: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '400',
    color: CREAM,
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD,
    borderWidth: 3,
    borderColor: SURFACE_DEEP,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Toggle Switch ──────────────────────────────────

function ToggleSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[toggleStyles.track, value && toggleStyles.trackOn]}
    >
      <View style={[toggleStyles.thumb, value && toggleStyles.thumbOn]} />
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  track: {
    width: 46,
    height: 28,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackOn: {
    backgroundColor: GOLD,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
});

// ── Menu Row ────────────────────────────────────────

interface MenuRowItem {
  icon: React.ComponentType<LucideProps>;
  label: string;
  sub: string;
  onPress: () => void;
  isLast?: boolean;
}

function MenuRow({ icon: Icon, label, sub, onPress, isLast }: MenuRowItem) {
  return (
    <Pressable
      style={({ pressed }) => [
        menuStyles.row,
        !isLast && menuStyles.rowBorder,
        pressed && { opacity: 0.75 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={menuStyles.iconBox}>
        <Icon size={18} color={GOLD} />
      </View>
      <View style={menuStyles.textBlock}>
        <Text style={menuStyles.label}>{label}</Text>
        <Text style={menuStyles.sub}>{sub}</Text>
      </View>
      <ChevronRight size={16} color={INK_FAINT} />
    </Pressable>
  );
}

const menuStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS_SM,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
    color: INK,
    letterSpacing: 0,
    lineHeight: 19,
  },
  sub: {
    fontSize: 10.5,
    fontWeight: '400',
    color: INK_MID,
    lineHeight: 15,
  },
});

// ── Main Screen ─────────────────────────────────────

export default function ProfileScreen() {
  const queryClient = useQueryClient();

  const { data: balance } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance-mobile'],
    queryFn: () => fetcher('/wallet/balance'),
  });

  const { data: user } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  // Safe to query unconditionally — GET /transport/drivers/me has no @Roles guard
  // and returns null for a non-driver caller.
  const { data: driverMeData } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => fetcher('/transport/drivers/me'),
  });
  const driverProfile: any = driverMeData?.data ?? driverMeData ?? null;
  const driverApproved = driverProfile?.status === 'APPROVED';
  const driverIsOnline = !!driverProfile?.isOnline;

  const becomeDriverMutation = useMutation({
    mutationFn: () => api.post('/users/me/become-driver').then((r) => r.data),
    onSuccess: async (data) => {
      if (data?.accessToken && data?.refreshToken) {
        await SecureStore.setItemAsync('access_token', data.accessToken);
        await SecureStore.setItemAsync('refresh_token', data.refreshToken);
      }
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/driver-application' as never);
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getErrorMessage(err, 'Could not start your driver application. Please try again.'));
    },
  });

  const toggleOnlineMutation = useMutation({
    mutationFn: async () => {
      await ensureDriverRole(user?.role);
      if (driverIsOnline) return api.post('/transport/go-offline');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission is required to go online');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return api.post('/transport/go-online', { lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-me'] });
    },
    onError: (err: unknown) => {
      Alert.alert('Error', getErrorMessage(err, (err as any)?.message ?? 'Please try again.'));
    },
  });

  const { data: tourBookings } = useQuery({
    queryKey: ['tour-bookings-me'],
    queryFn: () => fetcher('/tour-bookings/me'),
  });
  const bookingsList: any[] = tourBookings?.data ?? tourBookings ?? [];
  const now = new Date();
  const upcomingBookings = bookingsList.filter(
    (b) => new Date(b.tourDate) >= now && ['PENDING', 'CONFIRMED'].includes(b.status),
  ).length;
  const pastBookings = bookingsList.length - upcomingBookings;

  const { data: myOrders } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => fetcher('/orders/mine'),
  });
  const ordersList: any[] = myOrders?.data ?? myOrders ?? [];
  const ordersInProgress = ordersList.filter((o) =>
    ['PENDING', 'PROCESSING', 'SHIPPED'].includes(o.status),
  ).length;

  const { data: myStays } = useQuery({
    queryKey: ['bookings-mine'],
    queryFn: () => fetcher('/bookings/mine'),
  });
  const staysList: any[] = myStays?.data ?? myStays ?? [];

  const [savedCount, setSavedCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      getBookmarks().then((ids) => setSavedCount(ids.length));
    }, []),
  );

  async function handleLogout() {
    Alert.alert(
      'Sign out?',
      "You'll need to log in again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            if (Haptics) {
              try {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch (_) { /* silently skip */ }
            }
            const refreshToken = await SecureStore.getItemAsync('refresh_token');
            if (refreshToken) {
              try {
                await api.post('/auth/logout', { refreshToken });
              } catch (_) { /* best-effort — proceed with local logout regardless */ }
            }
            await SecureStore.deleteItemAsync('access_token');
            await SecureStore.deleteItemAsync('refresh_token');
            router.replace('/onboarding' as any);
          },
        },
      ]
    );
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This is permanent and cannot be undone. All your personal data — name, contact info, and verification records — will be anonymized per Nigerian data protection law (NDPA). You will be signed out immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/users/me/data');
            } catch (err) {
              Alert.alert(
                'Deletion failed',
                getErrorMessage(err, 'Could not delete your account. Please try again.'),
              );
              return;
            }

            // Best-effort refresh-token revocation — failure here must not
            // block clearing local session state below.
            try {
              const refreshToken = await SecureStore.getItemAsync('refresh_token');
              if (refreshToken) {
                await api.post('/auth/logout', { refreshToken });
              }
            } catch (_) {
              // Ignored — token blacklisting is best-effort, local clear below is authoritative.
            }

            await SecureStore.deleteItemAsync('access_token');
            await SecureStore.deleteItemAsync('refresh_token');
            router.replace('/onboarding' as any);
          },
        },
      ]
    );
  }

  const tier = balance?.kyc_tier ?? 0;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const initials = getInitials(fullName, user?.phone);
  const displayName = fullName || user?.phone || 'Damiola A.';
  const handle = getHandle(fullName, user?.phone);
  const memberSince = getMemberSince(user?.createdAt);
  const role = user?.role ?? 'CITIZEN';
  const isDriver = (user?.registeredRoles ?? []).includes('DRIVER');

  // 08-07: Host onboarding entry point — hide once user is already a HOST.
  const alreadyHost = (user?.registeredRoles ?? []).includes('HOST');
  // 260727-d6v: Vendor onboarding entry point — hide once user is already a VENDOR.
  const alreadyVendor = (user?.registeredRoles ?? []).includes('VENDOR');
  // 260727-exm: Ministry Dashboard reachability — gated on the active session
  // role (mirrors RolesGuard's own check), not registeredRoles[]. There is no
  // self-service path to these roles anywhere in this codebase.
  const canViewMinistry = ['MINISTRY_VIEWER', 'STATE_ADMIN', 'SUPER_ADMIN'].includes(user?.role ?? '');

  // Stats — "Trips" = tour bookings (/tour-bookings/me), "Stays" = property bookings (/bookings/mine)
  const tripsCount = bookingsList.length;
  const staysCount = staysList.length;

  // KYC tier data
  const tierData = [
    { num: 1, label: 'TIER 1', limit: '₦200K', sub: 'daily limit' },
    { num: 2, label: 'TIER 2', limit: '₦1M', sub: 'daily limit' },
    { num: 3, label: 'TIER 3', limit: '₦5M', sub: 'daily limit' },
  ];

  const menuRows: MenuRowItem[] = [
    {
      icon: Ticket,
      label: 'My Bookings',
      sub: bookingsList.length > 0 ? `${upcomingBookings} upcoming · ${pastBookings} past` : 'No bookings yet',
      onPress: () => router.push('/trips' as any),
    },
    {
      icon: ShoppingBag,
      label: 'My Orders',
      sub: ordersList.length > 0 ? `${ordersInProgress} in progress` : 'No orders yet',
      onPress: () => router.push('/orders' as any),
    },
    {
      icon: Heart,
      label: 'Saved Places',
      sub: savedCount > 0 ? `${savedCount} saved` : 'Nothing saved yet',
      onPress: () => router.push('/saved-places' as any),
    },
    {
      icon: Clock,
      label: 'Activity',
      sub: 'Wallet & transaction history',
      onPress: () => router.push('/(tabs)/wallet' as any),
    },
    {
      icon: Navigation,
      label: 'My Rides',
      sub: 'Active and past trips',
      onPress: () => router.push('/rider-dashboard' as never),
    },
    {
      icon: MessageSquare,
      label: 'Verification Channel',
      sub: otpChannelLabel(user?.otpChannel),
      onPress: () => router.push('/otp-channel-settings' as any),
    },
    {
      icon: Shield,
      label: 'Security & ID',
      sub: 'NIN · BVN · 2FA',
      onPress: () => router.push('/kyc' as any),
    },
    {
      icon: Megaphone,
      label: 'Organiser Tools',
      sub: 'Manage your events',
      onPress: () => router.push('/organiser-dashboard' as never),
    },
    ...(canViewMinistry
      ? [
          {
            icon: BarChart3,
            label: 'Ministry Dashboard',
            sub: 'Government analytics',
            onPress: () => router.push('/ministry-dashboard' as never),
          },
        ]
      : []),
    {
      icon: KeyRound,
      label: 'Change Password',
      sub: 'Update your account password',
      onPress: () => router.push('/change-password' as any),
      isLast: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >

        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.avatarNameRow}>
            <AvatarRing initials={initials} avatarUrl={user?.avatarUrl} />

            <View style={styles.nameBlock}>
              {/* Display name + inline check + edit entry point */}
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
                <View style={styles.nameCheckBadge}>
                  <CheckCircle size={16} color={GOLD} fill={GOLD} />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.editProfileBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push('/profile-edit' as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                  hitSlop={8}
                >
                  <Pencil size={13} color={INK_FAINT} />
                </Pressable>
              </View>
              {/* Handle + member since */}
              <Text style={styles.handleText}>@{handle} · Member since {memberSince}</Text>
              {/* Chips row */}
              <View style={styles.chipsRow}>
                <View style={styles.chipTier}>
                  <Text style={styles.chipTierText}>Tier {tier >= 2 ? '2' : tier >= 1 ? '1' : '0'} Verified</Text>
                </View>
                {user?.role && (
                <View style={styles.chipLocation}>
                  <Text style={styles.chipLocationText}>{user.role === 'DRIVER' ? 'Driver · Ogun' : 'Ogun State'}</Text>
                </View>
              )}
              </View>
            </View>
          </View>
        </View>

        {/* ── KYC Progress Card ──────────────────────── */}
        <View style={styles.kycCard}>
          <LinearGradient
            colors={['rgba(212,168,67,0.10)', 'rgba(13,31,31,0.6)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.kycGradient}
          >
            {/* Kicker + headline */}
            <Text style={styles.kycKicker}>KYC PROGRESS</Text>
            <Text style={styles.kycHeadline}>
              {['Zero', 'One', 'Two', 'Three'][Math.min(tier, 3)]} of three tiers unlocked
            </Text>

            {/* Tier boxes */}
            <View style={styles.tierGrid}>
              {tierData.map((t) => {
                const done = tier >= t.num;
                const isPending = tier === t.num - 1;
                return (
                  <View
                    key={t.num}
                    style={[
                      styles.tierBox,
                      done
                        ? styles.tierBoxDone
                        : styles.tierBoxPending,
                    ]}
                  >
                    {/* Badge top-right */}
                    <View style={styles.tierBadgeWrap}>
                      {done ? (
                        <View style={styles.tierBadgeDone}>
                          <Check size={10} color="#050E0E" />
                        </View>
                      ) : (
                        <View style={styles.tierBadgePending}>
                          <View style={styles.tierBadgePendingDot} />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tierLabel, done ? styles.tierLabelDone : styles.tierLabelPending]}>
                      {t.label}
                    </Text>
                    <Text style={[styles.tierLimit, done ? styles.tierLimitDone : styles.tierLimitPending]}>
                      {t.limit}
                    </Text>
                    <Text style={styles.tierSub}>{t.sub}</Text>
                  </View>
                );
              })}
            </View>

            {/* CTA */}
            <Pressable
              style={({ pressed }) => [styles.kycCta, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/kyc' as any)}
              accessibilityRole="button"
              accessibilityLabel="Verify NIN"
            >
              <Text style={styles.kycCtaText}>Verify NIN →</Text>
            </Pressable>
          </LinearGradient>
        </View>

        {/* ── Stats Row ──────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { value: String(tripsCount), label: 'TRIPS' },
            { value: String(staysCount), label: 'STAYS' },
            { value: balance ? `₦${Math.round(Number(balance.balance_ngn) / 1000)}k` : '—', label: 'WALLET' },
          ].map((stat) => (
            <View key={stat.label} style={styles.statCell}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Driver onboarding / status card ─────────── */}
        {!isDriver && (
          <View style={styles.hostCtaWrap}>
            <PressableScale
              onPress={() => becomeDriverMutation.mutate()}
              disabled={becomeDriverMutation.isPending}
              hapticStyle="light"
              style={styles.hostCtaCard}
            >
              <View style={styles.hostCtaInner}>
                <View style={styles.hostCtaIconBox}>
                  <Car size={20} color={GOLD} />
                </View>
                <View style={styles.hostCtaTextBlock}>
                  <Text style={styles.hostCtaTitle}>Become a driver</Text>
                  <Text style={styles.hostCtaSub}>Go online and start earning rides</Text>
                </View>
                {becomeDriverMutation.isPending ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <ChevronRight size={16} color={INK_FAINT} />
                )}
              </View>
            </PressableScale>
          </View>
        )}

        {isDriver && !driverProfile && (
          <View style={styles.hostCtaWrap}>
            <PressableScale
              onPress={() => router.push('/driver-application' as never)}
              hapticStyle="light"
              style={styles.hostCtaCard}
            >
              <View style={styles.hostCtaInner}>
                <View style={styles.hostCtaIconBox}>
                  <Car size={20} color={GOLD} />
                </View>
                <View style={styles.hostCtaTextBlock}>
                  <Text style={styles.hostCtaTitle}>Complete your driver application</Text>
                  <Text style={styles.hostCtaSub}>Submit your licence and vehicle details</Text>
                </View>
                <ChevronRight size={16} color={INK_FAINT} />
              </View>
            </PressableScale>
          </View>
        )}

        {isDriver && driverProfile && !driverApproved && (
          <View style={styles.driverCardWrap}>
            <View style={[styles.driverCardSolid, { backgroundColor: SURFACE_RAISED }]}>
              <View style={driverStyles.inner}>
                <View style={driverStyles.iconBox}>
                  <Car size={20} color={GOLD} />
                </View>
                <View style={driverStyles.textBlock}>
                  <Text style={driverStyles.title}>Application under review</Text>
                  <Text style={driverStyles.sub}>
                    We will notify you once your driver application is approved
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {isDriver && driverApproved && (
          <View style={styles.driverCardWrap}>
            {driverIsOnline ? (
              <LinearGradient
                colors={[FOREST, SURFACE_DEEP]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.driverCardGradient}
              >
                <DriverCardContent
                  driverMode={driverIsOnline}
                  onToggle={() => toggleOnlineMutation.mutate()}
                  toggling={toggleOnlineMutation.isPending}
                />
              </LinearGradient>
            ) : (
              <View style={[styles.driverCardSolid, { backgroundColor: SURFACE_RAISED }]}>
                <DriverCardContent
                  driverMode={driverIsOnline}
                  onToggle={() => toggleOnlineMutation.mutate()}
                  toggling={toggleOnlineMutation.isPending}
                />
              </View>
            )}
            <Pressable
              style={({ pressed }) => [driverStyles.dashboardLink, pressed && { opacity: 0.75 }]}
              onPress={() => router.push('/driver-dashboard' as never)}
              accessibilityRole="button"
              accessibilityLabel="Go to driver dashboard"
            >
              <LayoutDashboard size={15} color={GOLD} />
              <Text style={driverStyles.dashboardLinkText}>Go to driver dashboard</Text>
              <ChevronRight size={14} color={GOLD} />
            </Pressable>
          </View>
        )}

        {/* ── Host CTA (08-07) — become a host, or go to dashboard once already a host (260727-eca) ── */}
        {alreadyHost ? (
          <View style={styles.hostCtaWrap}>
            <PressableScale
              onPress={() => router.push('/host-dashboard' as never)}
              hapticStyle="light"
              style={styles.hostCtaCard}
            >
              <View style={styles.hostCtaInner}>
                <View style={styles.hostCtaIconBox}>
                  <LayoutDashboard size={20} color={GOLD} />
                </View>
                <View style={styles.hostCtaTextBlock}>
                  <Text style={styles.hostCtaTitle}>Go to my host dashboard</Text>
                  <Text style={styles.hostCtaSub}>
                    Manage listings, bookings, and payouts
                  </Text>
                </View>
                <ChevronRight size={16} color={INK_FAINT} />
              </View>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.hostCtaWrap}>
            <PressableScale
              onPress={() => router.push('/host' as never)}
              hapticStyle="light"
              style={styles.hostCtaCard}
            >
              <View style={styles.hostCtaInner}>
                <View style={styles.hostCtaIconBox}>
                  <Home size={20} color={GOLD} />
                </View>
                <View style={styles.hostCtaTextBlock}>
                  <Text style={styles.hostCtaTitle}>Become a host</Text>
                  <Text style={styles.hostCtaSub}>
                    List your stay, club, or experience
                  </Text>
                </View>
                <ChevronRight size={16} color={INK_FAINT} />
              </View>
            </PressableScale>
          </View>
        )}

        {/* ── Vendor CTA (260727-d6v) — become a vendor, or go to dashboard once already active (260727-eca) ── */}
        {alreadyVendor ? (
          <View style={styles.hostCtaWrap}>
            <PressableScale
              onPress={() => router.push('/vendor-dashboard' as never)}
              hapticStyle="light"
              style={styles.hostCtaCard}
            >
              <View style={styles.hostCtaInner}>
                <View style={styles.hostCtaIconBox}>
                  <LayoutDashboard size={20} color={GOLD} />
                </View>
                <View style={styles.hostCtaTextBlock}>
                  <Text style={styles.hostCtaTitle}>Go to my vendor dashboard</Text>
                  <Text style={styles.hostCtaSub}>
                    Manage products and fulfil orders
                  </Text>
                </View>
                <ChevronRight size={16} color={INK_FAINT} />
              </View>
            </PressableScale>
          </View>
        ) : (
          <View style={styles.hostCtaWrap}>
            <PressableScale
              onPress={() => router.push('/vendor' as never)}
              hapticStyle="light"
              style={styles.hostCtaCard}
            >
              <View style={styles.hostCtaInner}>
                <View style={styles.hostCtaIconBox}>
                  <Store size={20} color={GOLD} />
                </View>
                <View style={styles.hostCtaTextBlock}>
                  <Text style={styles.hostCtaTitle}>Become a vendor</Text>
                  <Text style={styles.hostCtaSub}>
                    List and sell products across Ogun State
                  </Text>
                </View>
                <ChevronRight size={16} color={INK_FAINT} />
              </View>
            </PressableScale>
          </View>
        )}

        {/* ── Menu Section ───────────────────────────── */}
        <View style={styles.menuSection}>
          <View style={styles.menuCard}>
            {menuRows.map((row, idx) => (
              <MenuRow
                key={row.label}
                icon={row.icon}
                label={row.label}
                sub={row.sub}
                onPress={row.onPress}
                isLast={idx === menuRows.length - 1}
              />
            ))}
          </View>
        </View>

        {/* ── Sign Out + Version ─────────────────────── */}
        <View style={styles.signOutSection}>
          <Pressable
            style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.75 }]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
          <Text style={styles.versionText}>Iṣẹ́yáá · v1.0.0 (Build 1)</Text>
        </View>

        {/* ── Danger Zone ─────────────────────────────── */}
        <View style={styles.dangerZoneSection}>
          <Text style={styles.dangerZoneKicker}>DANGER ZONE</Text>
          <Text style={styles.dangerZoneCaption}>
            Permanently delete your account and anonymize your data. This cannot be undone.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.deleteAccountBtn, pressed && { opacity: 0.8 }]}
            onPress={handleDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete account permanently"
          >
            <Trash2 size={15} color={DESTRUCTIVE} />
            <Text style={styles.deleteAccountText}>Delete account</Text>
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Driver Card Inner ──────────────────────────────
// Extracted to avoid repeating JSX inside conditional gradient/view

function DriverCardContent({
  driverMode,
  onToggle,
  toggling,
}: {
  driverMode: boolean;
  onToggle: () => void;
  toggling?: boolean;
}) {
  return (
    <View style={driverStyles.inner}>
      <View style={[driverStyles.iconBox, driverMode && driverStyles.iconBoxOn]}>
        <Car size={20} color={driverMode ? '#050E0E' : GOLD} />
      </View>
      <View style={driverStyles.textBlock}>
        <Text style={driverStyles.title}>
          {driverMode ? 'Driver mode is ON' : 'Driver mode is OFF'}
        </Text>
        <Text style={driverStyles.sub}>
          {driverMode ? 'You are visible to riders' : 'Go online to accept rides'}
        </Text>
      </View>
      {toggling ? (
        <ActivityIndicator size="small" color={GOLD} />
      ) : (
        <ToggleSwitch value={driverMode} onValueChange={onToggle} />
      )}
    </View>
  );
}

const driverStyles = StyleSheet.create({
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_SM,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxOn: {
    backgroundColor: GOLD,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '600',
    color: INK,
    lineHeight: 19,
  },
  sub: {
    fontSize: 10.5,
    fontWeight: '400',
    color: INK_MID,
    lineHeight: 15,
  },
  dashboardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  dashboardLinkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: GOLD,
  },
});

// ── Screen Styles ──────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },
  scroll: {
    paddingBottom: 120,
  },

  // Header
  header: {
    paddingTop: 64,
    paddingHorizontal: SPACE_5,
    paddingBottom: SPACE_4,
  },
  avatarNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE_3,
  },
  nameBlock: {
    flex: 1,
    paddingTop: 2,
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
  },
  displayName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    fontWeight: '400',
    color: INK,
    letterSpacing: -0.3,
    lineHeight: 30,
    flexShrink: 1,
  },
  nameCheckBadge: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  handleText: {
    fontSize: 12,
    fontWeight: '400',
    color: INK_MID,
    lineHeight: 17,
    fontFamily: undefined,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  chipTier: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 99,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTierText: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  chipLocation: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(26,107,60,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(42,139,82,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLocationText: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '600',
    color: '#7DD49E',
    letterSpacing: 0.3,
    lineHeight: 14,
  },

  // KYC Progress Card
  kycCard: {
    marginHorizontal: SPACE_5,
    borderRadius: RADIUS_LG,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  kycGradient: {
    padding: SPACE_4,
    paddingBottom: SPACE_4,
    position: 'relative',
    overflow: 'hidden',
  },
  kycKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.8,
    lineHeight: 14,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  kycHeadline: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    fontWeight: '400',
    color: CREAM,
    letterSpacing: -0.3,
    lineHeight: 26,
    marginBottom: SPACE_4,
  },
  tierGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACE_4,
  },
  tierBox: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    paddingTop: 24,
    position: 'relative',
    minHeight: 80,
    justifyContent: 'flex-end',
  },
  tierBoxDone: {
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.30)',
  },
  tierBoxPending: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: GOLD_LINE,
  },
  tierBadgeWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  tierBadgeDone: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: SUCCESS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadgePending: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadgePendingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GOLD_LINE,
  },
  tierLabel: {
    fontFamily: FONT_MONO,
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 13,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  tierLabelDone: {
    color: GOLD,
  },
  tierLabelPending: {
    color: GOLD_LINE,
  },
  tierLimit: {
    fontFamily: FONT_MONO,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  tierLimitDone: {
    color: INK,
  },
  tierLimitPending: {
    color: INK_MID,
  },
  tierSub: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '400',
    color: INK_MID,
    lineHeight: 13,
  },
  kycCta: {
    height: 44,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#050E0E',
    letterSpacing: 0,
    lineHeight: 20,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACE_5,
    marginTop: 18,
    gap: 8,
  },
  statCell: {
    flex: 1,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    fontWeight: '400',
    color: GOLD,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  statLabel: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '600',
    color: INK_MID,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    lineHeight: 14,
  },

  // Driver card wrapper
  driverCardWrap: {
    paddingHorizontal: SPACE_5,
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  driverCardGradient: {
    borderRadius: 18,
  },
  driverCardSolid: {
    borderRadius: 18,
  },

  // Host CTA card (08-07)
  hostCtaWrap: {
    paddingHorizontal: SPACE_5,
    marginTop: 14,
  },
  hostCtaCard: {
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    overflow: 'hidden',
  },
  hostCtaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    minHeight: 44,
  },
  hostCtaIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_SM,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostCtaTextBlock: {
    flex: 1,
    gap: 3,
  },
  hostCtaTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: INK,
    lineHeight: 19,
  },
  hostCtaSub: {
    fontSize: 10.5,
    fontWeight: '400',
    color: INK_MID,
    lineHeight: 15,
  },

  // Menu section
  menuSection: {
    paddingHorizontal: SPACE_5,
    marginTop: 18,
  },
  menuCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },

  // Sign Out + Version
  signOutSection: {
    paddingHorizontal: SPACE_5,
    marginTop: 14,
    gap: SPACE_3,
    alignItems: 'center',
  },
  signOutBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: ERROR,
    letterSpacing: 0,
    lineHeight: 19,
  },
  versionText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    fontWeight: '600',
    color: INK_FAINT,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 14,
  },

  // Danger Zone
  dangerZoneSection: {
    paddingHorizontal: SPACE_5,
    marginTop: SPACE_8,
    paddingTop: SPACE_5,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 8,
  },
  dangerZoneKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    fontWeight: '600',
    color: INK_FAINT,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  dangerZoneCaption: {
    fontSize: 11.5,
    fontWeight: '400',
    color: INK_MID,
    lineHeight: 16,
    marginBottom: 4,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: DESTRUCTIVE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
  },
  deleteAccountText: {
    fontSize: 13,
    fontWeight: '600',
    color: DESTRUCTIVE,
    letterSpacing: 0,
    lineHeight: 19,
  },
});
