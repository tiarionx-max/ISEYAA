'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import { ShoppingBag, MapPin, ShoppingCart, ArrowRight, Search, Tag, Package } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import Image from 'next/image';
import { useState } from 'react';

const CATEGORIES = ['All', 'Food', 'Crafts', 'Fashion', 'Art', 'Technology', 'Agriculture'];

function ProductSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden glass border border-white/6">
      <div className="h-44 skeleton" />
      <div className="p-4 space-y-2">
        <div className="h-3.5 skeleton rounded-lg w-3/4" />
        <div className="h-3 skeleton rounded-lg w-1/2" />
        <div className="h-8 skeleton rounded-xl mt-3" />
      </div>
    </div>
  );
}

function ProductCard({ product, index }: { product: any; index: number }) {
  const { data: session } = useSession();

  const order = useMutation({
    mutationFn: () =>
      api.post('/orders', {
        items: [{ productId: product.id, quantity: 1 }],
        email: session?.user?.email,
      }).then((r) => r.data),
    onSuccess: (data) => {
      if (data?.payment?.authorizationUrl) window.open(data.payment.authorizationUrl, '_blank');
      else toast.success('Order placed!');
    },
    onError: () => toast.error('Failed to place order.'),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group rounded-2xl overflow-hidden glass border border-white/8 hover:border-indigo-500/30 transition-all duration-300"
      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
    >
      <div className="relative h-44 overflow-hidden">
        {product.imageUrls?.[0] ? (
          <Image src={product.imageUrls[0]} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1535 0%, #0f0d1f 100%)' }}>
            <Package size={28} className="text-indigo-400/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {product.category && (
          <span className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-sm text-white/70 text-[10px] px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
            <Tag size={9} /> {product.category}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-bold text-white text-sm mb-0.5 line-clamp-1 group-hover:text-indigo-300 transition-colors">{product.name}</h3>
        <p className="text-white/40 text-[11px] mb-3 flex items-center gap-1">
          <MapPin size={9} /> {product.vendor?.businessName ?? 'Ogun State Vendor'}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-gold font-black text-base">₦{Number(product.price).toLocaleString()}</span>
          {session ? (
            <button
              onClick={() => order.mutate()}
              disabled={order.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 btn-forest text-white text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              <ShoppingCart size={11} />
              {order.isPending ? '...' : 'Order'}
            </button>
          ) : (
            <a href="/login" className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors">
              Sign in <ArrowRight size={11} />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-4 flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-indigo-900/20 border border-indigo-700/20 flex items-center justify-center">
          <ShoppingBag size={36} className="text-indigo-400/40" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center">
          <Tag size={11} className="text-gold" />
        </div>
      </div>
      <h3 className="text-white font-bold text-xl mb-2">No Products Yet</h3>
      <p className="text-white/40 text-sm max-w-xs leading-relaxed mb-6">
        Artisans, food vendors & handcraft sellers from Ogun State will appear here soon.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-indigo-400/80 hover:text-indigo-300 font-medium transition-colors"
      >
        Are you a vendor? Apply to sell <ArrowRight size={14} />
      </Link>
    </div>
  );
}

import Link from 'next/link';

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetcher('/products?limit=48'),
  });

  const products = (data ?? []).filter((p: any) => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || p.category?.toLowerCase() === category.toLowerCase();
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* Section banner */}
        <div className="relative pt-16 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #0d0a1f 0%, #1a1535 40%, #1C2B2B 100%)' }} />
          <div className="absolute inset-0 bg-adire opacity-35" />
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative max-w-6xl mx-auto px-4 py-12">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-900/40 border border-indigo-700/30 flex items-center justify-center">
                  <ShoppingBag size={20} className="text-indigo-300" />
                </div>
                <span className="text-indigo-300/70 text-xs font-semibold uppercase tracking-[0.15em]">Shop Local</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-2">Marketplace</h1>
              <p className="text-white/45 text-sm max-w-md">Artisans, local food & handcrafted goods from verified Ogun State vendors</p>
            </motion.div>
          </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 py-10">
          {/* Search + filters */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-3 mb-8"
          >
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/40 transition-colors"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    category === cat
                      ? 'bg-indigo-600/60 text-white border border-indigo-500/40'
                      : 'bg-white/5 text-white/50 border border-white/8 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </motion.div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((p: any, i: number) => <ProductCard key={p.id} product={p} index={i} />)}
              {products.length === 0 && <EmptyState />}
            </div>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
