import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { MessageSquare, MessageCircle, Mail } from 'lucide-react-native';
import { api, getErrorMessage } from '../../lib/api';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  CREAM,
  INK_MID,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';

type OtpChannel = 'SMS' | 'WHATSAPP' | 'EMAIL';

const CHANNEL_OPTIONS: { value: OtpChannel; label: string; Icon: typeof MessageSquare }[] = [
  { value: 'SMS', label: 'SMS', Icon: MessageSquare },
  { value: 'WHATSAPP', label: 'WhatsApp', Icon: MessageCircle },
  { value: 'EMAIL', label: 'Email', Icon: Mail },
];

function AdireOrnament({ size = 160, opacity = 0.12 }: { size?: number; opacity?: number }) {
  const s = size;
  const c = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} opacity={opacity}>
      <Rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} fill="none" stroke={GOLD} strokeWidth={s * 0.018} />
      <Rect x={s * 0.2} y={s * 0.2} width={s * 0.6} height={s * 0.6} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Line x1={s * 0.1} y1={s * 0.1} x2={s * 0.9} y2={s * 0.9} stroke={GOLD} strokeWidth={s * 0.01} />
      <Line x1={s * 0.9} y1={s * 0.1} x2={s * 0.1} y2={s * 0.9} stroke={GOLD} strokeWidth={s * 0.01} />
      <Circle cx={c} cy={c} r={s * 0.12} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Circle cx={c} cy={c} r={s * 0.05} fill={GOLD} />
    </Svg>
  );
}

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<OtpChannel>('SMS');
  const [email, setEmail] = useState('');

  const digitsOnly = phone.replace(/[^\d+]/g, '');
  const formattedPhone = digitsOnly.startsWith('0')
    ? `+234${digitsOnly.slice(1)}`
    : digitsOnly.startsWith('+')
    ? digitsOnly
    : digitsOnly.length > 0
    ? `+234${digitsOnly}`
    : '';

  async function handleContinue() {
    if (formattedPhone.length < 13) {
      Alert.alert('Invalid number', 'Please enter a valid Nigerian phone number (e.g. 0801 234 5678).');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/otp/send', {
        phone: formattedPhone,
        channel,
        ...(channel === 'EMAIL' ? { email } : {}),
      });
      const payload = res.data?.data ?? res.data ?? {};
      const fallbackUsed = payload.fallbackUsed === true;
      router.push({
        pathname: '/auth/otp',
        params: { phone: formattedPhone, fallbackUsed: String(fallbackUsed) },
      } as any);
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Could not send OTP. Please try again.');
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  const isReady =
    phone.replace(/\s/g, '').length >= 10 &&
    (channel !== 'EMAIL' || /\S+@\S+\.\S+/.test(email));

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={['#2A1A2A', '#100810']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(5,14,14,0.4)', 'rgba(5,14,14,0.0)', 'rgba(5,14,14,0.95)', SURFACE_DEEP]}
        locations={[0, 0.3, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.adireWrapper} pointerEvents="none">
        <AdireOrnament />
      </View>

      <View style={styles.content}>
        <Text style={styles.kicker}>SIGN IN</Text>
        <Text style={styles.title}>Your phone{'\n'}<Text style={styles.titleItalic}>number</Text></Text>
        <Text style={styles.sub}>We'll send a one-time code to verify it's you.</Text>

        <View style={[styles.inputWrapper, phone.length > 0 && styles.inputWrapperActive]}>
          <View style={styles.countryPill}>
            <Text style={styles.flag}>🇳🇬</Text>
            <Text style={styles.dialCode}>+234</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="0801 234 5678"
            placeholderTextColor="rgba(245,237,214,0.25)"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={11}
            autoFocus
          />
        </View>

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

        {channel === 'EMAIL' && (
          <View style={[styles.inputWrapper, email.length > 0 && styles.inputWrapperActive]}>
            <TextInput
              style={styles.phoneInput}
              placeholder="you@example.com"
              placeholderTextColor="rgba(245,237,214,0.25)"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.cta, !isReady && styles.ctaDisabled]}
          onPress={handleContinue}
          disabled={!isReady || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#050E0E" />
            : <Text style={styles.ctaText}>Send code →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>← Back to welcome</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  adireWrapper: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingBottom: 50,
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
    fontSize: 42,
    color: CREAM,
    lineHeight: 50,
    fontWeight: '400',
    marginBottom: 12,
  },
  titleItalic: {
    fontFamily: FONT_DISPLAY,
    fontStyle: 'italic',
    color: GOLD,
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 21,
    marginBottom: 32,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_MID,
    borderWidth: 1.5,
    borderColor: 'rgba(212,168,67,0.25)',
    borderRadius: 16,
    height: 62,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 16,
  },
  inputWrapperActive: {
    borderColor: GOLD_LINE,
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
    marginBottom: 16,
  },
  channelCard: {
    flex: 1,
    height: 76,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: SURFACE_MID,
    borderColor: 'rgba(255,255,255,0.06)',
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
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: GOLD_LINE,
  },
  flag: { fontSize: 18 },
  dialCode: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    color: GOLD,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    fontSize: 20,
    color: CREAM,
    letterSpacing: 1.5,
    height: '100%',
  },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.42 },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#050E0E',
    letterSpacing: 0.2,
  },
  backLink: { marginTop: 22, alignItems: 'center' },
  backLinkText: { fontSize: 13, color: INK_MID },
});
