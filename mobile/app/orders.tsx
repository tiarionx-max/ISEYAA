import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, PackageSearch } from 'lucide-react-native';
import { fetcher } from '../lib/api';
import {
  SURFACE_DEEP, SURFACE_MID, BORDER,
  GOLD, GOLD_DIM, CREAM, INK, INK_MID, INK_FAINT,
  FONT_DISPLAY, FONT_MONO, FONT_UI,
} from '../lib/tokens';

type OrderItem = { id: string; quantity: number; unitPrice: number; product?: { name?: string } };
type Order = { id: string; totalAmount: number; status: string; createdAt: string; orderItems: OrderItem[] };

function formatCurrency(n: number) {
  return `₦${Number(n).toLocaleString('en-NG')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function OrderRow({ order }: { order: Order }) {
  const itemSummary = order.orderItems
    .map((i) => `${i.quantity}× ${i.product?.name ?? 'Item'}`)
    .join(', ');
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.rowDate}>{formatDate(order.createdAt)}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{order.status}</Text>
        </View>
      </View>
      <Text style={styles.itemSummary} numberOfLines={2}>{itemSummary || 'Order'}</Text>
      <Text style={styles.rowTotal}>{formatCurrency(order.totalAmount)}</Text>
    </View>
  );
}

export default function OrdersScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => fetcher('/orders/mine'),
  });
  const orders: Order[] = data?.data ?? data ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button">
          <ChevronLeft size={18} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>My Orders</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={GOLD} /></View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <PackageSearch size={32} color={INK_FAINT} />
          <Text style={styles.emptyText}>No orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow order={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: SURFACE_MID,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: FONT_DISPLAY, fontSize: 20, color: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: INK_MID, fontSize: 13 },
  list: { padding: 20, gap: 10 },
  row: {
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 14, gap: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowDate: { fontFamily: FONT_MONO, fontSize: 10.5, color: INK_MID },
  statusPill: { backgroundColor: GOLD_DIM, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 9.5, fontWeight: '700', color: GOLD, letterSpacing: 0.4 },
  itemSummary: { fontSize: 13, color: INK },
  rowTotal: { fontFamily: FONT_UI, fontSize: 14, fontWeight: '700', color: GOLD },
});
