/**
 * MembershipBookingSheet — Plan 08-08 (Wave 4)
 *
 * Sticky booking sheet variant for `property.bookingMode === 'MEMBERSHIP'`.
 * Mirrors web `MembershipForm` at `web/src/app/stays/[id]/page.tsx` (around line 373).
 *
 * No user-facing date inputs. Compute formula:
 *   total = months × (membershipMonthlyPrice ?? pricePerNight ?? 0)
 *
 * Submit payload (system-generated dates):
 *   checkIn  = now ISO
 *   checkOut = now + months × 30 days ISO
 *   guests   = 1 (memberships are individual)
 *
 * Posts to `POST /api/v1/properties/:id/bookings` (CreateBookingDto — email REQUIRED).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Check, Crown } from 'lucide-react-native';

import { Chip } from '../ui/Chip';
import { PressableScale } from '../ui/PressableScale';
import {
  SURFACE_RAISED,
  SURFACE_MID,
  GOLD,
  GOLD_DIM,
  GOLD_BORDER,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
  FOREST_LIGHT,
  BORDER_GLASS,
  BORDER_SUBTLE,
  BORDER_FOCUS,
  ERROR,
  ERROR_TEXT,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  RADIUS_MD,
  RADIUS_LG,
} from '../../lib/tokens';

import type { BookingArgs, BookingSheetProps } from './NightlyBookingSheet';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DURATIONS: { label: string; months: number }[] = [
  { label: '1 mo', months: 1 },
  { label: '3 mo', months: 3 },
  { label: '6 mo', months: 6 },
  { label: '12 mo', months: 12 },
];

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

export function MembershipBookingSheet({
  property,
  pending,
  signedIn,
  defaultEmail,
  onSubmit,
}: BookingSheetProps): JSX.Element {
  const [months, setMonths] = useState<number>(1);
  const [email, setEmail] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);

  useEffect(() => {
    if (!email && defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail, email]);

  const monthly = Number(
    property.membershipMonthlyPrice ?? property.pricePerNight ?? 0,
  );
  const total = months * monthly;
  const benefits: string[] = property.membershipBenefits ?? [];
  const validEmail = EMAIL_RE.test(email.trim());

  const onPressJoin = (): void => {
    if (!signedIn) {
      router.push('/auth/phone' as any);
      return;
    }
    if (!validEmail) {
      setEmailError('Enter a valid email');
      return;
    }
    setEmailError(null);
    const start = new Date();
    const end = new Date(start.getTime() + months * 30 * 86_400_000);
    const args: BookingArgs = {
      checkIn: start.toISOString(),
      checkOut: end.toISOString(),
      guests: 1,
      email: email.trim(),
    };
    onSubmit(args);
  };

  return (
    <View style={styles.sheet}>
      {/* Crown kicker */}
      <View style={styles.kickerRow}>
        <Crown size={16} color={GOLD} strokeWidth={2} />
        <Text style={styles.kicker}>MEMBERSHIP</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.price}>
          {monthly > 0 ? fmtNGN(monthly) : '₦–'}
          <Text style={styles.priceSuffix}> / month</Text>
        </Text>
      </View>

      {/* Benefits list */}
      {benefits.length > 0 && (
        <View style={styles.benefitsBlock}>
          {benefits.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Check size={14} color={FOREST_LIGHT} strokeWidth={2.4} />
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Duration */}
      <View style={styles.durationBlock}>
        <Text style={styles.fieldLabel}>DURATION</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {DURATIONS.map((d) => (
            <Chip
              key={d.label}
              label={d.label}
              active={d.months === months}
              onPress={() => setMonths(d.months)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Email */}
      <View style={styles.emailBlock}>
        <Text style={styles.fieldLabel}>CONFIRMATION EMAIL</Text>
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (emailError) setEmailError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={INK_FAINT}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
          style={[
            styles.input,
            emailFocused && styles.inputFocused,
            emailError && styles.inputError,
          ]}
          accessibilityLabel="Confirmation email"
        />
        {emailError ? <Text style={styles.errorCaption}>{emailError}</Text> : null}
      </View>

      {/* Total */}
      {total > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {fmtNGN(monthly)} × {months} {months === 1 ? 'month' : 'months'}
          </Text>
          <Text style={styles.totalValue}>{fmtNGN(total)}</Text>
        </View>
      )}

      <PressableScale
        onPress={onPressJoin}
        disabled={pending}
        style={[styles.cta, pending && styles.ctaDisabled]}
        hapticStyle="medium"
      >
        {pending ? (
          <ActivityIndicator color="#051A10" />
        ) : (
          <Text style={styles.ctaText}>
            {signedIn ? 'Become a member' : 'Sign in to join'}
          </Text>
        )}
      </PressableScale>

      <Text style={styles.footerCaption}>
        Cancel anytime · Charges renew monthly via wallet auto-debit
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: SURFACE_RAISED,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: BORDER_GLASS,
    paddingHorizontal: SPACE_6,
    paddingTop: SPACE_5,
    paddingBottom: SPACE_4,
    gap: SPACE_3,
  },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 1.8,
    color: GOLD,
    fontWeight: '700',
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  price: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    color: CREAM,
    letterSpacing: -0.4,
  },
  priceSuffix: { fontSize: 13, color: INK_FAINT, fontFamily: TYPE.body.fontFamily, fontWeight: '400' },

  benefitsBlock: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD_BORDER,
    borderWidth: 1,
    borderRadius: RADIUS_MD,
    padding: SPACE_4,
    gap: SPACE_2,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  benefitText: { ...TYPE.body, color: INK, flex: 1, fontSize: 13 },

  durationBlock: { gap: 6 },
  chipsRow: { gap: SPACE_2, paddingVertical: 4 },
  fieldLabel: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    letterSpacing: 1.5,
    color: GOLD,
    fontWeight: '600',
  },

  emailBlock: { gap: 6 },
  input: {
    height: 48,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_4,
    fontFamily: TYPE.body.fontFamily,
    fontSize: 14,
    color: INK,
  },
  inputFocused: { borderColor: BORDER_FOCUS },
  inputError: { borderColor: ERROR },
  errorCaption: { ...TYPE.caption, color: ERROR_TEXT, marginTop: 2 },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: SPACE_3,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
  },
  totalLabel: { ...TYPE.caption, color: INK_SECONDARY },
  totalValue: {
    fontFamily: FONT_MONO,
    fontSize: 18,
    fontWeight: '700',
    color: GOLD,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },

  cta: {
    height: 52,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_2,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#051A10', letterSpacing: 0.2 },

  footerCaption: { ...TYPE.caption, color: INK_FAINT, textAlign: 'center', fontSize: 10 },
});
