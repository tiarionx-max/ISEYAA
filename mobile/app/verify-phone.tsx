import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, MessageSquare, MessageCircle, CheckCircle2 } from 'lucide-react-native';
import { api, fetcher, getErrorMessage } from '../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK_MID,
  INK_FAINT,
  BORDER,
  SUCCESS,
  SUCCESS_DIM,
  FONT_DISPLAY,
  FONT_MONO,
  RADIUS_LG,
  RADIUS_MD,
} from '../lib/tokens';

const OTP_LENGTH = 6;

type Channel = 'SMS' | 'WHATSAPP';

const CHANNEL_OPTIONS: { value: Channel; label: string; Icon: typeof MessageSquare }[] = [
  { value: 'SMS', label: 'SMS', Icon: MessageSquare },
  { value: 'WHATSAPP', label: 'WhatsApp', Icon: MessageCircle },
];

interface Me {
  phone?: string;
  status?: string;
}

export default function VerifyPhoneScreen() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  const [step, setStep] = useState<'intro' | 'otp'>('intro');
  const [channel, setChannel] = useState<Channel>('SMS');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const alreadyVerified = me?.status && me.status !== 'PENDING';
  const maskedPhone = me?.phone ? `${me.phone.slice(0, 6)}•••${me.phone.slice(-3)}` : 'your number';

  async function handleSendOtp() {
    if (!me?.phone || sending) return;
    setSending(true);
    try {
      await api.post('/auth/otp/send', { phone: me.phone, channel });
      setStep('otp');
      setCooldown(60);
    } catch (err: any) {
      Alert.alert('Error', getErrorMessage(err, 'Could not send OTP. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  async function handleResendOtp() {
    if (!me?.phone) return;
    try {
      await api.post('/auth/otp/send', { phone: me.phone, channel });
      setCooldown(60);
    } catch (err: any) {
      Alert.alert('Error', getErrorMessage(err, 'Could not resend OTP.'));
    }
  }

  async function handleVerify(code: string) {
    if (!me?.phone || code.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    try {
      await api.post('/auth/otp/verify', { phone: me.phone, otp: code });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      Alert.alert('Phone verified', 'Your phone number has been verified.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Wrong code', getErrorMessage(err, 'Incorrect or expired code.'));
      setOtpCode('');
    } finally {
      setVerifying(false);
    }
  }

  function handleOtpChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpCode(digits);
    if (digits.length === OTP_LENGTH) handleVerify(digits);
  }

  const otpDigits = otpCode.padEnd(OTP_LENGTH, ' ').split('');

  if (meLoading) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]} edges={['bottom']}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={22} color={GOLD} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Verify Phone Number</Text>
        </View>

        {alreadyVerified ? (
          <View style={styles.content}>
            <View style={styles.verifiedIconBox}>
              <CheckCircle2 size={32} color={SUCCESS} />
            </View>
            <Text style={styles.title}>Already verified</Text>
            <Text style={styles.sub}>{maskedPhone} is verified on your account.</Text>
          </View>
        ) : step === 'intro' ? (
          <View style={styles.content}>
            <Text style={styles.kicker}>SECURITY</Text>
            <Text style={styles.title}>Verify {maskedPhone}</Text>
            <Text style={styles.sub}>
              Confirm you own this phone number by entering a one-time code we send you.
            </Text>

            <Text style={styles.channelLabel}>How should we reach you?</Text>
            <View style={styles.channelRow}>
              {CHANNEL_OPTIONS.map(({ value, label, Icon }) => {
                const selected = channel === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.channelCard, selected && styles.channelCardSelected]}
                    onPress={() => setChannel(value)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${label} verification channel`}
                  >
                    <Icon size={22} color={selected ? GOLD : INK_MID} />
                    <Text style={[styles.channelCardLabel, selected && styles.channelCardLabelSelected]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.cta, sending && styles.ctaDisabled]}
              onPress={handleSendOtp}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? <ActivityIndicator color="#050E0E" /> : <Text style={styles.ctaText}>Send code →</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            <Text style={styles.kicker}>VERIFY</Text>
            <Text style={styles.title}>Enter the 6-digit code</Text>
            <Text style={styles.sub}>Sent to {maskedPhone}</Text>

            <TouchableOpacity
              style={styles.otpRow}
              activeOpacity={1}
              onPress={() => otpInputRef.current?.focus()}
              accessibilityLabel="OTP input"
            >
              {otpDigits.map((d, i) => {
                const isFocused = otpCode.length === i;
                const filled = d.trim() !== '';
                return (
                  <View
                    key={i}
                    style={[styles.otpBox, isFocused && styles.otpBoxFocused, filled && styles.otpBoxFilled]}
                  >
                    {verifying && filled ? (
                      <ActivityIndicator size="small" color={GOLD} />
                    ) : (
                      <Text style={styles.otpDigit}>{d.trim()}</Text>
                    )}
                  </View>
                );
              })}
            </TouchableOpacity>

            <TextInput
              ref={otpInputRef}
              style={styles.hiddenInput}
              value={otpCode}
              onChangeText={handleOtpChange}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              autoFocus
              caretHidden
            />

            <View style={styles.resendRow}>
              {cooldown > 0 ? (
                <Text style={styles.resendCooldown}>Resend in {cooldown}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResendOtp}>
                  <Text style={styles.resendLink}>Resend code</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={() => setStep('intro')} style={styles.backLink} activeOpacity={0.7}>
              <Text style={styles.backLinkText}>← Change channel</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: GOLD,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 3,
    color: GOLD,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    color: CREAM,
    lineHeight: 34,
    fontWeight: '400',
    marginBottom: 12,
  },
  sub: {
    fontSize: 14,
    color: INK_MID,
    lineHeight: 21,
    marginBottom: 28,
  },
  channelLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: INK_MID,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  channelCard: {
    flex: 1,
    height: 76,
    borderRadius: RADIUS_MD,
    borderWidth: 1.5,
    backgroundColor: SURFACE_MID,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  channelCardSelected: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD_LINE,
  },
  channelCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: INK_MID,
  },
  channelCardLabelSelected: {
    color: GOLD,
  },
  cta: {
    height: 56,
    borderRadius: RADIUS_MD,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.42 },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#050E0E',
    letterSpacing: 0.2,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    height: 60,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFocused: {
    borderColor: GOLD,
    backgroundColor: 'rgba(212,168,67,0.07)',
  },
  otpBoxFilled: {
    borderColor: GOLD_LINE,
  },
  otpDigit: {
    fontFamily: FONT_MONO,
    fontSize: 26,
    color: CREAM,
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    left: -999,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 4,
  },
  resendCooldown: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: INK_FAINT,
    letterSpacing: 0.4,
  },
  resendLink: {
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
  },
  backLink: { marginTop: 20, alignItems: 'center' },
  backLinkText: { fontSize: 13, color: INK_MID },
  verifiedIconBox: {
    width: 64,
    height: 64,
    borderRadius: RADIUS_LG,
    backgroundColor: SUCCESS_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
