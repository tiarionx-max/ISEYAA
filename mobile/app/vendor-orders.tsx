/**
 * Vendor Orders — quick task 260727-d6v
 *
 * Order fulfillment list via GET /orders/vendor. Each order shows a reference,
 * date, status badge, line items, and total. Renders EXACTLY ONE status-appropriate
 * action button per order — never a generic status picker — since the backend
 * hardcodes allowedTransitions (PROCESSING→SHIPPED, SHIPPED→DELIVERED only).
 */

import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, PackageCheck } from 'lucide-react-native';

import { api, fetcher, getErrorMessage } from '../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_3,
  SPACE_4,
  SPACE_5,
} from '../lib/tokens';

// ── Types ────────────────────────────────────────────

type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number | string;
  subtotal: number | string;
  product?: { name?: string } | null;
}

interface VendorOrder {
  id: string;
  paystackRef?: string | null;
  status: OrderStatus;
  totalAmount: number | string;
  createdAt: string;
  orderItems: OrderItem[];
}

// ── Helpers ──────────────────────────────────────────

function fmtNaira(n: number | string | null | undefined): string {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortRef(order: VendorOrder): string {
  return order.paystackRef ?? `#${order.id.slice(0, 8).toUpperCase()}`;
}

// Duplicated across mutation screens per this codebase's small-pure-helper convention.
async function ensureVendorRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'VENDOR') {
    await api.patch('/users/me/role', { role: 'VENDOR' });
  }
}

// ── Order row ────────────────────────────────────────

function OrderRow({
  item,
  onAdvance,
  advancing,
}: {
  item: VendorOrder;
  onAdvance: (orderId: string, nextStatus: 'SHIPPED' | 'DELIVERED') => void;
  advancing: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.ref}>{shortRef(item)}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>

      <View style={styles.itemsList}>
        {item.orderItems.map((li) => (
          <View key={li.id} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {li.product?.name ?? 'Product'} × {li.quantity} @ {fmtNaira(li.unitPrice)}
            </Text>
            <Text style={styles.itemSubtotal}>{fmtNaira(li.subtotal)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{fmtNaira(item.totalAmount)}</Text>
      </View>

      {item.status === 'PROCESSING' ? (
        <Pressable
          onPress={() => onAdvance(item.id, 'SHIPPED')}
          disabled={advancing}
          style={({ pressed }) => [styles.actionBtn, (pressed || advancing) && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Mark as shipped"
        >
          <Truck size={15} color={SURFACE_DEEP} />
          <Text style={styles.actionBtnText}>Mark as Shipped</Text>
        </Pressable>
      ) : item.status === 'SHIPPED' ? (
        <Pressable
          onPress={() => onAdvance(item.id, 'DELIVERED')}
          disabled={advancing}
          style={({ pressed }) => [styles.actionBtn, (pressed || advancing) && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Mark as delivered"
        >
          <PackageCheck size={15} color={SURFACE_DEEP} />
          <Text style={styles.actionBtnText}>Mark as Delivered</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Screen ───────────────────────────────────────────

interface Me {
  role?: string;
}

export default function VendorOrdersScreen(): JSX.Element {
  const queryClient = useQueryClient();

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => fetcher('/users/me') });

  const { data, isLoading, isError } = useQuery<VendorOrder[]>({
    queryKey: ['vendor-orders'],
    queryFn: () => fetcher('/orders/vendor'),
  });

  const orders = data ?? [];

  const advanceMutation = useMutation({
    mutationFn: async ({ orderId, nextStatus }: { orderId: string; nextStatus: 'SHIPPED' | 'DELIVERED' }) => {
      await ensureVendorRole(me?.role);
      await api.patch(`/orders/${orderId}/status`, { status: nextStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
    },
    onError: (err) => {
      // A 400 here usually means the order's status changed between fetch and
      // mutation (another actor already advanced it) — refresh the stale card.
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
      Alert.alert('Could not update order', getErrorMessage(err, 'Please try again.'));
    },
  });

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Could not load orders. Please try again.</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyText}>Orders placed against your products will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <OrderRow
              item={item}
              advancing={advanceMutation.isPending}
              onAdvance={(orderId, nextStatus) => advanceMutation.mutate({ orderId, nextStatus })}
            />
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
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE_5, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: INK },
  emptyText: { fontSize: 13, color: INK_MID, textAlign: 'center' },

  listContent: { paddingHorizontal: SPACE_5, paddingTop: SPACE_4, paddingBottom: 60 },

  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: SPACE_4,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ref: { fontSize: 14, fontWeight: '700', color: INK },
  date: { fontSize: 12, color: INK_MID },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: GOLD,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  itemsList: { marginTop: 6, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE_3 },
  itemName: { flex: 1, fontSize: 12.5, color: INK_MID },
  itemSubtotal: { fontSize: 12.5, fontWeight: '600', color: INK },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  totalLabel: { fontSize: 12.5, color: INK_MID },
  totalAmount: { fontSize: 15, fontWeight: '700', color: INK },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    marginTop: SPACE_3,
  },
  actionBtnText: { fontSize: 13.5, fontWeight: '700', color: SURFACE_DEEP },
});

// Unused-token guard (kept for parity with sibling screens' import blocks)
void INK_FAINT;
