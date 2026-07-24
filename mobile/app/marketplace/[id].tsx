/**
 * Product Detail — /marketplace/[id]
 *
 * Phase 8 / Plan 08-06 (Wave 3).
 *
 * Renders the product gallery, qty stepper, Add to Cart + Buy Now,
 * and a Description / Shipping / Reviews tab strip.
 *
 * Routing: Stack screen `marketplace/[id]` is registered by 08-04b in
 * `mobile/app/_layout.tsx`. This file does NOT touch _layout (disjoint
 * ownership — H-4 from 08-06-PLAN.md).
 *
 * Cart contract: `addItem` is invoked with the Product object directly
 * (not a manually-built CartItem) — the store derives imageUrl/vendorName
 * internally (cart-store.ts:52-82). H-5 from the plan.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ChevronLeft, Heart, Minus, Plus } from 'lucide-react-native';

import { fetcher, getErrorMessage } from '../../lib/api';
import { useCartStore, useCartDrawerStore } from '../../lib/cart-store';
import { PressableScale } from '../../components/ui/PressableScale';
import { Chip } from '../../components/ui/Chip';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  GOLD_BORDER,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
  INK_DISABLED,
  BORDER,
  BORDER_SUBTLE,
  SUCCESS_TEXT,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
} from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────
type ProductVendor = { businessName?: string | null } | null;

type Product = {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  imageUrls?: string[];
  price: number | string;
  compareAtPrice?: number | string | null;
  category?: string | null;
  stock?: number;
  rating?: number | string | null;
  reviewCount?: number;
  vendor?: ProductVendor;
};

type TabKey = 'description' | 'shipping' | 'reviews';

// ── Overlay colors (only acceptable inline overlays per plan) ──────────────────
const OVERLAY_DARK = 'rgba(0,0,0,0.4)';
const OVERLAY_DARKER = 'rgba(0,0,0,0.55)';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function ProductDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(1);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('description');
  const [wishlisted, setWishlisted] = useState(false);

  const { data: product, isLoading, isError, error } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: () => fetcher(`/products/${id}`),
    enabled: !!id,
  });

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (isError || !product) {
    return (
      <View style={[styles.root, styles.centered, { paddingHorizontal: SPACE_6 }]}>
        <Text style={styles.errorTitle}>Product unavailable</Text>
        <Text style={styles.errorBody}>
          {getErrorMessage(error, 'We could not load this product. Please try again.')}
        </Text>
        <PressableScale onPress={() => router.back()} style={styles.errorBtn}>
          <Text style={styles.errorBtnText}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const images = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : [];
  const price = Number(product.price ?? 0);
  const compareAt =
    product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const hasDiscount = compareAt != null && compareAt > price;
  const discountPct = hasDiscount
    ? Math.round(((compareAt! - price) / compareAt!) * 100)
    : 0;
  const maxQty = Math.max(1, product.stock ?? 99);
  const vendorName = product.vendor?.businessName ?? 'Iseyaa Vendor';

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAddToCart = (): void => {
    useCartStore.getState().addItem(product, qty);
    useCartDrawerStore.getState().openDrawer();
    Alert.alert('Added to cart', `${qty} × ${product.name}`, [{ text: 'OK' }]);
  };

  const handleBuyNow = (): void => {
    useCartStore.getState().addItem(product, qty);
    router.push('/checkout');
  };

  const handleGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / SCREEN_WIDTH);
    if (idx !== galleryIndex) setGalleryIndex(idx);
  };

  const decQty = (): void => setQty((q) => Math.max(1, q - 1));
  const incQty = (): void => setQty((q) => Math.min(maxQty, q + 1));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Gallery */}
        <View style={styles.galleryWrap}>
          {images.length > 1 ? (
            <FlatList
              data={images}
              keyExtractor={(uri, idx) => `${uri}-${idx}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleGalleryScroll}
              scrollEventThrottle={32}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item }}
                  style={styles.galleryImage}
                  contentFit="cover"
                  transition={200}
                />
              )}
            />
          ) : (
            <Image
              source={images[0] ? { uri: images[0] } : undefined}
              style={styles.galleryImage}
              contentFit="cover"
              transition={200}
              placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            />
          )}

          {/* Back chevron — top-left overlay */}
          <PressableScale
            onPress={() => router.back()}
            style={[styles.galleryBtn, styles.galleryBtnLeft, { top: insets.top + SPACE_3 }]}
            hapticStyle="light"
          >
            <View style={styles.galleryBtnCircle}>
              <ChevronLeft size={22} color={INK} strokeWidth={2.2} />
            </View>
          </PressableScale>

          {/* Wishlist heart — top-right overlay */}
          <PressableScale
            onPress={() => setWishlisted((v) => !v)}
            style={[styles.galleryBtn, styles.galleryBtnRight, { top: insets.top + SPACE_3 }]}
            hapticStyle="light"
          >
            <View style={styles.galleryBtnCircle}>
              <Heart
                size={20}
                color={wishlisted ? GOLD : INK}
                fill={wishlisted ? GOLD : 'transparent'}
                strokeWidth={2}
              />
            </View>
          </PressableScale>

          {/* Page dots */}
          {images.length > 1 ? (
            <View style={styles.dotsRow}>
              {images.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    idx === galleryIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Title block */}
        <View style={styles.contentBlock}>
          <Text style={styles.vendorCaption}>{vendorName.toUpperCase()}</Text>
          <Text style={styles.productName}>{product.name}</Text>

          {/* Price row */}
          <View style={styles.priceRow}>
            <Text style={styles.priceGold}>
              ₦{price.toLocaleString()}
            </Text>
            {hasDiscount ? (
              <>
                <Text style={styles.priceStrike}>
                  ₦{compareAt!.toLocaleString()}
                </Text>
                <View style={styles.discountPill}>
                  <Text style={styles.discountPillText}>-{discountPct}%</Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Stock hint */}
          {product.stock != null ? (
            <Text style={styles.stockText}>
              {product.stock > 0
                ? `${product.stock} in stock`
                : 'Out of stock'}
            </Text>
          ) : null}

          {/* Qty stepper */}
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>QUANTITY</Text>
            <View style={styles.qtyStepper}>
              <PressableScale
                onPress={decQty}
                disabled={qty <= 1}
                style={[styles.qtyBtn, qty <= 1 && styles.qtyBtnDisabled]}
                hapticStyle="light"
              >
                <Minus size={18} color={qty <= 1 ? INK_DISABLED : INK} strokeWidth={2.2} />
              </PressableScale>
              <Text style={styles.qtyNum}>{qty}</Text>
              <PressableScale
                onPress={incQty}
                disabled={qty >= maxQty}
                style={[styles.qtyBtn, qty >= maxQty && styles.qtyBtnDisabled]}
                hapticStyle="light"
              >
                <Plus size={18} color={qty >= maxQty ? INK_DISABLED : INK} strokeWidth={2.2} />
              </PressableScale>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionsCol}>
            <PressableScale
              onPress={handleAddToCart}
              disabled={product.stock === 0}
              style={[
                styles.btnSecondary,
                product.stock === 0 && styles.btnDisabled,
              ]}
              hapticStyle="medium"
            >
              <Text style={styles.btnSecondaryText}>Add to cart</Text>
            </PressableScale>
            <PressableScale
              onPress={handleBuyNow}
              disabled={product.stock === 0}
              style={[
                styles.btnPrimary,
                product.stock === 0 && styles.btnDisabled,
              ]}
              hapticStyle="medium"
            >
              <Text style={styles.btnPrimaryText}>Buy now</Text>
            </PressableScale>
          </View>

          {/* Tabs */}
          <View style={styles.tabsRow}>
            <Chip
              label="Description"
              active={activeTab === 'description'}
              onPress={() => setActiveTab('description')}
            />
            <Chip
              label="Shipping"
              active={activeTab === 'shipping'}
              onPress={() => setActiveTab('shipping')}
            />
            <Chip
              label="Reviews"
              active={activeTab === 'reviews'}
              onPress={() => setActiveTab('reviews')}
            />
          </View>

          <View style={styles.tabPanel}>
            {activeTab === 'description' ? (
              <Text style={styles.tabBody}>
                {product.description ?? 'No description provided.'}
              </Text>
            ) : null}
            {activeTab === 'shipping' ? (
              <Text style={styles.tabBody}>
                Coming soon — shipping details will appear here once configured by the vendor.
              </Text>
            ) : null}
            {activeTab === 'reviews' ? (
              <View>
                <Text style={styles.tabBody}>
                  Coming soon — reviews are tracked under a separate phase (CONTEXT.md deferred).
                </Text>
                {product.rating != null ? (
                  <Text style={[styles.tabBody, { marginTop: SPACE_3, color: GOLD }]}>
                    ★ {Number(product.rating).toFixed(1)} ({product.reviewCount ?? 0})
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { alignItems: 'center', justifyContent: 'center' },

  errorTitle: { ...TYPE.heading, color: CREAM, textAlign: 'center', marginBottom: SPACE_3 },
  errorBody: { ...TYPE.body, color: INK_SECONDARY, textAlign: 'center', marginBottom: SPACE_5 },
  errorBtn: {
    backgroundColor: GOLD,
    borderRadius: RADIUS_MD,
    paddingHorizontal: SPACE_6,
    paddingVertical: SPACE_3,
  },
  errorBtnText: { color: SURFACE_DEEP, fontWeight: '700', fontSize: 15 },

  // Gallery
  galleryWrap: { width: SCREEN_WIDTH, aspectRatio: 1, backgroundColor: SURFACE_MID, position: 'relative' },
  galleryImage: { width: SCREEN_WIDTH, aspectRatio: 1 },

  galleryBtn: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  galleryBtnLeft: { left: SPACE_3 },
  galleryBtnRight: { right: SPACE_3 },
  galleryBtnCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: OVERLAY_DARK,
    alignItems: 'center', justifyContent: 'center',
  },

  dotsRow: {
    position: 'absolute', bottom: SPACE_4, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: OVERLAY_DARKER,
  },
  dotActive: { backgroundColor: GOLD, width: 18 },

  // Body block
  contentBlock: { paddingHorizontal: SPACE_5, paddingTop: SPACE_5 },
  vendorCaption: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 1.8,
    color: GOLD,
    fontWeight: '600',
    marginBottom: SPACE_2 - 4,
  },
  productName: {
    ...TYPE.heading,
    color: CREAM,
    marginBottom: SPACE_3,
  },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE_3, flexWrap: 'wrap' },
  priceGold: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    fontWeight: '700',
    color: GOLD,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  priceStrike: {
    ...TYPE.body,
    color: INK_FAINT,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  discountPill: {
    backgroundColor: GOLD_DIM,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  discountPillText: { ...TYPE.caption, color: GOLD, fontWeight: '700' },

  stockText: { ...TYPE.caption, color: SUCCESS_TEXT, marginTop: SPACE_2 - 2 },

  // Qty
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE_5,
    paddingVertical: SPACE_3,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
  },
  qtyLabel: { fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1.8, color: INK_SECONDARY, fontWeight: '600' },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_4,
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: SPACE_2,
  },
  qtyBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  qtyBtnDisabled: { opacity: 0.5 },
  qtyNum: {
    ...TYPE.bodyEmphasis,
    color: INK,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // Actions
  actionsCol: { gap: SPACE_3, marginTop: SPACE_5 },
  btnPrimary: {
    height: 52,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.1 },
  btnSecondary: {
    height: 52,
    borderRadius: RADIUS_MD,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 15, fontWeight: '700', color: GOLD, letterSpacing: 0.1 },
  btnDisabled: { opacity: 0.4 },

  // Tabs
  tabsRow: { flexDirection: 'row', gap: SPACE_2, marginTop: SPACE_6 },
  tabPanel: { marginTop: SPACE_4, paddingBottom: SPACE_5 },
  tabBody: { ...TYPE.body, color: INK_SECONDARY, lineHeight: 22 },
});
