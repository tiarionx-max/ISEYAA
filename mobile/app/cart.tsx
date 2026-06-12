/**
 * Cart Drawer Modal — /cart
 *
 * Phase 8 / Plan 08-06 (Wave 3).
 *
 * Right-aligned drawer (~85% width) over a darkened backdrop. Tapping the
 * backdrop or pressing the close icon routes back. Drawer slides in from the
 * right on mount via react-native-reanimated.
 *
 * Routing: Stack screen `cart` is registered by 08-04b in `_layout.tsx` with
 * `presentation: 'transparentModal', animation: 'none'`. This file does NOT
 * touch _layout (disjoint ownership — H-4).
 *
 * Cart store contract: items / removeItem / updateQty / totalPrice / totalCount
 * are read directly from `useCartStore`. Subtotal is computed by the store
 * (H-5) — we do NOT sum inline.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  Dimensions,
  StatusBar,
  ListRenderItem,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react-native';

import { useCartStore, CartItem } from '../lib/cart-store';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.round(SCREEN_WIDTH * 0.85);
const BACKDROP_COLOR = 'rgba(0,0,0,0.55)';

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function CartDrawer(): JSX.Element {
  const insets = useSafeAreaInsets();
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQty = useCartStore((s) => s.updateQty);

  // Reanimated slide-in
  const tx = useSharedValue(DRAWER_WIDTH);
  const opacity = useSharedValue(0);

  useEffect(() => {
    tx.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 220 });
  }, [tx, opacity]);

  const handleClose = (): void => {
    // Slide back out, then router.back() on completion via runOnJS.
    opacity.value = withTiming(0, { duration: 180 });
    tx.value = withTiming(
      DRAWER_WIDTH,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(router.back)();
      },
    );
  };

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Use store-derived totals (H-5 — do NOT re-implement inline)
  const totalCount = useCartStore.getState().totalCount();
  const subtotal = useCartStore.getState().totalPrice();

  const handleCheckout = (): void => {
    if (items.length === 0) return;
    // replace not push — drawer should not stay in stack when checkout opens
    router.replace('/checkout');
  };

  const renderItem: ListRenderItem<CartItem> = ({ item }) => (
    <View style={styles.row}>
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
            <ShoppingBag size={18} color={INK_FAINT} />
          </View>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rowVendor} numberOfLines={1}>
          {item.vendorName}
        </Text>
        <View style={styles.rowFootRow}>
          <Text style={styles.rowPrice}>
            ₦{(item.price * item.quantity).toLocaleString()}
          </Text>
          <View style={styles.qtyStepper}>
            <PressableScale
              onPress={() => updateQty(item.productId, item.quantity - 1)}
              style={styles.qtyBtn}
              hapticStyle="light"
            >
              <Minus size={14} color={INK} strokeWidth={2.2} />
            </PressableScale>
            <Text style={styles.qtyNum}>{item.quantity}</Text>
            <PressableScale
              onPress={() => updateQty(item.productId, item.quantity + 1)}
              style={styles.qtyBtn}
              hapticStyle="light"
            >
              <Plus size={14} color={INK} strokeWidth={2.2} />
            </PressableScale>
          </View>
        </View>
      </View>
      <PressableScale
        onPress={() => removeItem(item.productId)}
        style={styles.removeBtn}
        hapticStyle="medium"
      >
        <Trash2 size={16} color={INK_FAINT} strokeWidth={2} />
      </PressableScale>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Backdrop — Pressable closes; Animated.View fades it in */}
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]} />
      <Pressable
        style={[StyleSheet.absoluteFillObject, { width: SCREEN_WIDTH - DRAWER_WIDTH }]}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Close cart"
      />

      {/* Drawer panel (right-aligned, slides in) */}
      <Animated.View
        style={[
          styles.drawer,
          { paddingTop: insets.top + SPACE_3 },
          drawerStyle,
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Cart</Text>
          <PressableScale onPress={handleClose} style={styles.closeBtn} hapticStyle="light">
            <X size={20} color={INK} strokeWidth={2} />
          </PressableScale>
        </View>

        {/* Body */}
        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <ShoppingBag size={28} color={INK_FAINT} />
            </View>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyBody}>
              Add products from the marketplace to get started.
            </Text>
            <PressableScale
              onPress={handleClose}
              style={styles.emptyBtn}
              hapticStyle="medium"
            >
              <Text style={styles.emptyBtnText}>Browse products</Text>
            </PressableScale>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.productId}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Footer (sticky bottom) */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACE_4) }]}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalValue}>
              ₦{subtotal.toLocaleString()}
            </Text>
          </View>
          <PressableScale
            onPress={handleCheckout}
            disabled={items.length === 0}
            style={[
              styles.checkoutBtn,
              items.length === 0 && styles.checkoutBtnDisabled,
            ]}
            hapticStyle="medium"
          >
            <Text style={styles.checkoutBtnText}>
              {items.length === 0
                ? 'Cart is empty'
                : `Checkout (${totalCount} item${totalCount === 1 ? '' : 's'})`}
            </Text>
          </PressableScale>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },

  backdrop: { backgroundColor: BACKDROP_COLOR },

  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: SURFACE_MID,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 24,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_5,
    paddingBottom: SPACE_4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  headerTitle: {
    ...TYPE.heading,
    color: CREAM,
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List
  listContent: { paddingHorizontal: SPACE_4, paddingTop: SPACE_4, paddingBottom: SPACE_4 },
  sep: { height: 1, backgroundColor: BORDER_SUBTLE, marginVertical: SPACE_3 },

  row: {
    flexDirection: 'row',
    gap: SPACE_3,
    alignItems: 'flex-start',
  },
  thumbWrap: { width: 60, height: 60 },
  thumb: { width: 60, height: 60, borderRadius: RADIUS_MD, backgroundColor: SURFACE_RAISED },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  rowBody: { flex: 1, gap: 2 },
  rowName: { ...TYPE.body, color: INK, fontWeight: '600' },
  rowVendor: { ...TYPE.caption, color: INK_SECONDARY },

  rowFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE_2,
  },
  rowPrice: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: GOLD,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_2,
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 4,
  },
  qtyBtn: { width: 44, height: 32, alignItems: 'center', justifyContent: 'center' },
  qtyNum: {
    ...TYPE.bodyEmphasis,
    fontFamily: FONT_MONO,
    color: INK,
    minWidth: 18,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  removeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE_5,
    gap: SPACE_3,
  },
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
  emptyTitle: { ...TYPE.heading, color: CREAM, textAlign: 'center', fontSize: 20 },
  emptyBody: {
    ...TYPE.body,
    color: INK_FAINT,
    textAlign: 'center',
    marginBottom: SPACE_3,
  },
  emptyBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: SPACE_6,
    paddingVertical: SPACE_3,
    borderRadius: RADIUS_MD,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.1 },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
    gap: SPACE_3,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  subtotalLabel: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 1.8,
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
  checkoutBtn: {
    height: 52,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutBtnDisabled: { backgroundColor: SURFACE_RAISED, opacity: 0.7 },
  checkoutBtnText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.1 },
});
