import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import {
  CreditCard,
  FileText,
  Camera,
  CheckCircle,
  Lock,
  Clock,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react-native';

// ── Constants ──────────────────────────────────────────────────────────────
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 10;

// ── Types ──────────────────────────────────────────────────────────────────
type TierState = 'locked' | 'active' | 'pending' | 'verified';

type Me = {
  id: string;
  role: string;
  kycStatus: string;
  kycBvnVerifiedAt: string | null;
  kycNinVerifiedAt: string | null;
  kycLivenessVerifiedAt: string | null;
};

// ── TierCard subcomponent ──────────────────────────────────────────────────
interface TierCardProps {
  title: string;
  subtitle: string;
  limitLabel: string;
  state: TierState;
  ActiveIcon: LucideIcon;
  input?: string;
  setInput?: (v: string) => void;
  inputPlaceholder?: string;
  inputAccessibilityLabel?: string;
  privacyNote: string;
  ctaLabel: string;
  onCta: () => void;
  isSubmitting: boolean;
  verifiedAt: string | null;
  lockedNote: string;
}

function TierCard({
  title,
  subtitle,
  limitLabel,
  state,
  ActiveIcon,
  input,
  setInput,
  inputPlaceholder,
  inputAccessibilityLabel,
  privacyNote,
  ctaLabel,
  onCta,
  isSubmitting,
  verifiedAt,
  lockedNote,
}: TierCardProps) {
  // Derive card border color by state
  const borderColor =
    state === 'verified'
      ? '#22C55E'
      : state === 'pending'
        ? 'rgba(200,150,42,0.6)'
        : state === 'active'
          ? GOLD
          : 'rgba(255,255,255,0.08)';

  // Derive badge background by state
  const badgeBg =
    state === 'verified'
      ? 'rgba(34,197,94,0.15)'
      : state === 'pending'
        ? 'rgba(200,150,42,0.15)'
        : state === 'active'
          ? 'rgba(200,150,42,0.2)'
          : 'rgba(255,255,255,0.05)';

  // Derive icon color by state
  const iconColor =
    state === 'verified'
      ? '#22C55E'
      : state === 'pending' || state === 'active'
        ? GOLD
        : 'rgba(255,255,255,0.2)';

  // Determine whether CTA is disabled
  const hasInput = input !== undefined;
  const ctaDisabled =
    isSubmitting ||
    (hasInput ? (input?.length ?? 0) !== 11 : false);

  // Formatted verified date
  const formattedDate = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString('en-NG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <View
      style={[styles.tierCard, { borderColor }]}
      accessibilityRole={state === 'active' ? 'button' : 'none'}
    >
      {/* Header row */}
      <View style={styles.tierCardHeader}>
        <View style={[styles.tierBadge, { backgroundColor: badgeBg }]}>
          {state === 'locked' && <Lock size={16} color={iconColor} />}
          {state === 'pending' && <Clock size={16} color={iconColor} />}
          {state === 'verified' && <CheckCircle size={16} color={iconColor} accessibilityLabel="Verified" />}
          {state === 'active' && <ActiveIcon size={16} color={iconColor} />}
        </View>
        <View style={styles.tierCardTitles}>
          <Text style={styles.tierTitle}>{title}</Text>
          <Text style={styles.tierSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.limitBadge}>
          <Text style={styles.limitBadgeText}>{limitLabel}</Text>
        </View>
      </View>

      {/* Body by state */}
      {state === 'locked' && (
        <Text
          style={styles.lockedNote}
          accessibilityLabel="Locked — complete previous tier first"
        >
          {lockedNote}
        </Text>
      )}

      {state === 'active' && (
        <>
          {hasInput && setInput && (
            <View style={styles.locationRow}>
              <TextInput
                style={styles.locationInput}
                placeholder={inputPlaceholder}
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="number-pad"
                maxLength={11}
                value={input}
                onChangeText={setInput}
                editable={!isSubmitting}
                autoComplete="off"
                textContentType="none"
                accessibilityLabel={inputAccessibilityLabel}
                accessibilityHint="11 digits required"
              />
            </View>
          )}
          <Text style={styles.privacyNote}>{privacyNote}</Text>
          <TouchableOpacity
            style={[styles.ctaButton, ctaDisabled && styles.ctaDisabled]}
            onPress={onCta}
            disabled={ctaDisabled}
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: ctaDisabled, busy: isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={JUNGLE} accessibilityState={{ busy: true }} />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {state === 'pending' && (
        <Text style={styles.pendingLabel}>Verifying...</Text>
      )}

      {state === 'verified' && (
        <>
          <Text style={styles.verifiedLabel} accessibilityLabel="Verified">
            Verified
          </Text>
          {formattedDate && (
            <Text style={styles.verifiedDate}>Verified on {formattedDate}</Text>
          )}
        </>
      )}
    </View>
  );
}

// ── KycScreen ──────────────────────────────────────────────────────────────
export default function KycScreen() {
  const queryClient = useQueryClient();

  // Local form state
  const [bvnInput, setBvnInput] = useState('');
  const [ninInput, setNinInput] = useState('');

  // Per-tier submitting flags
  const [isSubmittingBvn, setIsSubmittingBvn] = useState(false);
  const [isSubmittingNin, setIsSubmittingNin] = useState(false);
  const [isSubmittingSmile, setIsSubmittingSmile] = useState(false);

  // Poll attempt counter (reset on each submit)
  const pollAttemptsRef = useRef(0);

  // Any tier currently submitting?
  const anySubmitting = isSubmittingBvn || isSubmittingNin || isSubmittingSmile;

  // Poll /users/me while any tier is pending, capped at MAX_POLL_ATTEMPTS
  const { data: me } = useQuery<Me>({
    queryKey: ['kyc-me'],
    queryFn: () => api.get('/users/me').then((r: { data: Me }) => r.data),
    refetchInterval: () => {
      if (anySubmitting && pollAttemptsRef.current < MAX_POLL_ATTEMPTS) {
        return POLL_INTERVAL_MS;
      }
      return false;
    },
  });

  // ── Derive tier states from me data ────────────────────────────────────
  // Tier 1: active always (no dependency), verified when kycBvnVerifiedAt present
  const tier1State: TierState = isSubmittingBvn
    ? 'pending'
    : me?.kycBvnVerifiedAt
      ? 'verified'
      : 'active';

  // Tier 2: locked until Tier 1 verified
  const tier2State: TierState = me?.kycBvnVerifiedAt
    ? isSubmittingNin
      ? 'pending'
      : me?.kycNinVerifiedAt
        ? 'verified'
        : 'active'
    : 'locked';

  // Tier 3: locked until Tier 2 verified
  const tier3State: TierState = me?.kycNinVerifiedAt
    ? isSubmittingSmile
      ? 'pending'
      : me?.kycLivenessVerifiedAt
        ? 'verified'
        : 'active'
    : 'locked';

  // ── API handlers ────────────────────────────────────────────────────────
  const handleVerifyBvn = useCallback(async () => {
    pollAttemptsRef.current = 0;
    setIsSubmittingBvn(true);
    try {
      await api.post('/users/kyc/bvn', { bvn: bvnInput });
      queryClient.invalidateQueries({ queryKey: ['kyc-me'] });
      setBvnInput('');
    } catch (err: any) {
      Alert.alert(
        'Verification Failed',
        getErrorMessage(err, 'Check your details and try again.'),
      );
    } finally {
      setIsSubmittingBvn(false);
    }
  }, [bvnInput, queryClient]);

  const handleVerifyNin = useCallback(async () => {
    pollAttemptsRef.current = 0;
    setIsSubmittingNin(true);
    try {
      await api.post('/users/kyc/nin', { nin: ninInput });
      queryClient.invalidateQueries({ queryKey: ['kyc-me'] });
      setNinInput('');
    } catch (err: any) {
      Alert.alert(
        'Verification Failed',
        getErrorMessage(err, 'Check your details and try again.'),
      );
    } finally {
      setIsSubmittingNin(false);
    }
  }, [ninInput, queryClient]);

  const handleStartLiveness = useCallback(async () => {
    pollAttemptsRef.current = 0;
    setIsSubmittingSmile(true);
    try {
      await api.post('/users/kyc/smile/complete', {});
      queryClient.invalidateQueries({ queryKey: ['kyc-me'] });
    } catch (err: any) {
      Alert.alert(
        'Verification Failed',
        getErrorMessage(err, 'Check your details and try again.'),
      );
    } finally {
      setIsSubmittingSmile(false);
    }
  }, [queryClient]);

  // ── Driver banner logic ─────────────────────────────────────────────────
  const isDriver = me?.role === 'DRIVER';
  const driverVerified = me?.kycStatus === 'VERIFIED';

  // ── Progress bar fill: segment fills when that tier is verified ─────────
  const seg1Filled = !!me?.kycBvnVerifiedAt;
  const seg2Filled = !!me?.kycNinVerifiedAt;
  const seg3Filled = !!me?.kycLivenessVerifiedAt;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Screen headings */}
          <Text style={styles.heading}>Identity Verification</Text>
          <Text style={styles.subheading}>
            Complete verification steps to unlock higher wallet limits.
          </Text>

          {/* Progress bar */}
          <View style={styles.progressRow}>
            <View
              style={[
                styles.progressSegment,
                seg1Filled && styles.progressFilled,
              ]}
            />
            <View
              style={[
                styles.progressSegment,
                seg2Filled && styles.progressFilled,
              ]}
            />
            <View
              style={[
                styles.progressSegment,
                seg3Filled && styles.progressFilled,
              ]}
            />
          </View>

          {/* Driver banner */}
          {isDriver && (
            driverVerified ? (
              <View style={styles.driverBannerSuccess}>
                <CheckCircle size={20} color="#22C55E" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverBannerTitleSuccess}>
                    Driver Approved
                  </Text>
                  <Text style={styles.driverBannerBody}>
                    Your KYC is verified. You can go online from the Driver tab.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.driverBannerPending}>
                <AlertCircle size={20} color={GOLD} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverBannerTitlePending}>
                    Driver KYC Pending
                  </Text>
                  <Text style={styles.driverBannerBody}>
                    Your documents are under review. You'll be notified when
                    your account is approved and you can go online.
                  </Text>
                </View>
              </View>
            )
          )}

          {/* Tier 1 — BVN */}
          <TierCard
            title="BVN Verification"
            subtitle="Bank Verification Number"
            limitLabel="₦200,000/day"
            state={tier1State}
            ActiveIcon={CreditCard}
            input={bvnInput}
            setInput={setBvnInput}
            inputPlaceholder="Enter your 11-digit BVN"
            inputAccessibilityLabel="BVN input"
            privacyNote="Your BVN is encrypted and never stored in plain text."
            ctaLabel="Verify BVN"
            onCta={handleVerifyBvn}
            isSubmitting={isSubmittingBvn}
            verifiedAt={me?.kycBvnVerifiedAt ?? null}
            lockedNote="Complete Tier 1 first to unlock."
          />

          {/* Tier 2 — NIN */}
          <TierCard
            title="NIN Verification"
            subtitle="National Identification Number"
            limitLabel="₦1,000,000/day"
            state={tier2State}
            ActiveIcon={FileText}
            input={ninInput}
            setInput={setNinInput}
            inputPlaceholder="Enter your 11-digit NIN"
            inputAccessibilityLabel="NIN input"
            privacyNote="Your NIN is encrypted and never stored in plain text."
            ctaLabel="Verify NIN"
            onCta={handleVerifyNin}
            isSubmitting={isSubmittingNin}
            verifiedAt={me?.kycNinVerifiedAt ?? null}
            lockedNote="Complete Tier 1 first to unlock."
          />

          {/* Tier 3 — Liveness */}
          <TierCard
            title="Liveness Verification"
            subtitle="Smile Identity facial check"
            limitLabel="₦5,000,000/day"
            state={tier3State}
            ActiveIcon={Camera}
            privacyNote="Requires camera access. No photos are stored."
            ctaLabel="Start Liveness Check"
            onCta={handleStartLiveness}
            isSubmitting={isSubmittingSmile}
            verifiedAt={me?.kycLivenessVerifiedAt ?? null}
            lockedNote="Complete Tier 2 first to unlock."
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JUNGLE,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },

  // Headings
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 21,
    marginBottom: 24,
  },

  // Progress bar
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFilled: {
    backgroundColor: GOLD,
  },

  // Driver banners
  driverBannerPending: {
    backgroundColor: 'rgba(200,150,42,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.3)',
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 12,
  },
  driverBannerSuccess: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 12,
  },
  driverBannerTitlePending: {
    fontSize: 14,
    fontWeight: 'bold',
    color: GOLD,
    marginBottom: 4,
  },
  driverBannerTitleSuccess: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#22C55E',
    marginBottom: 4,
  },
  driverBannerBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },

  // Tier card
  tierCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
  },
  tierCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierCardTitles: {
    flex: 1,
    marginLeft: 12,
  },
  tierTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  tierSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  limitBadge: {
    backgroundColor: 'rgba(200,150,42,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  limitBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: GOLD,
  },

  // Input row (from transport.tsx locationRow pattern)
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  locationInput: {
    flex: 1,
    color: 'white',
    fontSize: 14,
  },

  // Privacy / hint text
  privacyNote: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },

  // CTA button (from transport.tsx ctaButton pattern)
  ctaButton: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 44,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: JUNGLE,
  },

  // State labels
  lockedNote: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  pendingLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  verifiedLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#22C55E',
  },
  verifiedDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
});
