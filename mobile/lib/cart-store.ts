/**
 * Cart store — mirrors web/src/lib/cart.ts EXACTLY.
 *
 * Two stores:
 *  - useCartStore       — items state + add/remove/update/clear/totals.
 *  - useCartDrawerStore — drawer open/close (separate so cheap re-renders).
 *
 * Persistence key MUST stay 'iseyaa-cart-v1' to match web for future
 * cross-device sync. The only platform delta vs. web is the storage backend:
 * AsyncStorage in place of localStorage (RN has no SSR/window fallback).
 *
 * Drawer methods are openDrawer/closeDrawer/toggleDrawer (NOT open/close/toggle)
 * to match web consumers verbatim.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  vendorName: string;
  quantity: number;
};

type MinimalProduct = {
  id: string;
  name: string;
  price: number | string;
  imageUrls?: string[];
  vendor?: { businessName?: string | null } | null;
};

type CartState = {
  items: CartItem[];
  addItem: (product: MinimalProduct, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  clear: () => void;
  totalCount: () => number;
  totalPrice: () => number;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, qty = 1) => {
        const id = product.id;
        const price = Number(product.price ?? 0);
        const imageUrl = product.imageUrls?.[0] ?? null;
        const vendorName = product.vendor?.businessName ?? 'Iseyaa Vendor';
        const safeQty = Math.max(1, Math.floor(qty));

        set((state) => {
          const existing = state.items.find((i) => i.productId === id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === id ? { ...i, quantity: i.quantity + safeQty } : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                productId: id,
                name: product.name,
                price,
                imageUrl,
                vendorName,
                quantity: safeQty,
              },
            ],
          };
        });
      },

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      updateQty: (productId, qty) => {
        if (qty < 1) {
          set((state) => ({ items: state.items.filter((i) => i.productId !== productId) }));
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity: Math.floor(qty) } : i,
          ),
        }));
      },

      clear: () => set({ items: [] }),

      totalCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalPrice: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: 'iseyaa-cart-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

/** Sliding drawer open/close state — separate so unrelated re-renders are cheap. */
type CartDrawerState = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

export const useCartDrawerStore = create<CartDrawerState>((set) => ({
  open: false,
  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set((s) => ({ open: !s.open })),
}));
