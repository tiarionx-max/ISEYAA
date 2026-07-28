import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { api, fetcher, getErrorMessage } from '../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
} from '../lib/tokens';

// ── Data ───────────────────────────────────────────────────────────────────────

const QUICK_AMOUNTS = ['5,000', '10,000', '25,000', '50,000'] as const;
type QuickAmount = (typeof QUICK_AMOUNTS)[number];

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function TopUpScreen() {
  const [selectedAmount, setSelectedAmount] = useState<QuickAmount>('25,000');
  const queryClient = useQueryClient();

  const numericAmount = parseInt(selectedAmount.replace(/,/g, ''), 10);

  const { data: me } = useQuery<{ email?: string }>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });
  const userEmail = me?.email ?? '';

  const topupMutation = useMutation({
    mutationFn: () => {
      if (!userEmail) {
        return Promise.reject(new Error('Email not available. Please try again in a moment.'));
      }
      return api.post('/wallet/topup', { amount: numericAmount, email: userEmail })
        .then((r) => r.data as { reference: string; authorizationUrl?: string });
    },
    onSuccess: async (data) => {
      if (data.authorizationUrl) {
        try {
          await WebBrowser.openAuthSessionAsync(data.authorizationUrl, 'iseyaa://topup-callback');
        } catch {
          // Payment page failed to open — the Paystack webhook is still the source of truth.
        }
      }
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      Alert.alert(
        'Top-up initiated',
        'Your wallet will be credited once payment is confirmed.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
    },
    onError: (err: any) => {
      Alert.alert('Failed', getErrorMessage(err, err?.message ?? 'Could not initiate top-up. Please try again.'));
    },
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Backdrop */}
      <View style={styles.backdrop} />
      <View style={styles.backdropOverlay} />

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* ── Sheet header ─────────────────────────────────────────────────── */}
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitleBlock}>
            <Text style={styles.sheetKicker}>TOP UP</Text>
            <Text style={styles.sheetTitle}>
              Add to{' '}<Text style={styles.sheetTitleItalic}>wallet</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
          {/* ── Amount display ──────────────────────────────────────────────── */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>AMOUNT</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountSymbol}>₦</Text>
              <Text style={styles.amountValue}>{selectedAmount}</Text>
            </View>
            <Text style={styles.amountSub}>No fees on bank top-ups</Text>
          </View>

          {/* ── Quick amounts grid ──────────────────────────────────────────── */}
          <View style={styles.quickGrid}>
            {QUICK_AMOUNTS.map((amt) => {
              const isActive = amt === selectedAmount;
              return (
                <TouchableOpacity
                  key={amt}
                  style={[styles.quickChip, isActive && styles.quickChipActive]}
                  onPress={() => setSelectedAmount(amt)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.quickChipText, isActive && styles.quickChipTextActive]}>₦{amt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── CTA button ──────────────────────────────────────────────────── */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              style={[styles.ctaBtn, topupMutation.isPending && { opacity: 0.8 }]}
              onPress={() => topupMutation.mutate()}
              disabled={topupMutation.isPending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Top up ₦${selectedAmount}`}
            >
              {topupMutation.isPending ? (
                <ActivityIndicator color="#050E0E" />
              ) : (
                <Text style={styles.ctaBtnText}>Top up ₦{selectedAmount}</Text>
              )}
            </TouchableOpacity>
            <View style={styles.ctaSub}>
              <Shield size={11} color={INK_FAINT} />
              <Text style={styles.ctaSubText}>Secured by Iṣẹ́yáá · CBN-licensed</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: SURFACE_DEEP },
  backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,14,14,0.55)' },

  // Bottom sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: SURFACE_MID,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: BORDER,
    paddingBottom: 50,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 20,
    maxHeight: '94%',
  },
  dragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },
  sheetScrollContent: { paddingBottom: 8 },

  // Sheet header
  sheetHeader: { paddingTop: 20, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitleBlock: { gap: 2 },
  sheetKicker: { fontFamily: FONT_MONO, fontSize: 10, fontWeight: '600', letterSpacing: 1.8, color: GOLD, textTransform: 'uppercase' },
  sheetTitle: { fontFamily: FONT_DISPLAY, fontSize: 28, color: CREAM, letterSpacing: -0.4, lineHeight: 33 },
  sheetTitleItalic: { fontFamily: FONT_DISPLAY, fontSize: 28, color: GOLD, fontStyle: 'italic', letterSpacing: -0.4, lineHeight: 33 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  closeBtnText: { fontSize: 14, color: INK, lineHeight: 18 },

  // Amount
  amountSection: { paddingTop: 24, paddingHorizontal: 24, alignItems: 'center' },
  amountLabel: { fontFamily: FONT_MONO, fontSize: 9, fontWeight: '600', letterSpacing: 1.8, color: INK_MID, textTransform: 'uppercase' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: 6 },
  amountSymbol: { fontFamily: FONT_UI, fontSize: 32, color: CREAM, opacity: 0.7, lineHeight: 40 },
  amountValue: { fontSize: 56, fontWeight: '600', color: INK, letterSpacing: -1.5, lineHeight: 64 },
  amountSub: { fontSize: 11, color: INK_MID, marginTop: 8 },

  // Quick amounts
  quickGrid: { paddingTop: 20, paddingHorizontal: 24, flexDirection: 'row', gap: 8 },
  quickChip: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12,
    backgroundColor: SURFACE_ELEV, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  quickChipActive: { backgroundColor: GOLD_DIM, borderColor: GOLD_LINE },
  quickChipText: { fontFamily: FONT_UI, fontSize: 12, fontWeight: '600', color: INK },
  quickChipTextActive: { color: GOLD },

  // CTA
  ctaSection: { paddingTop: 24, paddingHorizontal: 24, gap: 10 },
  ctaBtn: { backgroundColor: GOLD, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: '#050E0E', letterSpacing: 0.1 },
  ctaSub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  ctaSubText: { fontSize: 10.5, color: INK_FAINT },
});
