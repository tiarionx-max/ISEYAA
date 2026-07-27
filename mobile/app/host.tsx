import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronDown,
  Sparkles,
  Wallet,
  Users,
  ShieldCheck,
  Check,
  ArrowRight,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react-native';

import { api, fetcher } from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { PressableScale } from '../components/ui/PressableScale';
import { Chip } from '../components/ui/Chip';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  SURFACE_MID,
  FOREST,
  FOREST_DIM,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_MID,
  BORDER_SUBTLE,
  CARD_GRADIENTS,
  TYPE,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  FONT_DISPLAY,
  FONT_MONO,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
} from '../lib/tokens';

// ── Content (mirrors web/src/app/host/page.tsx) ───────

type Benefit = { icon: LucideIcon; title: string; desc: string };

const BENEFITS: Benefit[] = [
  {
    icon: Wallet,
    title: 'Earn money',
    desc: 'Set your price, accept bookings, get paid via wallet within 24h of guest checkout.',
  },
  {
    icon: Users,
    title: 'Reach the right guests',
    desc: 'Verified Ogun citizens, tourists, and members find your listing through curated categories.',
  },
  {
    icon: ShieldCheck,
    title: 'We handle payments',
    desc: 'Paystack-integrated escrow, automatic platform fee, full ledger you can export.',
  },
];

const HOSTABLE: string[] = [
  'Stay',
  'Lounge',
  'Club',
  'Beach',
  'Tour',
  'Experience',
  'Social Club',
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How does payout work?',
    a: 'Funds are held in Paystack escrow until 24 hours after guest checkout, then automatically credited to your in-app wallet. From there, withdraw to any Nigerian bank account.',
  },
  {
    q: 'How much do I keep?',
    a: '85% — we charge a 15% platform fee on the first 100 transactions, then 12% thereafter.',
  },
  {
    q: 'What about social clubs?',
    a: 'We process your member dues monthly and remit to your account. Members get auto-renewing access via wallet auto-debit.',
  },
];

// ── Types ──────────────────────────────────────────

interface Me {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  registeredRoles?: string[];
  isHost?: boolean;
}

// ── Screen ─────────────────────────────────────────

export default function HostScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
    staleTime: 30_000,
  });

  const alreadyHost =
    (me?.registeredRoles ?? []).includes('HOST') || me?.isHost === true;

  const becomeHost = useMutation({
    mutationFn: () => api.post('/users/me/become-host').then((r) => r.data),
    onSuccess: async (data) => {
      if (data?.accessToken && data?.refreshToken) {
        await SecureStore.setItemAsync('access_token', data.accessToken);
        await SecureStore.setItemAsync('refresh_token', data.refreshToken);
      }
      queryClient.invalidateQueries({ queryKey: ['me'] });
      Alert.alert('Welcome aboard!', 'You can now list your space.', [
        {
          text: 'Done',
          onPress: () => router.replace('/(tabs)/profile' as never),
        },
      ]);
    },
    onError: (err: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const msg = e?.response?.data?.message;
      Alert.alert(
        'Error',
        Array.isArray(msg) ? msg.join(', ') : msg ?? 'Something went wrong. Please try again.',
      );
    },
  });

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero (uses CARD_GRADIENTS.goldHero — 4-stop, NO inline hex) ── */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={CARD_GRADIENTS.goldHero as [string, string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Dark scrim overlay */}
            <View style={styles.heroScrim} pointerEvents="none" />

            <SafeAreaView edges={['top']} style={styles.heroSafe}>
              {/* Back chevron — touch target 44pt */}
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={8}
              >
                <ChevronLeft size={22} color={CREAM} />
              </Pressable>

              <View style={styles.heroContent}>
                <View style={styles.heroPill}>
                  <Sparkles size={12} color={GOLD} />
                  <Text style={styles.heroPillText}>Hosting on Iṣẹ́yáá</Text>
                </View>

                <Text style={styles.heroHeading}>
                  Become an <Text style={styles.heroHeadingGold}>Iṣẹ́yáá</Text>
                  {'\n'}Host
                </Text>

                <Text style={styles.heroSubtitle}>
                  Earn from your space, club, beach, or experience. Reach 7M+
                  citizens across 20 LGAs.
                </Text>
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>

        {/* ── Benefits ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.kicker}>WHY HOST</Text>
          <Text style={styles.sectionHeading}>Built for serious operators</Text>

          <View style={styles.benefitList}>
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <View key={title} style={styles.benefitCard}>
                <View style={styles.benefitIconBox}>
                  <Icon size={22} color={GOLD} />
                </View>
                <Text style={styles.benefitTitle}>{title}</Text>
                <Text style={styles.benefitDesc}>{desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── What you can host ────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.kicker}>LISTING TYPES</Text>
          <Text style={styles.sectionHeading}>What you can host</Text>
          <Text style={styles.sectionLead}>
            From a single guesthouse to a private members&apos; club — Iṣẹ́yáá
            supports every kind of place and experience in Ogun.
          </Text>

          <View style={styles.chipRow}>
            {HOSTABLE.map((t) => (
              <Chip key={t} label={t} icon={Check} />
            ))}
          </View>
        </View>

        {/* ── Q&A Accordion ────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.kicker}>COMMON QUESTIONS</Text>
          <Text style={styles.sectionHeading}>Quick answers</Text>

          <View style={styles.faqList}>
            {FAQS.map(({ q, a }, idx) => {
              const open = openFaq === idx;
              return (
                <View key={q} style={styles.faqCard}>
                  <Pressable
                    onPress={() => setOpenFaq(open ? null : idx)}
                    style={({ pressed }) => [
                      styles.faqHeader,
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={q}
                    accessibilityState={{ expanded: open }}
                  >
                    <Text style={styles.faqQuestion}>{q}</Text>
                    <View
                      style={[
                        styles.faqChevron,
                        open && styles.faqChevronOpen,
                      ]}
                    >
                      <ChevronDown size={18} color={GOLD} />
                    </View>
                  </Pressable>
                  {open ? <Text style={styles.faqAnswer}>{a}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>

        {/* Spacer for sticky CTA */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Sticky CTA footer ──────────────────────────── */}
      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          {alreadyHost ? (
            <PressableScale
              onPress={() => router.push('/host-dashboard' as never)}
              style={styles.outlineBtn}
            >
              <View style={styles.btnInner}>
                <LayoutDashboard size={18} color={GOLD} />
                <Text style={styles.outlineBtnText}>Go to dashboard</Text>
              </View>
            </PressableScale>
          ) : (
            <PressableScale
              onPress={() => becomeHost.mutate()}
              disabled={becomeHost.isPending}
              style={[
                styles.primaryBtn,
                becomeHost.isPending && { opacity: 0.7 },
              ]}
              hapticStyle="medium"
            >
              <View style={styles.btnInner}>
                {becomeHost.isPending ? (
                  <ActivityIndicator size="small" color={SURFACE_DEEP} />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>I want to host</Text>
                    <ArrowRight size={18} color={SURFACE_DEEP} />
                  </>
                )}
              </View>
            </PressableScale>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  // Hero
  heroWrap: {
    overflow: 'hidden',
  },
  heroGradient: {
    paddingBottom: 48,
    position: 'relative',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroSafe: {
    paddingTop: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    marginLeft: 12,
    marginTop: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingTop: 56,
    paddingHorizontal: SPACE_5,
    alignItems: 'center',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: GOLD_LINE,
    marginBottom: SPACE_5,
  },
  heroPillText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    fontWeight: '600',
    color: GOLD,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroHeading: {
    fontFamily: FONT_DISPLAY,
    fontSize: 40,
    fontWeight: '400',
    color: CREAM,
    letterSpacing: -0.5,
    lineHeight: 46,
    textAlign: 'center',
    marginBottom: 14,
  },
  heroHeadingGold: {
    color: GOLD,
    fontStyle: 'italic',
  },
  heroSubtitle: {
    ...TYPE.body,
    fontSize: 15,
    lineHeight: 22,
    color: INK_SECONDARY,
    textAlign: 'center',
    maxWidth: 320,
  },

  // Sections
  section: {
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_6 + SPACE_3,
  },
  kicker: {
    ...TYPE.kicker,
    color: GOLD,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionHeading: {
    fontFamily: FONT_DISPLAY,
    fontSize: 26,
    fontWeight: '400',
    color: INK,
    letterSpacing: -0.4,
    lineHeight: 32,
    marginBottom: SPACE_4,
  },
  sectionLead: {
    ...TYPE.body,
    color: INK_SECONDARY,
    marginBottom: SPACE_5,
  },

  // Benefits
  benefitList: {
    gap: SPACE_3,
  },
  benefitCard: {
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: RADIUS_LG,
    padding: SPACE_6,
  },
  benefitIconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_MD,
    backgroundColor: FOREST_DIM,
    borderWidth: 1,
    borderColor: FOREST,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE_4,
  },
  benefitTitle: {
    ...TYPE.bodyEmphasis,
    fontSize: 17,
    lineHeight: 23,
    color: INK,
    marginBottom: 6,
  },
  benefitDesc: {
    ...TYPE.body,
    color: INK_SECONDARY,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // FAQ
  faqList: {
    gap: SPACE_3,
  },
  faqCard: {
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: RADIUS_MD,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56, // touch target ≥ 44pt
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_4,
    gap: SPACE_3,
  },
  faqQuestion: {
    ...TYPE.bodyEmphasis,
    color: INK,
    flex: 1,
  },
  faqChevron: {
    transform: [{ rotate: '0deg' }],
  },
  faqChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  faqAnswer: {
    ...TYPE.body,
    color: INK_SECONDARY,
    paddingHorizontal: SPACE_4,
    paddingBottom: SPACE_4,
  },

  // Sticky footer CTA
  footerSafe: {
    backgroundColor: SURFACE_MID,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
  },
  footer: {
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
    paddingBottom: SPACE_3,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: SURFACE_DEEP,
    letterSpacing: 0,
  },
  outlineBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 0,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: SPACE_5,
    paddingVertical: 14,
  },
});

// Unused INK_MID guard (kept for future "already host" copy)
void INK_MID;
void GOLD_DIM;
