/**
 * Vendor Application / Status — quick task 260727-d6v
 *
 * 3-state (really 4, counting SUSPENDED) screen driven entirely by GET /vendors/me:
 *  - 404 ("no vendor profile found")  -> inline application form, POST /vendors
 *  - status === 'PENDING'             -> "under review" status card, no actions
 *  - status === 'ACTIVE'              -> sticky footer CTA into the product dashboard
 *  - status === 'SUSPENDED'           -> status card, contact support, no actions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { ChevronLeft, LayoutDashboard, ShieldAlert, Clock3 } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
import { PressableScale } from '../components/ui/PressableScale';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  SURFACE_MID,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_SUBTLE,
  CARD_GRADIENTS,
  WARNING,
  WARNING_DIM,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  TYPE,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
  FONT_DISPLAY,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
} from '../lib/tokens';

// ── Types ────────────────────────────────────────────

type VendorStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

interface Vendor {
  id: string;
  businessName: string;
  status: VendorStatus;
}

// ── Screen ───────────────────────────────────────────

export default function VendorScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: vendor, isLoading, isError, error } = useQuery<Vendor>({
    queryKey: ['my-vendor'],
    queryFn: () => fetcher('/vendors/me'),
    retry: false,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notApplied = isError && (error as any)?.response?.status === 404;

  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [lgaId, setLgaId] = useState('');

  const applyMutation = useMutation({
    mutationFn: () =>
      api.post('/vendors', {
        businessName: businessName.trim(),
        lgaId: lgaId.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-vendor'] });
      Alert.alert(
        'Application submitted',
        'We will review your application and notify you once approved.',
      );
    },
    onError: (err) => {
      Alert.alert(
        'Could not submit application',
        getErrorMessage(err, 'Please check your details and try again.'),
      );
    },
  });

  const canApply =
    businessName.trim().length >= 2 && lgaId.trim().length > 0 && !applyMutation.isPending;

  const showFooter = notApplied || vendor?.status === 'ACTIVE';

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero ─────────────────────────────────── */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={CARD_GRADIENTS.goldHero as [string, string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroScrim} pointerEvents="none" />
            <SafeAreaView edges={['top']} style={styles.heroSafe}>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={8}
              >
                <ChevronLeft size={22} color={CREAM} />
              </Pressable>

              <View style={styles.heroContent}>
                <Text style={styles.heroHeading}>
                  Become a <Text style={styles.heroHeadingGold}>Vendor</Text>
                </Text>
                <Text style={styles.heroSubtitle}>
                  List and sell products to 7M+ citizens and tourists across Ogun
                  State.
                </Text>
              </View>
            </SafeAreaView>
          </LinearGradient>
        </View>

        {/* ── Body (state-specific) ───────────────────── */}
        <View style={styles.section}>
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={GOLD} size="large" />
            </View>
          ) : notApplied ? (
            <View style={styles.formCard}>
              <Text style={styles.formLabel}>Business name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Aduke Crafts"
                placeholderTextColor={INK_FAINT}
                value={businessName}
                onChangeText={setBusinessName}
              />

              <Text style={styles.formLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="What do you sell?"
                placeholderTextColor={INK_FAINT}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              <Text style={styles.formLabel}>LGA ID</Text>
              <TextInput
                style={styles.input}
                placeholder="LGA UUID"
                placeholderTextColor={INK_FAINT}
                value={lgaId}
                onChangeText={setLgaId}
              />
              {/* Known simplification: no LGA picker component exists anywhere in
                  mobile yet (confirmed via grep). Plain text input pending a
                  future LGA picker. */}
            </View>
          ) : vendor?.status === 'PENDING' ? (
            <View style={styles.statusCard}>
              <View style={styles.statusIconBox}>
                <Clock3 size={22} color={GOLD} />
              </View>
              <Text style={styles.statusTitle}>Your application is under review</Text>
              <Text style={styles.statusSub}>
                We&apos;re reviewing your vendor application. You&apos;ll be
                notified once it&apos;s approved.
              </Text>
            </View>
          ) : vendor?.status === 'SUSPENDED' ? (
            <View style={styles.statusCard}>
              <View style={[styles.statusIconBox, styles.statusIconBoxDestructive]}>
                <ShieldAlert size={22} color={DESTRUCTIVE} />
              </View>
              <Text style={styles.statusTitle}>Your vendor account is suspended</Text>
              <Text style={styles.statusSub}>
                Contact support for details.
              </Text>
            </View>
          ) : vendor?.status === 'ACTIVE' ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>You&apos;re an active vendor</Text>
              <Text style={styles.statusSub}>
                Manage your products and orders from your vendor dashboard.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ height: showFooter ? 120 : 40 }} />
      </ScrollView>

      {/* ── Sticky CTA footer (notApplied | ACTIVE only) ── */}
      {showFooter ? (
        <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
          <View style={styles.footer}>
            {vendor?.status === 'ACTIVE' ? (
              <PressableScale
                onPress={() => router.push('/vendor-dashboard' as never)}
                style={styles.outlineBtn}
              >
                <View style={styles.btnInner}>
                  <LayoutDashboard size={18} color={GOLD} />
                  <Text style={styles.outlineBtnText}>Go to vendor dashboard</Text>
                </View>
              </PressableScale>
            ) : (
              <PressableScale
                onPress={() => applyMutation.mutate()}
                disabled={!canApply}
                style={[styles.primaryBtn, !canApply && { opacity: 0.7 }]}
                hapticStyle="medium"
              >
                <View style={styles.btnInner}>
                  {applyMutation.isPending ? (
                    <ActivityIndicator size="small" color={SURFACE_DEEP} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Apply</Text>
                  )}
                </View>
              </PressableScale>
            )}
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  heroWrap: { overflow: 'hidden' },
  heroGradient: { paddingBottom: 40, position: 'relative' },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  heroSafe: { paddingTop: 8 },
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
  heroContent: { paddingTop: 48, paddingHorizontal: SPACE_5, alignItems: 'center' },
  heroHeading: {
    fontFamily: FONT_DISPLAY,
    fontSize: 34,
    fontWeight: '400',
    color: CREAM,
    letterSpacing: -0.5,
    lineHeight: 40,
    textAlign: 'center',
    marginBottom: 12,
  },
  heroHeadingGold: { color: GOLD, fontStyle: 'italic' },
  heroSubtitle: {
    ...TYPE.body,
    fontSize: 15,
    lineHeight: 22,
    color: INK,
    textAlign: 'center',
    maxWidth: 320,
    opacity: 0.85,
  },

  section: { paddingHorizontal: SPACE_5, paddingTop: SPACE_6 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE_6 },

  formCard: {
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: RADIUS_LG,
    padding: SPACE_5,
    gap: SPACE_3,
  },
  formLabel: { fontSize: 12.5, fontWeight: '600', color: INK_MID, marginTop: SPACE_3, marginBottom: -4 },
  input: {
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: SPACE_4,
    fontSize: 15,
    color: INK,
  },
  inputMultiline: { height: 90, paddingTop: 12, textAlignVertical: 'top' },

  statusCard: {
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: RADIUS_LG,
    padding: SPACE_6,
    alignItems: 'center',
    gap: SPACE_3,
  },
  statusIconBox: {
    width: 48,
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statusIconBoxDestructive: { backgroundColor: DESTRUCTIVE_DIM },
  statusTitle: { ...TYPE.bodyEmphasis, fontSize: 16, color: INK, textAlign: 'center' },
  statusSub: { ...TYPE.body, color: INK_MID, textAlign: 'center' },

  footerSafe: { backgroundColor: SURFACE_MID, borderTopWidth: 1, borderTopColor: BORDER_SUBTLE },
  footer: { paddingHorizontal: SPACE_5, paddingTop: SPACE_4, paddingBottom: SPACE_3 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP },
  outlineBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 15, fontWeight: '700', color: GOLD },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: SPACE_5,
    paddingVertical: 14,
  },
});

// Unused-token guards (kept for parity with sibling screens' import blocks)
void RADIUS_PILL;
void WARNING;
void WARNING_DIM;
