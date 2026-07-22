import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  QrCode,
  CreditCard,
  ChevronRight,
  Check,
} from 'lucide-react-native';
import { api, fetcher } from '../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_ELEV,
  FOREST,
  FOREST_LIGHT,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK,
  INK_MID,
  INK_FAINT,
  BORDER,
  BORDER_MID,
  SUCCESS_TEXT,
  FONT_DISPLAY,
  FONT_MONO,
  CARD_GRADIENTS,
} from '../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────────

type AvatarTone = keyof typeof CARD_GRADIENTS;

interface Recipient {
  userId: string;
  initials: string;
  name: string;
  sub: string;
  tone: AvatarTone;
  phone: string;
}

const NG_PHONE_RE = /^(\+234|0)\d{10}$/;

const AVATAR_TONES: AvatarTone[] = ['gold', 'forest', 'rock', 'dusk', 'indigo'];

function toneForPhone(phone: string): AvatarTone {
  const sum = phone.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

function initialsFor(firstName: string): string {
  return firstName.trim().slice(0, 2).toUpperCase();
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `••••${phone.slice(-4)}` : phone;
}

function toRecipient(r: { userId: string; firstName: string; phone: string }): Recipient {
  return {
    userId: r.userId,
    initials: initialsFor(r.firstName),
    name: r.firstName,
    sub: maskPhone(r.phone),
    tone: toneForPhone(r.phone),
    phone: r.phone,
  };
}

function formatBalance(n: number): string {
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Components ─────────────────────────────────────────────────────────────────

function RecipientAvatar({
  recipient,
  isSelected,
  onPress,
}: {
  recipient: Recipient;
  isSelected: boolean;
  onPress: () => void;
}) {
  const [topColor, bottomColor] = CARD_GRADIENTS[recipient.tone];
  return (
    <TouchableOpacity style={styles.avatarPill} activeOpacity={0.7} onPress={onPress}>
      <LinearGradient
        colors={[topColor, bottomColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.avatarCircle, isSelected && styles.avatarCircleSelected]}
      >
        <Text style={styles.avatarInitials}>{recipient.initials}</Text>
      </LinearGradient>
      <Text style={styles.avatarName} numberOfLines={1}>{recipient.name}</Text>
      <Text style={styles.avatarSub} numberOfLines={1}>{recipient.sub}</Text>
    </TouchableOpacity>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SendScreen() {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const queryClient = useQueryClient();

  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetcher('/wallet/balance'),
  });
  const balance: number = Number(walletData?.balance_ngn ?? 0);

  // ── Recent recipients — derived from real outgoing transfer history ────────
  const { data: transferHistory } = useQuery({
    queryKey: ['wallet-transfers-out'],
    queryFn: () => fetcher('/wallet/transactions?type=TRANSFER&limit=50'),
  });

  const recentPhones: string[] = useMemo(() => {
    const items: any[] = transferHistory?.data ?? [];
    const phones = items
      .filter((t) => t.metadata?.direction === 'out' && t.metadata?.recipientPhone)
      .map((t) => t.metadata.recipientPhone as string);
    return Array.from(new Set(phones)).slice(0, 5);
  }, [transferHistory]);

  const recentQueries = useQueries({
    queries: recentPhones.map((phone) => ({
      queryKey: ['resolve-recipient', phone],
      queryFn: () => fetcher(`/wallet/resolve-recipient?phone=${encodeURIComponent(phone)}`),
      enabled: !!phone,
      staleTime: 5 * 60_000,
    })),
  });

  const recentRecipients: Recipient[] = recentQueries
    .map((q) => q.data)
    .filter((d): d is { userId: string; firstName: string; phone: string } => !!d)
    .map(toRecipient);

  // ── Live recipient lookup as the user types a phone number ─────────────────
  const [debouncedPhone, setDebouncedPhone] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedPhone(phoneInput.trim()), 400);
    return () => clearTimeout(handle);
  }, [phoneInput]);

  const lookupEnabled = NG_PHONE_RE.test(debouncedPhone);
  const { data: lookupData, isFetching: isLookingUp, error: lookupError } = useQuery({
    queryKey: ['resolve-recipient', debouncedPhone],
    queryFn: () => fetcher(`/wallet/resolve-recipient?phone=${encodeURIComponent(debouncedPhone)}`),
    enabled: lookupEnabled,
    retry: false,
  });

  useEffect(() => {
    if (lookupData) setSelectedRecipient(toRecipient(lookupData));
  }, [lookupData]);

  const transferMutation = useMutation({
    mutationFn: (payload: {
      recipientPhone: string;
      amount: number;
      narration?: string;
    }) => api.post('/wallet/transfer', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transfers-out'] });
      Alert.alert('Sent!', `₦${amount} sent to ${selectedRecipient?.name}.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    },
    onError: (err: any) => {
      Alert.alert('Failed', err.response?.data?.message ?? 'Transfer failed. Please try again.');
    },
  });

  const numAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const canSend = numAmount > 0 && numAmount <= balance && !!selectedRecipient;

  function handleSend() {
    if (!canSend || !selectedRecipient || transferMutation.isPending) return;
    transferMutation.mutate({
      recipientPhone: selectedRecipient.phone,
      amount: numAmount,
      narration: note || undefined,
    });
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button">
            <ArrowLeft size={18} color={INK} />
          </TouchableOpacity>
          <View style={styles.titleSection}>
            <Text style={styles.kicker}>Send</Text>
            <Text style={styles.titleMain}>To anyone in Nigeria</Text>
          </View>
        </View>

        {/* ── Recipient input ─────────────────────────────────────────────────── */}
        <View style={styles.inputSection}>
          <View style={styles.searchBar}>
            <Search size={16} color={INK_MID} />
            <TextInput
              style={styles.searchInput}
              value={phoneInput}
              onChangeText={(t) => {
                setPhoneInput(t);
                if (selectedRecipient) setSelectedRecipient(null);
              }}
              placeholder="Nigerian phone number (e.g. 0801 234 5678)"
              placeholderTextColor={INK_FAINT}
              keyboardType="phone-pad"
              returnKeyType="search"
              accessibilityLabel="Recipient phone number"
            />
            {isLookingUp && <ActivityIndicator size="small" color={GOLD} />}
            <TouchableOpacity style={styles.qrBtn} accessibilityRole="button">
              <QrCode size={16} color={GOLD} />
            </TouchableOpacity>
          </View>
          {!selectedRecipient && debouncedPhone.length > 0 && !isLookingUp && (
            <Text style={styles.overBudget}>
              {lookupEnabled
                ? (lookupError as any)?.response?.data?.message ?? 'No ISEYAA user found with that number'
                : 'Enter a full Nigerian phone number'}
            </Text>
          )}
        </View>

        {/* ── Recent recipients ──────────────────────────────────────────────── */}
        {recentRecipients.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentKicker}>SEND AGAIN</Text>
              <Text style={styles.recentTitle}>Recent</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}
            >
              {recentRecipients.map((r) => (
                <RecipientAvatar
                  key={r.userId}
                  recipient={r}
                  isSelected={selectedRecipient?.userId === r.userId}
                  onPress={() => {
                    setSelectedRecipient(r);
                    setPhoneInput(r.phone);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Selected recipient ─────────────────────────────────────────────── */}
        {selectedRecipient && (
          <View style={styles.selectedSection}>
            <View style={styles.selectedCard}>
              <LinearGradient
                colors={CARD_GRADIENTS[selectedRecipient.tone]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.selectedAvatar}
              >
                <Text style={styles.selectedAvatarInitials}>{selectedRecipient.initials}</Text>
              </LinearGradient>
              <View style={styles.selectedInfo}>
                <View style={styles.selectedNameRow}>
                  <Text style={styles.selectedName}>{selectedRecipient.name}</Text>
                  <View style={styles.verifiedBadge}>
                    <Check size={8} color="#050E0E" strokeWidth={3} />
                  </View>
                </View>
                <Text style={styles.selectedSub}>{selectedRecipient.sub}</Text>
              </View>
              <TouchableOpacity
                style={styles.changeBtn}
                onPress={() => {
                  setSelectedRecipient(null);
                  setPhoneInput('');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Amount ────────────────────────────────────────────────────────── */}
        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>YOU'RE SENDING</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountSymbol}>₦</Text>
            <TextInput
              style={styles.amountValue}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={INK_FAINT}
              keyboardType="numeric"
              textAlign="center"
              maxLength={10}
            />
          </View>
          <View style={styles.freeChip}>
            <Text style={styles.freeChipText}>Free · Arrives instantly</Text>
          </View>
          {numAmount > balance && balance > 0 && (
            <Text style={styles.overBudget}>Exceeds wallet balance</Text>
          )}
        </View>

        {/* ── Note ──────────────────────────────────────────────────────────── */}
        <View style={styles.noteSection}>
          <View style={styles.noteCard}>
            <Text style={styles.noteEmoji}>💬</Text>
            <TextInput
              style={[styles.noteText, { flex: 1 }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)…"
              placeholderTextColor={INK_FAINT}
              multiline
              maxLength={100}
            />
          </View>
        </View>

        {/* ── Funding source ────────────────────────────────────────────────── */}
        <View style={styles.fundingSection}>
          <Text style={styles.fundingLabel}>FROM</Text>
          <TouchableOpacity style={styles.fundingCard} activeOpacity={0.7}>
            <LinearGradient
              colors={[FOREST, FOREST_LIGHT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.fundingIconBox}
            >
              <CreditCard size={17} color={CREAM} />
            </LinearGradient>
            <View style={styles.fundingContent}>
              <Text style={styles.fundingTitle}>Iṣẹ́yáá Wallet</Text>
              <Text style={styles.fundingSub}>
                Balance:{' '}
                <Text style={styles.fundingBalance}>₦{formatBalance(balance)}</Text>
              </Text>
            </View>
            <ChevronRight size={16} color={INK_FAINT} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Sticky CTA ──────────────────────────────────────────────────────── */}
      <View style={styles.stickyCtaWrapper} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(5,14,14,0)', SURFACE_DEEP, SURFACE_DEEP]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.stickyCtaGradient}
          pointerEvents="none"
        />
        <View style={styles.stickyCtaContent}>
          <TouchableOpacity
            style={[styles.stickyCtaBtn, !canSend && styles.stickyCtaBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend || transferMutation.isPending}
            accessibilityRole="button"
          >
            {transferMutation.isPending ? (
              <ActivityIndicator color="#050E0E" />
            ) : (
              <Text style={styles.stickyCtaBtnText}>
                {numAmount > 0 ? `Send ₦${amount}` : 'Enter an amount'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Header
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  titleSection: { flex: 1, gap: 2 },
  kicker: {
    fontFamily: FONT_MONO, fontSize: 10, fontWeight: '600',
    letterSpacing: 1.8, color: GOLD, textTransform: 'uppercase',
  },
  titleMain: { fontFamily: FONT_DISPLAY, fontSize: 22, color: CREAM, letterSpacing: -0.3, lineHeight: 27 },

  // Recipient input
  inputSection: { paddingTop: 8, paddingHorizontal: 20 },
  searchBar: {
    height: 56, borderRadius: 16, backgroundColor: SURFACE_ELEV,
    borderWidth: 1, borderColor: GOLD_LINE,
    flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: INK, height: '100%' },
  qrBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: GOLD_DIM, alignItems: 'center', justifyContent: 'center',
  },

  // Recent recipients
  recentSection: { paddingTop: 20 },
  recentHeader: { paddingHorizontal: 20, marginBottom: 12, gap: 2 },
  recentKicker: {
    fontFamily: FONT_MONO, fontSize: 9, fontWeight: '600',
    letterSpacing: 1.8, color: GOLD, textTransform: 'uppercase',
  },
  recentTitle: { fontFamily: FONT_DISPLAY, fontSize: 18, color: INK, lineHeight: 22, letterSpacing: -0.2 },
  recentScroll: { paddingHorizontal: 20, gap: 12 },
  avatarPill: { width: 70, alignItems: 'center', gap: 5 },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 2, borderColor: GOLD_LINE, alignItems: 'center', justifyContent: 'center',
  },
  avatarCircleSelected: { borderColor: GOLD, borderWidth: 2.5 },
  avatarInitials: { fontFamily: FONT_DISPLAY, fontSize: 22, color: CREAM, lineHeight: 28 },
  avatarName: { fontSize: 11, fontWeight: '600', color: INK, textAlign: 'center', lineHeight: 14 },
  avatarSub: { fontSize: 9.5, color: INK_FAINT, textAlign: 'center', lineHeight: 12 },

  // Selected recipient
  selectedSection: { paddingTop: 20, paddingHorizontal: 20 },
  selectedCard: {
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  selectedAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center',
  },
  selectedAvatarInitials: { fontFamily: FONT_DISPLAY, fontSize: 16, color: CREAM, lineHeight: 20 },
  selectedInfo: { flex: 1, gap: 3 },
  selectedNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  selectedName: { fontSize: 14, fontWeight: '700', color: INK, lineHeight: 18 },
  verifiedBadge: { width: 14, height: 14, borderRadius: 7, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  selectedSub: { fontSize: 10.5, color: INK_MID },
  changeBtn: { borderWidth: 1, borderColor: GOLD_LINE, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  changeBtnText: { fontSize: 11, fontWeight: '600', color: GOLD },

  // Amount
  amountSection: { paddingTop: 24, paddingHorizontal: 20, alignItems: 'center' },
  amountLabel: {
    fontFamily: FONT_MONO, fontSize: 9, fontWeight: '600',
    letterSpacing: 1.8, color: INK_MID, textTransform: 'uppercase',
  },
  amountRow: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'center', gap: 6, marginTop: 6,
  },
  amountSymbol: { fontFamily: FONT_DISPLAY, fontSize: 32, color: CREAM, opacity: 0.7, lineHeight: 40 },
  amountValue: { fontSize: 56, fontWeight: '600', color: INK, letterSpacing: -1.5, lineHeight: 64, minWidth: 60 },
  freeChip: {
    marginTop: 12, backgroundColor: 'rgba(46,204,113,0.10)',
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.25)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5,
  },
  freeChipText: { fontSize: 11.5, fontWeight: '600', color: SUCCESS_TEXT },
  overBudget: { fontSize: 11, color: '#E05252', marginTop: 6 },

  // Note
  noteSection: { paddingTop: 24, paddingHorizontal: 20 },
  noteCard: {
    backgroundColor: SURFACE_MID, borderWidth: 1,
    borderStyle: 'dashed', borderColor: BORDER_MID,
    borderRadius: 14, padding: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  noteEmoji: { fontSize: 18, lineHeight: 22 },
  noteText: { fontSize: 12.5, color: INK, lineHeight: 18 },

  // Funding source
  fundingSection: { paddingTop: 20, paddingHorizontal: 20 },
  fundingLabel: {
    fontFamily: FONT_MONO, fontSize: 9, fontWeight: '600',
    letterSpacing: 1.8, color: GOLD, textTransform: 'uppercase', marginBottom: 10,
  },
  fundingCard: {
    backgroundColor: SURFACE_MID, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  fundingIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fundingContent: { flex: 1, gap: 2 },
  fundingTitle: { fontSize: 13, fontWeight: '700', color: INK },
  fundingSub: { fontSize: 11, color: INK_MID },
  fundingBalance: { color: GOLD, fontWeight: '600' },

  // Sticky CTA
  stickyCtaWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  stickyCtaGradient: { position: 'absolute', top: -40, left: 0, right: 0, height: 60 },
  stickyCtaContent: {
    paddingTop: 14, paddingHorizontal: 20, paddingBottom: 44,
    backgroundColor: SURFACE_DEEP,
  },
  stickyCtaBtn: {
    backgroundColor: GOLD, borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  stickyCtaBtnDisabled: { opacity: 0.45 },
  stickyCtaBtnText: { fontSize: 16, fontWeight: '700', color: '#050E0E', letterSpacing: 0.1 },
});
