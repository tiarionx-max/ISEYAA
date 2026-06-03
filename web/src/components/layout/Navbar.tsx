'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, Calendar, Home, ShoppingBag, Music, LayoutDashboard, LogOut, Menu, X, ChevronDown, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/', label: 'Explore', icon: Map },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/stays', label: 'Stays', icon: Home },
  { href: '/marketplace', label: 'Market', icon: ShoppingBag },
  { href: '/studio', label: 'Studio', icon: Music },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isAdmin = (session as any)?.user?.role === 'SUPER_ADMIN' || (session as any)?.user?.role === 'LGA_ADMIN';
  const firstName = session?.user?.name?.split(' ')[0] ?? 'Account';
  const initials = session?.user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?';

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
                    : 'text-white/60 hover:text-white hover:bg-white/6',
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
          {session ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/6 border border-white/10 hover:bg-white/10 transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-forest-gradient flex items-center justify-center text-xs font-bold text-white">
                  {initials}
                </div>
                <span className="text-sm text-white/80 font-medium">{firstName}</span>
                <ChevronDown size={13} className={clsx('text-white/40 transition-transform', userMenuOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-48 rounded-2xl glass border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden"
                    onMouseLeave={() => setUserMenuOpen(false)}
                  >
                    <div className="p-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/8 transition-colors"
                      >
                        <LayoutDashboard size={14} className="text-gold" />
                        Dashboard
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/8 transition-colors"
                        >
                          <Shield size={14} className="text-gold" />
                          Admin Panel
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
            <Link
              href="/login"
              className="px-5 py-2 btn-forest text-white text-sm font-semibold rounded-xl"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-white/6 text-white/70 hover:text-white hover:bg-white/10 transition-all"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
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
                      : 'text-white/60 hover:text-white hover:bg-white/6',
                  )}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
              <div className="pt-2 border-t border-white/8 mt-2">
                {session ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/6"
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
