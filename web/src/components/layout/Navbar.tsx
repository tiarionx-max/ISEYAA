'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map, Calendar, Home, ShoppingBag, Music, LayoutDashboard, LogOut, Menu, X,
  ChevronDown, Shield, Sparkles, RefreshCw, ShoppingCart, HelpCircle, FileText,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { api, fetcher } from '@/lib/api';
import { toast } from 'sonner';
import { useCartStore, useCartDrawerStore } from '@/lib/cart';

const NAV_ITEMS = [
  { href: '/', label: 'Explore', icon: Map },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/stays', label: 'Stays', icon: Home },
  { href: '/marketplace', label: 'Market', icon: ShoppingBag },
  { href: '/studio', label: 'Studio', icon: Music },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartMounted, setCartMounted] = useState(false);
  const cartCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));
  const openCart = useCartDrawerStore((s) => s.openDrawer);

  // Cart count is read from localStorage on client only — wait for hydration so SSR/CSR match
  useEffect(() => { setCartMounted(true); }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Pull /users/me to learn registeredRoles — session only carries the active role
  const { data: me } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
    enabled: !!session,
    staleTime: 30_000,
  });

  const sessionRole = (session as any)?.user?.role as string | undefined;
  const activeRole: string = me?.role ?? sessionRole ?? 'CITIZEN';
  const registeredRoles: string[] = me?.registeredRoles ?? [];
  const hasHost = registeredRoles.includes('HOST');
  const hasCitizen = registeredRoles.includes('CITIZEN');
  const canSwitch = hasHost && hasCitizen;
  const isAdmin = activeRole === 'SUPER_ADMIN' || activeRole === 'LGA_ADMIN';
  const firstName = session?.user?.name?.split(' ')[0] ?? 'Account';
  const initials =
    session?.user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  const switchRole = useMutation({
    mutationFn: (role: 'HOST' | 'CITIZEN') =>
      api.patch('/users/me/role', { role }).then((r) => r.data),
    onSuccess: (_data, role) => {
      toast.success(role === 'HOST' ? 'Switched to host' : 'Switched to traveler');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setUserMenuOpen(false);
      router.refresh();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Could not switch role');
    },
  });

  return (
    <nav
      className={clsx(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-jungle/90 backdrop-blur-xl border-b border-white/8 shadow-[0_4px_30px_rgba(0,0,0,0.4)]'
          : 'bg-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/logo-icon.png"
            alt="Iṣẹ́yáá"
            width={36}
            height={36}
            priority
            className="w-9 h-9 rounded-lg shadow-[0_0_12px_rgba(26,107,60,0.4)]"
          />
          <span className="text-white text-xl font-black tracking-tight">Iṣẹ́yáá</span>
          <span className="hidden sm:inline text-white/30 text-xs font-medium">· Ogun State</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                  active
                    ? 'text-white'
                    : 'text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.35)]',
                )}
              >
                <Icon size={14} />
                {label}
                {active && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl bg-forest/70 border border-forest/40 -z-10"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-2">
          {/* Help & Terms — always visible (logged-in or not) */}
          <Link
            href="/help"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.35)] transition-all"
          >
            <HelpCircle size={13} />
            Help
          </Link>
          <Link
            href="/terms"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.35)] transition-all"
          >
            <FileText size={13} />
            Terms
          </Link>

          {/* Cart icon — always visible (logged-in or not) */}
          <button
            onClick={openCart}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-[rgba(0,0,0,0.35)] border border-white/10 text-white/75 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Open cart"
          >
            <ShoppingCart size={15} />
            {cartMounted && cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-jungle text-[10px] font-black flex items-center justify-center border-2 border-jungle">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>

          {/* "Become a host" entry point — visible to everyone who can't switch */}
          {!canSwitch && (
            <Link
              href="/host"
              className="hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white/75 hover:text-white hover:bg-[rgba(0,0,0,0.35)] transition-all"
            >
              <Sparkles size={13} className="text-gold" />
              Become a host
            </Link>
          )}

          {session ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[rgba(0,0,0,0.35)] border border-white/10 hover:bg-white/10 transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-forest-gradient flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <span className="text-sm text-white/80 font-medium">{firstName}</span>
                {canSwitch && (
                  <span
                    className={clsx(
                      'text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md',
                      activeRole === 'HOST'
                        ? 'bg-gold/20 text-gold border border-gold/30'
                        : 'bg-forest/25 text-forest-light border border-forest/30',
                    )}
                  >
                    {activeRole === 'HOST' ? 'Host' : 'Traveler'}
                  </span>
                )}
                <ChevronDown size={13} className={clsx('text-white/40 transition-transform', userMenuOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-60 rounded-2xl bg-jungle-2/98 backdrop-blur-xl border border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.65)] overflow-hidden"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="p-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-[rgba(0,0,0,0.45)] transition-colors"
                      >
                        <LayoutDashboard size={14} className="text-gold" />
                        Dashboard
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-[rgba(0,0,0,0.45)] transition-colors"
                        >
                          <Shield size={14} className="text-gold" />
                          Admin Panel
                        </Link>
                      )}
                    </div>

                    {/* Role section */}
                    <div className="border-t border-white/8 p-1">
                      {canSwitch ? (
                        <button
                          onClick={() =>
                            switchRole.mutate(activeRole === 'HOST' ? 'CITIZEN' : 'HOST')
                          }
                          disabled={switchRole.isPending}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-[rgba(0,0,0,0.45)] transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={14} className="text-gold" />
                          {switchRole.isPending
                            ? 'Switching…'
                            : activeRole === 'HOST'
                              ? 'Switch to traveler'
                              : 'Switch to host'}
                        </button>
                      ) : (
                        <Link
                          href="/host"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-[rgba(0,0,0,0.45)] transition-colors"
                        >
                          <Sparkles size={14} className="text-gold" />
                          Become a host
                        </Link>
                      )}
                    </div>

                    <div className="border-t border-white/8 p-1">
                      <button
                        onClick={() => signOut()}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut size={14} />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <Link
                href="/host"
                className="hidden lg:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white/75 hover:text-white hover:bg-[rgba(0,0,0,0.35)] transition-all"
              >
                <Sparkles size={13} className="text-gold" />
                Become a host
              </Link>
              <Link
                href="/login"
                className="px-5 py-2 btn-forest text-white text-sm font-semibold rounded-xl"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        {/* Mobile right-side buttons */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={openCart}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-[rgba(0,0,0,0.35)] border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Open cart"
          >
            <ShoppingCart size={16} />
            {cartMounted && cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-jungle text-[10px] font-black flex items-center justify-center border-2 border-jungle">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[rgba(0,0,0,0.35)] text-white/70 hover:text-white hover:bg-white/10 transition-all"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-jungle/98 backdrop-blur-xl border-t border-white/8"
          >
            <div className="px-4 py-3 space-y-0.5">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                    pathname === href
                      ? 'bg-forest/70 text-white border border-forest/40'
                      : 'text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.35)]',
                  )}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}

              {/* Host entry */}
              {canSwitch ? (
                <button
                  onClick={() => {
                    switchRole.mutate(activeRole === 'HOST' ? 'CITIZEN' : 'HOST');
                    setMobileOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-[rgba(0,0,0,0.35)]"
                >
                  <RefreshCw size={16} className="text-gold" />
                  {activeRole === 'HOST' ? 'Switch to traveler' : 'Switch to host'}
                </button>
              ) : (
                <Link
                  href="/host"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-[rgba(0,0,0,0.35)]"
                >
                  <Sparkles size={16} className="text-gold" />
                  Become a host
                </Link>
              )}

              <div className="pt-2 border-t border-white/8 mt-2">
                {session ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-[rgba(0,0,0,0.35)]"
                    >
                      <LayoutDashboard size={16} /> Dashboard
                    </Link>
                    <button
                      onClick={() => signOut()}
                      className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-red-400"
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-3 text-sm text-gold font-semibold"
                  >
                    Sign in →
                  </Link>
                )}
              </div>

              <div className="pt-2 border-t border-white/8 mt-2">
                <Link
                  href="/help"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.35)]"
                >
                  <HelpCircle size={16} /> Help
                </Link>
                <Link
                  href="/terms"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-white/60 hover:text-white hover:bg-[rgba(0,0,0,0.35)]"
                >
                  <FileText size={16} /> Terms
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
