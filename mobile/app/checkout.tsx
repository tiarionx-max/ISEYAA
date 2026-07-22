/**
 * Checkout Screen — /checkout
 *
 * Phase 8 / Plan 08-06 (Wave 3).
 *
 * Backend contract (verified against backend/src/modules/marketplace/dto/create-order.dto.ts):
 *
 *   POST /api/v1/orders accepts ONLY { items: { productId, quantity }[], email: string }.
 *   The global ValidationPipe runs with `forbidNonWhitelisted: true`, so ANY extra field
 *   beyond { items, email } returns HTTP 400.
 *
 *   ===> Shipping address capture is DEFERRED <===
 *   This screen intentionally does NOT collect a shipping address. A future phase will
 *   add address handling once the backend DTO is extended.
 *
 * Response shape (marketplace.service.ts createOrder() returns `{ order, payment }` —
 * NOT a top-level `orderId`; kept here only for the (currently unused) order.id field):
 *   { order: { id }, payment?: { authorizationUrl, reference }, authorizationUrl? }
 *
 * Read defensively (mirror web pattern at web/src/app/checkout/page.tsx):
 *   const url = data.payment?.authorizationUrl ?? data.authorizationUrl;
 *
 * Routing: Stack screen `checkout` is registered by 08-04b with presentation: 'card'.
 * This file does NOT touch _layout (disjoint ownership — H-4).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, ShoppingBag } from 'lucide-react-native';

import { api, fetcher } from '../lib/api';
import { useCartStore } from '../lib/cart-store';
import { PressableScale } from '../components/ui/PressableScale';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
  BORDER,
  BORDER_SUBTLE,
  BORDER_FOCUS,
  ERROR,
  ERROR_TEXT,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  RADIUS_MD,
} from '../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────
type Me = { email?: string };

type OrderResponse = {
  order: { id: string };
  payment?: {
    authorizationUrl: string;
    reference: string;
  };
  authorizationUrl?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function CheckoutScreen(): JSX.Element {
  const insets = useSafeAreaInsets();
  const items = useCartStore((s) => s.items);

  const [email, setEmail] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);

  // Default email from session (mirrors topup.tsx pattern at lines 63-67).
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  useEffect(() => {
    if (!email && me?.email) {
      setEmail(me.email);
    }
    // we intentionally only seed when the field is empty — typed input is sacred
  }, [me?.email, email]);

  const subtotal = useCartStore.getState().totalPrice();
  const totalCount = useCartStore.getState().totalCount();

  // ── Mutation: POST /api/v1/orders ─────────────────────────────────────────
  const orderMutation = useMutation<OrderResponse, any, void>({
    mutationFn: async () => {
      const payload = {
        items: useCartStore.getState().items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        email,
      };
      // NOTE: ONLY { items, email }. Backend's forbidNonWhitelisted rejects any extra
      // field with HTTP 400 (see file-level header comment).
      const res = await api.post('/orders', payload);
      return res.data as OrderResponse;
    },
    onSuccess: async (data) => {
      // Defensive read per web pattern (see web/src/app/checkout/page.tsx).
      const url = data.payment?.authorizationUrl ?? data.authorizationUrl;
      if (!url) {
        Alert.alert(
          'Order submitted',
          'Order created but no payment URL was returned. Check your wallet for confirmation.',
        );
        useCartStore.getState().clear();
        router.replace('/(tabs)/book');
        return;
      }

      try {
        await WebBrowser.openAuthSessionAsync(url, 'iseyaa://checkout-callback');
      } catch (err: any) {
        // Browser failures should not block the cart-clear / redirect.
        // The Paystack flow is the user's source of truth — backend webhook will reconcile.
        Alert.alert(
          'Payment opened',
          err?.message ?? 'The payment page could not be opened — please try the link from your email.',
        );
      }

      useCartStore.getState().clear();
      Alert.alert(
        'Order submitted',
        'Check your wallet for confirmation. We will email you the receipt.',
        [{ text: 'Done', onPress: () => router.replace('/(tabs)/book') }],
      );
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'We could not place your order. Please try again.';
      Alert.alert('Order failed', Array.isArray(msg) ? msg.join('\n') : String(msg));
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSubmit = (): void => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email');
      return;
    }
    setEmailError(null);
    orderMutation.mutate();
  };

  // ── Empty cart fallback ─────────────────────────────────────────────────────
  if (items.length === 0 && !orderMutation.isPending && !orderMutation.isSuccess) {
    return (
      <View style={[styles.root, styles.centered]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.emptyIconCircle}>
          <ShoppingBag size={28} color={INK_FAINT} />
        </View>
        <Text style={styles.emptyTitle}>Nothing to checkout</Text>
        <Text style={styles.emptyBody}>Your cart is empty.</Text>
        <PressableScale
          onPress={() => router.replace('/(tabs)/book')}
          style={styles.emptyBtn}
          hapticStyle="medium"
        >
          <Text style={styles.emptyBtnText}>Back to marketplace</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACE_3 }]}>
        <PressableScale onPress={() => router.back()} style={styles.backBtn} hapticStyle="light">
          <ChevronLeft size={22} color={INK} strokeWidth={2.2} />
        </PressableScale>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Section 1 — Order Summary */}
        <View style={styles.section}>
          <Text style={styles.kicker}>ORDER SUMMARY</Text>

          <View style={styles.itemsCard}>
            {items.map((item, idx) => (
              <View key={item.productId} style={[styles.itemRow, idx > 0 && styles.itemRowDivider]}>
                <View style={styles.thumbWrap}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <ShoppingBag size={16} color={INK_FAINT} />
                    </View>
                  )}
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemVendor} numberOfLines={1}>
                    {item.vendorName}
                  </Text>
                </View>
                <View style={styles.itemPriceCol}>
                  <Text style={styles.itemQty}>x{item.quantity}</Text>
                  <Text style={styles.itemTotal}>
                    ₦{(item.price * item.quantity).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.subtotalDivider} />
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Subtotal</Text>
              <Text style={styles.subtotalValue}>
                ₦{subtotal.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Section 2 — Email */}
        <View style={styles.section}>
          <Text style={styles.kicker}>CONFIRMATION EMAIL</Text>
          <Text style={styles.inputLabel}>Email for receipt</Text>
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (emailError) setEmailError(null);
            }}
            placeholder="you@example.com"
            placeholderTextColor={INK_FAINT}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            style={[
              styles.input,
              emailFocused ? styles.inputFocused : null,
              emailError ? styles.inputError : null,
            ]}
            accessibilityLabel="Email for receipt"
          />
          {emailError ? (
            <Text style={styles.errorCaption}>{emailError}</Text>
          ) : (
            <Text style={styles.helpCaption}>
              We will email the receipt and order confirmation here.
            </Text>
          )}
        </View>

        {/* Section 3 — Deferred note (H-2 explicit) */}
        <View style={styles.section}>
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Shipping</Text>
            <Text style={styles.noteBody}>
              Shipping details are deferred this release — the backend order
              contract is email-only. The vendor will reach out via your
              registered phone to confirm shipping once payment clears.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky pay button */}
      <View style={[styles.payBar, { paddingBottom: Math.max(insets.bottom, SPACE_4) }]}>
        <PressableScale
          onPress={handleSubmit}
          disabled={orderMutation.isPending || items.length === 0}
          style={[
            styles.payBtn,
            (orderMutation.isPending || items.length === 0) && styles.payBtnDisabled,
          ]}
          hapticStyle="medium"
        >
          {orderMutation.isPending ? (
            <ActivityIndicator color={SURFACE_DEEP} />
          ) : (
            <Text style={styles.payBtnText}>
              Pay ₦{subtotal.toLocaleString()}
              {totalCount > 0 ? ` (${totalCount} item${totalCount === 1 ? '' : 's'})` : ''}
            </Text>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_6, gap: SPACE_3 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_4,
    paddingBottom: SPACE_4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...TYPE.heading, color: CREAM, fontSize: 20 },

  // Sections
  section: { paddingHorizontal: SPACE_5, paddingTop: SPACE_5 },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 1.8,
    color: GOLD,
    fontWeight: '600',
    marginBottom: SPACE_3,
    textTransform: 'uppercase',
  },

  // Items card
  itemsCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    padding: SPACE_3,
  },
  itemRow: { flexDirection: 'row', gap: SPACE_3, paddingVertical: SPACE_3, alignItems: 'flex-start' },
  itemRowDivider: { borderTopWidth: 1, borderTopColor: BORDER_SUBTLE },
  thumbWrap: { width: 48, height: 48 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: SURFACE_RAISED },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, gap: 2 },
  itemName: { ...TYPE.body, color: INK, fontWeight: '600' },
  itemVendor: { ...TYPE.caption, color: INK_SECONDARY },
  itemPriceCol: { alignItems: 'flex-end', gap: 2 },
  itemQty: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: INK_FAINT,
    fontVariant: ['tabular-nums'],
  },
  itemTotal: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: GOLD,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  subtotalDivider: {
    height: 1,
    backgroundColor: BORDER_SUBTLE,
    marginTop: SPACE_3,
    marginBottom: SPACE_3,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_2,
  },
  subtotalLabel: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    letterSpacing: 1.4,
    color: INK_SECONDARY,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  subtotalValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    color: GOLD,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },

  // Input
  inputLabel: { ...TYPE.caption, color: INK_SECONDARY, marginBottom: 6 },
  input: {
    height: 52,
    borderRadius: 14,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_4,
    fontFamily: TYPE.body.fontFamily,
    fontSize: 15,
    color: INK,
  },
  inputFocused: { borderColor: BORDER_FOCUS },
  inputError: { borderColor: ERROR },
  errorCaption: { ...TYPE.caption, color: ERROR_TEXT, marginTop: 6 },
  helpCaption: { ...TYPE.caption, color: INK_FAINT, marginTop: 6 },

  // Deferred note
  noteCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    padding: SPACE_4,
    gap: SPACE_2,
  },
  noteTitle: { ...TYPE.bodyEmphasis, color: CREAM },
  noteBody: { ...TYPE.caption, color: INK_SECONDARY, lineHeight: 18 },

  // Pay bar
  payBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SURFACE_DEEP,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
  },
  payBtn: {
    height: 52,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.1 },

  // Empty
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE_2,
  },
  emptyTitle: { ...TYPE.heading, color: CREAM, textAlign: 'center' },
  emptyBody: { ...TYPE.body, color: INK_FAINT, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: SPACE_6,
    paddingVertical: SPACE_3,
    borderRadius: RADIUS_MD,
    marginTop: SPACE_3,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.1 },
});
