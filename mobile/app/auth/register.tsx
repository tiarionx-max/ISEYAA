import React, { useState, useRef, useEffect } from 'react';
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
  INK_FAINT,
  BORDER,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';

const OTP_LENGTH = 6;

export default function RegisterScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

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

  async function handleSendOtp() {
    if (!isReady || sendingOtp) return;
    setSendingOtp(true);
    try {
      // Registration verifies via EMAIL, not phone SMS/WhatsApp — Termii/Twilio
      // are not reliably deliverable in production right now. The OTP itself is
      // still stored/validated server-side keyed by phone (channel only controls
      // delivery), so this requires no backend change. Phone verification is
      // deferred to a later, optional step from Profile.
      await api.post('/auth/otp/send', { phone: formattedPhone, channel: 'EMAIL', email });
      setStep('otp');
      setCooldown(60);
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Registration failed. Please try again.');
      Alert.alert('Registration failed', msg);
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyAndRegister(code: string) {
    if (code.length !== OTP_LENGTH || verifying) return;
    setVerifying(true);
    try {
      const res = await api.post('/auth/register', {
        email,
        phone: formattedPhone,
        password,
        firstName,
        lastName,
        ndpaConsent: consent,
        otp: code,
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
        setOtpCode('');
      }
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Incorrect or expired code.');
      Alert.alert('Wrong code', msg);
      setOtpCode('');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendOtp() {
    try {
      await api.post('/auth/otp/send', { phone: formattedPhone, channel: 'EMAIL', email });
      setCooldown(60);
    } catch {
      Alert.alert('Error', 'Could not resend OTP.');
    }
  }

  function handleOtpChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpCode(digits);
    if (digits.length === OTP_LENGTH) handleVerifyAndRegister(digits);
  }

  const otpDigits = otpCode.padEnd(OTP_LENGTH, ' ').split('');
  const maskedEmail = (() => {
    const at = email.indexOf('@');
    if (at <= 1) return email || 'your email';
    return `${email.slice(0, 2)}***${email.slice(at)}`;
  })();

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

      {step === 'form' ? (
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
            onPress={handleSendOtp}
            disabled={!isReady || sendingOtp}
            activeOpacity={0.85}
          >
            {sendingOtp
              ? <ActivityIndicator color="#050E0E" />
              : <Text style={styles.ctaText}>Send verification code →</Text>
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
      ) : (
        <View style={styles.content}>
          <Text style={styles.kicker}>VERIFY</Text>
          <Text style={styles.title}>Enter the{'\n'}<Text style={styles.titleItalic}>6-digit code</Text></Text>
          <Text style={styles.sub}>Sent to {maskedEmail}</Text>

          {/* OTP boxes — tap to focus hidden input */}
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
                  style={[
                    styles.otpBox,
                    isFocused && styles.otpBoxFocused,
                    filled && styles.otpBoxFilled,
                  ]}
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

          {/* Hidden input that captures keyboard */}
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

          {/* Resend */}
          <View style={styles.resendRow}>
            {cooldown > 0 ? (
              <Text style={styles.resendCooldown}>Resend in {cooldown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResendOtp}>
                <Text style={styles.resendLink}>Resend code</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={() => setStep('form')} style={styles.backLink} activeOpacity={0.7}>
            <Text style={styles.backLinkText}>← Edit details</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingBottom: 50,
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
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    height: 60,
    borderRadius: 14,
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
    marginTop: 12,
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
});
