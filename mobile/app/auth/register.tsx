import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { Eye, EyeOff, Check } from 'lucide-react-native';
import { api, getErrorMessage } from '../../lib/api';
import { registerForPushNotifications } from '../../lib/push-notifications';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK_MID,
  BORDER,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';

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

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const digitsOnly = phone.replace(/[^\d+]/g, '');
  const formattedPhone = digitsOnly.startsWith('0')
    ? `+234${digitsOnly.slice(1)}`
    : digitsOnly.startsWith('+')
    ? digitsOnly
    : digitsOnly.length > 0
    ? `+234${digitsOnly}`
    : '';

  const isReady =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email) &&
    formattedPhone.length >= 13 &&
    password.length >= 8 &&
    consent;

  async function handleRegister() {
    if (!isReady || loading) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        email,
        phone: formattedPhone,
        password,
        firstName,
        lastName,
        ndpaConsent: consent,
      });
      const payload = res.data?.data ?? res.data ?? {};
      const { accessToken, refreshToken } = payload;
      if (accessToken) {
        await SecureStore.setItemAsync('access_token', accessToken);
        if (refreshToken) await SecureStore.setItemAsync('refresh_token', refreshToken);
        registerForPushNotifications();
        router.replace('/(tabs)' as any);
      } else {
        Alert.alert('Error', 'Unexpected response from server. Please try again.');
      }
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Registration failed. Please try again.');
      Alert.alert('Registration failed', msg);
    } finally {
      setLoading(false);
    }
  }

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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>CREATE ACCOUNT</Text>
        <Text style={styles.title}>Your account{'\n'}<Text style={styles.titleItalic}>details</Text></Text>
        <Text style={styles.sub}>Join Iṣẹ́yáá to book stays, buy tickets, and pay with your wallet.</Text>

        <View style={[styles.inputWrapper, firstName.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="First name"
            placeholderTextColor="rgba(245,237,214,0.25)"
            autoCapitalize="words"
            value={firstName}
            onChangeText={setFirstName}
            autoFocus
          />
        </View>

        <View style={[styles.inputWrapper, lastName.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="Last name"
            placeholderTextColor="rgba(245,237,214,0.25)"
            autoCapitalize="words"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>

        <View style={[styles.inputWrapper, email.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="you@example.com"
            placeholderTextColor="rgba(245,237,214,0.25)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
        </View>

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
            maxLength={15}
          />
        </View>

        <View style={[styles.inputWrapper, password.length > 0 && styles.inputWrapperActive]}>
          <TextInput
            style={styles.textInput}
            placeholder="••••••••••"
            placeholderTextColor="rgba(245,237,214,0.25)"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} color={INK_MID} /> : <Eye size={18} color={INK_MID} />}
          </TouchableOpacity>
        </View>

        {/* NDPA consent checkbox */}
        <TouchableOpacity
          style={styles.consentRow}
          activeOpacity={0.7}
          onPress={() => setConsent((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          accessibilityLabel="Consent to NDPA data processing"
        >
          <View style={[styles.consentBox, consent && styles.consentBoxChecked]}>
            {consent && <Check size={14} color={SURFACE_DEEP} />}
          </View>
          <Text style={styles.consentText}>
            I consent to processing of my personal data under the{' '}
            <Text style={styles.consentTextHighlight}>Nigerian Data Protection Act (NDPA)</Text> as part of the
            Iṣẹ́yáá platform.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cta, !isReady && styles.ctaDisabled]}
          onPress={handleRegister}
          disabled={!isReady || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#050E0E" />
            : <Text style={styles.ctaText}>Create account →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/auth/email' as any)}
          style={styles.altLink}
          activeOpacity={0.7}
        >
          <Text style={styles.altLinkText}>Already have an account? Sign in →</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>← Back to welcome</Text>
        </TouchableOpacity>
      </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingTop: 100,
    paddingBottom: 60,
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
  textInput: {
    flex: 1,
    fontSize: 16,
    color: CREAM,
    height: '100%',
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
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
  },
  consentBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  consentBoxChecked: {
    borderColor: GOLD,
    backgroundColor: GOLD,
  },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 18,
  },
  consentTextHighlight: {
    color: GOLD,
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
  altLink: { marginTop: 20, alignItems: 'center' },
  altLinkText: { fontSize: 13, color: GOLD, fontWeight: '600' },
  backLink: { marginTop: 16, alignItems: 'center' },
  backLinkText: { fontSize: 13, color: INK_MID },
});
