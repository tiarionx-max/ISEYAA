/**
 * Vendor Dashboard — quick task 260727-d6v
 *
 * Product grid dashboard for an ACTIVE vendor: GET /products/mine (all products,
 * including inactive/paused ones — this is the one view where paused products
 * should ever appear), 2-column cards, Add product CTA, per-product Edit/Delete,
 * and an Orders link into vendor-orders.tsx.
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Plus, Pencil, Trash2, ClipboardList, PauseCircle } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
import { PressableScale } from '../components/ui/PressableScale';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_SUBTLE,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  CARD_COLORS,
  TYPE,
  FONT_MONO,
  FONT_UI,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../lib/tokens';

// ── Types ────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  stock: number;
  imageUrls?: string[];
  isActive: boolean;
}

// ── Helpers ──────────────────────────────────────────

function fmtNaira(n: number | string | null | undefined): string {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

// ── Product card ─────────────────────────────────────

function ProductCard({
  item,
  index,
  onDelete,
}: {
  item: Product;
  index: number;
  onDelete: (id: string) => void;
}) {
  const cover = item.imageUrls?.[0] ?? null;
  const fallback = CARD_COLORS[index % CARD_COLORS.length];
  const paused = item.isActive === false;
  const outOfStock = (item.stock ?? 0) <= 0;

  return (
    <View style={[styles.card, paused && styles.cardPaused]}>
      <View style={styles.hero}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={fallback}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        {paused ? (
          <View style={StyleSheet.absoluteFillObject}>
            <View style={styles.pausedScrim} pointerEvents="none" />
            <View style={styles.pausedBadge}>
              <PauseCircle size={12} color={CREAM} />
              <Text style={styles.pausedBadgeText}>Paused</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.name}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{fmtNaira(item.price)}</Text>
          {item.compareAtPrice ? (
            <Text style={styles.compareAtPrice}>{fmtNaira(item.compareAtPrice)}</Text>
          ) : null}
        </View>

        <Text style={[styles.stockText, outOfStock && styles.stockTextOut]}>
          {outOfStock ? 'Out of stock' : `${item.stock} in stock`}
        </Text>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => router.push(`/product-edit/${item.id}` as never)}
            style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
          >
            <Pencil size={13} color={GOLD} />
            <Text style={styles.actionBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(item.id)}
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnDestructive, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Trash2 size={13} color={DESTRUCTIVE} />
            <Text style={[styles.actionBtnText, { color: DESTRUCTIVE }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────

export default function VendorDashboardScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<Product[]>({
    queryKey: ['my-products'],
    queryFn: () => fetcher('/products/mine'),
  });

  const products = data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
    },
    onError: (err) => {
      Alert.alert('Could not delete product', getErrorMessage(err, 'Please try again.'));
    },
  });

  const handleDelete = (id: string) => {
    Alert.alert('Delete product?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>My Products</Text>
          <Text style={styles.headerSub}>
            {products.length} product{products.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/vendor-orders' as never)}
            style={({ pressed }) => [styles.ordersBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="View orders"
          >
            <ClipboardList size={16} color={GOLD} />
            <Text style={styles.ordersBtnText}>Orders</Text>
          </Pressable>
          <PressableScale
            onPress={() => router.push('/product-create' as never)}
            style={styles.addBtn}
            hapticStyle="medium"
          >
            <Plus size={16} color={SURFACE_DEEP} />
            <Text style={styles.addBtnText}>Add product</Text>
          </PressableScale>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            Could not load your products. Pull to refresh or try again shortly.
          </Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.emptyText}>
            Add your first product to start selling through Iṣẹ́yáá.
          </Text>
          <PressableScale
            onPress={() => router.push('/product-create' as never)}
            style={styles.emptyCta}
            hapticStyle="medium"
          >
            <Text style={styles.emptyCtaText}>Add your first product</Text>
          </PressableScale>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: SPACE_3 }}
          renderItem={({ item, index }) => (
            <View style={styles.gridItem}>
              <ProductCard item={item} index={index} onDelete={handleDelete} />
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: SPACE_3 }} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_MID },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
    paddingBottom: SPACE_3,
    gap: SPACE_3,
  },
  headerTextBlock: { flex: 1 },
  headerTitle: { ...TYPE.heading, fontSize: 20, color: INK },
  headerSub: { ...TYPE.caption, color: INK_MID, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE_2 },

  ordersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACE_3,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  ordersBtnText: { fontFamily: FONT_UI, fontSize: 12.5, fontWeight: '700', color: GOLD },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: SPACE_4,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD,
  },
  addBtnText: { fontFamily: FONT_UI, fontSize: 13, fontWeight: '700', color: SURFACE_DEEP },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_5 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE_5,
    gap: SPACE_3,
  },
  emptyTitle: { ...TYPE.bodyEmphasis, fontSize: 16, color: INK },
  emptyText: { ...TYPE.body, color: INK_MID, textAlign: 'center' },
  emptyCta: {
    marginTop: SPACE_3,
    minHeight: 48,
    paddingHorizontal: SPACE_5,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: { fontFamily: FONT_UI, fontSize: 14, fontWeight: '700', color: SURFACE_DEEP },

  listContent: { paddingHorizontal: SPACE_5, paddingTop: SPACE_2, paddingBottom: 60 },
  gridItem: { flex: 1 },

  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardPaused: { opacity: 0.85 },

  hero: { height: 110, width: '100%', position: 'relative' },
  pausedScrim: { backgroundColor: 'rgba(5,14,14,0.55)' },
  pausedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
  },
  pausedBadgeText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700',
    color: CREAM,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  body: { padding: SPACE_3, gap: 4 },
  title: { fontFamily: FONT_UI, fontSize: 13.5, fontWeight: '700', color: INK },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontFamily: FONT_UI, fontSize: 14, fontWeight: '700', color: GOLD },
  compareAtPrice: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: INK_FAINT,
    textDecorationLine: 'line-through',
  },
  stockText: { fontFamily: FONT_UI, fontSize: 11, color: INK_MID },
  stockTextOut: { color: DESTRUCTIVE },

  actionsRow: { flexDirection: 'row', gap: SPACE_2, marginTop: SPACE_3 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    minHeight: 36,
    paddingHorizontal: SPACE_2,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  actionBtnDestructive: { backgroundColor: DESTRUCTIVE_DIM, borderColor: DESTRUCTIVE },
  actionBtnText: { fontFamily: FONT_UI, fontSize: 11.5, fontWeight: '700', color: GOLD },
});
