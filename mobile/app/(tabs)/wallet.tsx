import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Svg, { G, Rect, Path, Circle } from 'react-native-svg';
import {
  Eye,
  EyeOff,
  Shield,
  ChevronRight,
  Clock,
  Plus,
  Send,
  ArrowUp,
  ArrowDown,
  CreditCard,
  QrCode,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Home,
  Ticket,
} from 'lucide-react-native';
import { fetcher } from '../../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  SURFACE_HIGH,
  FOREST,
  FOREST_LIGHT,
  FOREST_DEEP,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_MID,
  SUCCESS,
  SUCCESS_TEXT,
  SUCCESS_DIM,
  ERROR,
  ERROR_TEXT,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  RADIUS_SM,
  RADIUS_MD,
  RADIUS_LG,
  SPACE_1,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  FONT_DISPLAY,
  FONT_MONO,
  TYPE,
} from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WalletBalance {
  balance_ngn: number;
  escrow_balance_ngn: number;
  kyc_tier: number;
  daily_limit_ngn: number;
}

interface Transaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string | number;
  description: string | null;
  reference: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

interface LedgerResponse {
  data: Transaction[];
  meta: { cursor: string | null; hasNext: boolean; limit: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTxIcon(tx: Transaction) {
  const desc = (tx.description ?? '').toLowerCase();
  const meta = tx.metadata as Record<string, unknown> | null;
  const module = (meta?.module as string | undefined) ?? '';

  if (module === 'events' || desc.includes('ticket')) return Ticket;
  if (module === 'stays' || desc.includes('stay') || desc.includes('booking')) return Home;
  if (module === 'marketplace' || desc.includes('order')) return ShoppingBag;
  if (tx.type === 'CREDIT') return TrendingUp;
  return TrendingDown;
}

// ── Adire Ornament ─────────────────────────────────────────────────────────────

function AdireOrnament({ size = 80, color = GOLD, opacity = 0.25 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" opacity={opacity}>
      <G fill="none" stroke={color} strokeWidth={1}>
        <Rect x="6" y="6" width="68" height="68" />
        <Rect x="14" y="14" width="52" height="52" />
        <Rect x="22" y="22" width="36" height="36" />
        <Path d="M6 6 L74 74 M74 6 L6 74" />
        <Circle cx="40" cy="40" r="8" />
        <Circle cx="40" cy="40" r="14" />
      </G>
    </Svg>
  );
}

// ── Shimmer Skeleton ───────────────────────────────────────────────────────────

function SkeletonRow({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [SURFACE_RAISED, SURFACE_HIGH],
  });

  return (
    <View style={styles.txRow}>
      <Animated.View style={[styles.txIconBox, { backgroundColor: bg }]} />
      <View style={styles.txCenter}>
        <Animated.View style={[styles.skeletonTitle, { backgroundColor: bg }]} />
        <Animated.View style={[styles.skeletonDate, { backgroundColor: bg }]} />
      </View>
      <Animated.View style={[styles.skeletonAmount, { backgroundColor: bg }]} />
    </View>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────────

function SectionHeader({
  kicker,
  title,
  action,
  onAction,
}: {
  kicker: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionKicker}>{kicker}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const [revealed, setRevealed] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const balanceAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const txYRef = useRef(0);

  // Shimmer animation loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const { data: walletData, isLoading: walletLoading } = useQuery<WalletBalance>({
    queryKey: ['wallet'],
    queryFn: () => fetcher('/wallet/balance'),
  });

  const { data: txData, isLoading: txLoading } = useQuery<LedgerResponse>({
    queryKey: ['transactions'],
    queryFn: () => fetcher('/wallet/transactions?limit=20'),
  });

  const tier = walletData?.kyc_tier ?? 0;
  const balanceNgn = Number(walletData?.balance_ngn ?? 0);
  const transactions: Transaction[] = txData?.data ?? [];

  // Monthly in/out from real transactions
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyIn = transactions
    .filter(tx => tx.type === 'CREDIT' && new Date(tx.createdAt) >= monthStart)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const monthlyOut = transactions
    .filter(tx => tx.type === 'DEBIT' && new Date(tx.createdAt) >= monthStart)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  function formatShort(n: number): string {
    if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
    return `₦${Math.round(n)}`;
  }

  // Balance reveal animation: 0 → balanceNgn over 900ms cubic ease-out
  useEffect(() => {
    if (revealed && balanceNgn > 0) {
      balanceAnim.setValue(0);
      Animated.timing(balanceAnim, {
        toValue: balanceNgn,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else if (!revealed) {
      balanceAnim.setValue(0);
    }
  }, [revealed, balanceNgn]);

  function handleToggleReveal() {
    setRevealed((prev) => !prev);
  }

  function handleTopUp() {
    router.push('/topup' as any);
  }

  function handleSend() {
    router.push('/send' as any);
  }

  function handleWithdraw() {
    Alert.alert('Withdraw', 'Bank withdrawal coming soon.');
  }

  function handleHistory() {
    scrollRef.current?.scrollTo({ y: txYRef.current, animated: true });
  }

  function handleKycPress() {
    router.push('/kyc' as any);
  }

  function handleQrPress() {
    router.push('/qr-checkin' as any);
  }

  // KYC tier progress percentage
  const tierPercent = tier >= 3 ? 1 : tier === 2 ? 0.66 : tier === 1 ? 0.33 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerKicker}>WALLET</Text>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerDisplayText}>Your money,{' '}</Text>
              <Text style={styles.headerDisplayItalic}>your move.</Text>
            </View>
          </View>
          <Pressable
            style={styles.qrButton}
            onPress={handleQrPress}
            accessibilityLabel="Show QR code"
            accessibilityRole="button"
          >
            <QrCode size={18} color={INK} />
          </Pressable>
        </View>

        {/* ── Premium Balance Card ── */}
        <View style={styles.balanceCardOuter}>
          <LinearGradient
            colors={['#0E3F23', '#1A6B3C', '#050E0E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            {/* Adire ornament top-right */}
            <View style={styles.adireOrnament} pointerEvents="none">
              <AdireOrnament size={110} color={GOLD} opacity={0.25} />
            </View>

            {/* Top row: label + reveal button */}
            <View style={styles.balanceCardTopRow}>
              <Text style={styles.balanceCardLabel}>Total balance</Text>
              <Pressable
                style={styles.revealPill}
                onPress={handleToggleReveal}
                accessibilityLabel={revealed ? 'Hide balance' : 'Reveal balance'}
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {revealed ? (
                  <EyeOff size={13} color={CREAM} />
                ) : (
                  <Eye size={13} color={CREAM} />
                )}
                <Text style={styles.revealPillText}>{revealed ? 'Hide' : 'Reveal'}</Text>
              </Pressable>
            </View>

            {/* Balance amount */}
            <View style={styles.balanceAmountRow}>
              <Text style={styles.balanceCurrency}>NGN</Text>
              {revealed ? (
                <Animated.Text style={styles.balanceAmount}>
                  {balanceAnim.interpolate({
                    inputRange: [0, Math.max(balanceNgn, 1)],
                    outputRange: ['0.00', formatCurrency(balanceNgn)],
                    extrapolate: 'clamp',
                  }) as any}
                </Animated.Text>
              ) : (
                <Text style={[styles.balanceAmount, styles.balanceHidden]}>
                  ——,———.——
                </Text>
              )}
            </View>

            {/* Bottom divider row */}
            <View style={styles.balanceCardDivider} />
            <View style={styles.balanceCardBottomRow}>
              <Text style={styles.balanceBottomLabel}>This month</Text>
              <View style={styles.balanceFlowItem}>
                <ArrowDown size={12} color={SUCCESS_TEXT} />
                <Text style={styles.balanceFlowIn}>{formatShort(monthlyIn)} in</Text>
              </View>
              <View style={styles.balanceFlowItem}>
                <ArrowUp size={12} color={CREAM} />
                <Text style={styles.balanceFlowOut}>{formatShort(monthlyOut)} out</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.quickActionsGrid}>
          {[
            { label: 'Top Up', Icon: Plus, onPress: handleTopUp, a11y: 'Top Up wallet' },
            { label: 'Send', Icon: Send, onPress: handleSend, a11y: 'Send money' },
            { label: 'Withdraw', Icon: ArrowUp, onPress: handleWithdraw, a11y: 'Withdraw funds' },
            { label: 'History', Icon: Clock, onPress: handleHistory, a11y: 'Transaction history' },
          ].map(({ label, Icon, onPress, a11y }) => (
            <TouchableOpacity
              key={label}
              style={styles.quickActionCell}
              onPress={onPress}
              activeOpacity={0.75}
              accessibilityLabel={a11y}
              accessibilityRole="button"
            >
              <View style={styles.quickActionIconBox}>
                <Icon size={18} color={GOLD} />
              </View>
              <Text style={styles.quickActionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── KYC Progress Card ── */}
        <Pressable
          onPress={handleKycPress}
          accessibilityLabel="View KYC tier progress"
          accessibilityRole="button"
        >
          <LinearGradient
            colors={['rgba(212,168,67,0.10)', 'rgba(13,31,31,0.6)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.kycCard}
          >
            {/* Main row */}
            <View style={styles.kycMainRow}>
              <View style={styles.kycIconBox}>
                <Shield size={20} color={SURFACE_DEEP} />
              </View>
              <View style={styles.kycTextBlock}>
                <Text style={styles.kycTitle}>Unlock ₦1M daily limit</Text>
                <Text style={styles.kycSubtitle}>Verify your NIN to upgrade to Tier 3</Text>
              </View>
              <ChevronRight size={18} color={GOLD} />
            </View>

            {/* Progress bar */}
            <View style={styles.kycProgressTrack}>
              <LinearGradient
                colors={[FOREST_LIGHT, GOLD]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.kycProgressFill, { width: `${Math.round(tierPercent * 100)}%` }]}
              />
            </View>

            {/* Tier labels */}
            <View style={styles.kycTierLabels}>
              {[
                { label: 'TIER 1', state: tier >= 1 ? '✓' : '' },
                { label: 'TIER 2', state: tier >= 2 ? '✓' : '' },
                { label: 'TIER 3', state: tier >= 3 ? '✓' : '→' },
              ].map(({ label, state }, i) => {
                const isLast = i === 2;
                const isActive = (i === 0 && tier >= 1) || (i === 1 && tier >= 2) || (i === 2 && tier >= 3);
                return (
                  <Text
                    key={label}
                    style={[styles.kycTierLabel, (isLast || isActive) && styles.kycTierLabelGold]}
                  >
                    {label}{state ? ` ${state}` : ''}
                  </Text>
                );
              })}
            </View>
          </LinearGradient>
        </Pressable>

        {/* ── Transactions ── */}
        <View style={styles.txSection} onLayout={(e) => { txYRef.current = e.nativeEvent.layout.y; }}>
          <SectionHeader
            kicker="TRANSACTIONS"
            title="Recent"
            action="All"
            onAction={handleHistory}
          />

          <View style={styles.txCard}>
            {txLoading ? (
              // Shimmer skeletons
              <>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View key={i}>
                    <SkeletonRow shimmer={shimmerAnim} />
                    {i < 4 && <View style={styles.txSeparator} />}
                  </View>
                ))}
              </>
            ) : transactions.length === 0 ? (
              // Empty state
              <View style={styles.emptyState}>
                <CreditCard size={40} color={INK_FAINT} />
                <Text style={styles.emptyHeading}>No transactions yet</Text>
                <TouchableOpacity
                  style={styles.emptyTopUpBtn}
                  onPress={handleTopUp}
                  activeOpacity={0.8}
                  accessibilityLabel="Top Up wallet"
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyTopUpText}>Top Up</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // Transaction rows
              <FlatList
                data={transactions}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item: tx }) => {
                  const isCredit = tx.type === 'CREDIT';
                  const amount = Number(tx.amount);
                  const TxIcon = getTxIcon(tx);
                  const isPending = tx.status?.toLowerCase() === 'pending';

                  return (
                    <View
                      style={styles.txRow}
                      accessibilityRole="text"
                      accessibilityLabel={`${isCredit ? 'Credit' : 'Debit'} ₦${formatCurrency(amount)}, ${tx.description ?? tx.reference}, ${formatDate(tx.createdAt)}`}
                    >
                      {/* Icon box */}
                      <View
                        style={[
                          styles.txIconBox,
                          isCredit ? styles.txIconBoxCredit : styles.txIconBoxDebit,
                        ]}
                      >
                        <TxIcon
                          size={16}
                          color={isCredit ? SUCCESS_TEXT : GOLD}
                        />
                      </View>

                      {/* Center */}
                      <View style={styles.txCenter}>
                        <Text style={styles.txTitle} numberOfLines={1}>
                          {tx.description ?? tx.reference}
                        </Text>
                        <View style={styles.txMetaRow}>
                          <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                          {isPending && (
                            <View style={styles.txStatusChip}>
                              <Text style={styles.txStatusText}>PENDING</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Amount */}
                      <Text
                        style={[
                          styles.txAmount,
                          isCredit ? styles.txAmountCredit : styles.txAmountDebit,
                        ]}
                      >
                        {isCredit ? '+' : '-'}₦{formatCurrency(amount)}
                      </Text>
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.txSeparator} />}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_MID,
  },
  scrollContent: {
    paddingBottom: 120,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_5,
    paddingTop: SPACE_4,
    paddingBottom: SPACE_3,
  },
  headerLeft: {
    flex: 1,
    gap: SPACE_1,
  },
  headerKicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: GOLD,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  headerTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    marginTop: 2,
  },
  headerDisplayText: {
    fontFamily: FONT_DISPLAY,
    fontSize: 34,
    fontWeight: '400',
    color: INK,
    lineHeight: 40,
  },
  headerDisplayItalic: {
    fontFamily: FONT_DISPLAY,
    fontSize: 34,
    fontWeight: '400',
    fontStyle: 'italic',
    color: GOLD,
    lineHeight: 40,
  },
  qrButton: {
    width: 40,
    height: 40,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: RADIUS_SM,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_3,
  },

  // ── Balance Card ──
  balanceCardOuter: {
    marginHorizontal: SPACE_5,
    marginTop: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.2)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  balanceCard: {
    borderRadius: 22,
    paddingTop: SPACE_5,
    paddingHorizontal: SPACE_5,
    paddingBottom: SPACE_4,
    overflow: 'hidden',
    position: 'relative',
  },
  adireOrnament: {
    position: 'absolute',
    top: -10,
    right: -10,
  },
  balanceCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceCardLabel: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: CREAM,
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  revealPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS_MD,
  },
  revealPillText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: CREAM,
    letterSpacing: 0.5,
  },

  // Balance amount
  balanceAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE_2,
    marginTop: SPACE_3,
    marginBottom: SPACE_3,
  },
  balanceCurrency: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    fontWeight: '400',
    color: CREAM,
    lineHeight: 44,
    opacity: 0.85,
  },
  balanceAmount: {
    fontFamily: FONT_MONO,
    fontSize: 38,
    fontWeight: '600',
    color: CREAM,
    lineHeight: 44,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  balanceHidden: {
    color: INK_MID,
    letterSpacing: 2,
  },

  // Balance card bottom row
  balanceCardDivider: {
    height: 1,
    backgroundColor: 'rgba(245,237,214,0.12)',
    marginBottom: SPACE_3,
  },
  balanceCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_3,
  },
  balanceBottomLabel: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: CREAM,
    opacity: 0.5,
    letterSpacing: 0.8,
    marginRight: SPACE_1,
  },
  balanceFlowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  balanceFlowIn: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: SUCCESS_TEXT,
  },
  balanceFlowOut: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: CREAM,
    opacity: 0.75,
  },
  balanceCardLast4: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: CREAM,
    opacity: 0.45,
    marginLeft: 'auto',
  },

  // ── Quick Actions ──
  quickActionsGrid: {
    flexDirection: 'row',
    gap: SPACE_3,
    paddingHorizontal: SPACE_5,
    marginTop: SPACE_4,
  },
  quickActionCell: {
    flex: 1,
    height: 75,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE_2,
  },
  quickActionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    fontWeight: '600',
    color: INK,
    letterSpacing: 0.3,
  },

  // ── KYC Card ──
  kycCard: {
    marginTop: 18,
    marginHorizontal: SPACE_5,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    padding: SPACE_4,
  },
  kycMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_3,
    marginBottom: SPACE_3,
  },
  kycIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycTextBlock: {
    flex: 1,
    gap: 3,
  },
  kycTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
  },
  kycSubtitle: {
    fontSize: 11,
    color: INK_MID,
  },
  kycProgressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACE_2,
  },
  kycProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  kycTierLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kycTierLabel: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: INK_MID,
    letterSpacing: 0.5,
  },
  kycTierLabelGold: {
    color: GOLD,
  },

  // ── Transaction Section ──
  txSection: {
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_5,
    marginBottom: SPACE_3,
  },
  sectionKicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: GOLD,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    fontWeight: '400',
    color: INK,
    lineHeight: 26,
  },
  sectionAction: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: GOLD,
    letterSpacing: 0.5,
    paddingBottom: 2,
  },

  // Transaction card container
  txCard: {
    marginHorizontal: SPACE_5,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: SPACE_4,
  },

  // Transaction Row
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_3,
    paddingVertical: SPACE_3,
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS_SM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconBoxCredit: {
    backgroundColor: SUCCESS_DIM,
  },
  txIconBoxDebit: {
    backgroundColor: GOLD_DIM,
  },
  txCenter: {
    flex: 1,
    gap: 3,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_2,
  },
  txTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: INK,
  },
  txDate: {
    fontSize: 10.5,
    color: INK_MID,
  },
  txStatusChip: {
    backgroundColor: DESTRUCTIVE_DIM,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  txStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: ERROR_TEXT,
    letterSpacing: 0.5,
  },
  txAmount: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  txAmountCredit: {
    color: SUCCESS_TEXT,
  },
  txAmountDebit: {
    color: INK,
  },
  txSeparator: {
    height: 1,
    backgroundColor: BORDER,
    marginLeft: 36 + SPACE_3,
  },

  // Skeleton
  skeletonTitle: {
    width: '70%',
    height: 12,
    borderRadius: 6,
    marginBottom: 6,
  },
  skeletonDate: {
    width: '40%',
    height: 10,
    borderRadius: 5,
  },
  skeletonAmount: {
    width: 64,
    height: 14,
    borderRadius: 6,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: SPACE_3,
  },
  emptyHeading: {
    fontSize: 15,
    fontWeight: '600',
    color: INK_MID,
    textAlign: 'center',
  },
  emptyTopUpBtn: {
    marginTop: SPACE_1,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    paddingHorizontal: SPACE_5,
    paddingVertical: SPACE_3,
    borderRadius: RADIUS_MD,
  },
  emptyTopUpText: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: '600',
    color: GOLD,
  },
});
