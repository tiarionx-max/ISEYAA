/**
 * NightlyBookingSheet — Plan 08-08 (Wave 4)
 *
 * Sticky booking sheet variant for `property.bookingMode === 'NIGHTLY'`.
 * Mirrors web `NightlyForm` at `web/src/app/stays/[id]/page.tsx` (around line 102).
 *
 * Compute formula: `total = nights × pricePerNight`.
 * Submit payload: `{ checkIn: 'YYYY-MM-DD', checkOut: 'YYYY-MM-DD', guests, email }`
 *                  posted to `POST /api/v1/properties/:id/bookings` (CreateBookingDto).
 *
 * Email is REQUIRED by backend DTO (`@IsEmail()`). The sheet pre-fills from
 * `defaultEmail` (from session `/users/me`) and disables submit on invalid email.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Minus, Plus, Users } from 'lucide-react-native';

import { PressableScale } from '../ui/PressableScale';
import {
  SURFACE_DEEP,
  SURFACE_RAISED,
  SURFACE_MID,
  GOLD,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BookingArgs = {
  checkIn: string;
  checkOut: string;
  guests: number;
  email: string;
};

export type Property = {
  id: string;
  name?: string;
  bookingMode?: 'NIGHTLY' | 'HOURLY' | 'TIMED_EVENT' | 'MEMBERSHIP';
  pricePerNight?: number | null;
  pricePerHour?: number | null;
  membershipMonthlyPrice?: number | null;
  membershipBenefits?: string[];
  maxGuests?: number | null;
};

export type BookingSheetProps = {
  property: Property;
  pending: boolean;
  signedIn: boolean;
  defaultEmail?: string | null;
  onSubmit: (args: BookingArgs) => void;
};

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

function isoDate(d: Date): string {
  // YYYY-MM-DD — local-date slice, no UTC shift
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function NightlyBookingSheet({
  property,
  pending,
  signedIn,
  defaultEmail,
  onSubmit,
}: BookingSheetProps): JSX.Element {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  }, []);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }, [today]);

  const [checkIn, setCheckIn] = useState<Date>(today);
  const [checkOut, setCheckOut] = useState<Date>(tomorrow);
  const [guests, setGuests] = useState<number>(2);
  const [email, setEmail] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);

  useEffect(() => {
    if (!email && defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail, email]);

  const maxGuests = property.maxGuests ?? 16;
  const unitPrice = Number(property.pricePerNight ?? 0);
  const nights = Math.max(
    1,
    Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000),
  );
  const total = nights * unitPrice;
  const validEmail = EMAIL_RE.test(email.trim());

  const onPressReserve = (): void => {
    if (!signedIn) {
      router.push('/auth/phone' as any);
      return;
    }
    if (!validEmail) {
      setEmailError('Enter a valid email');
      return;
    }
    setEmailError(null);
    onSubmit({
      checkIn: isoDate(checkIn),
      checkOut: isoDate(checkOut),
      guests,
      email: email.trim(),
    });
  };

  return (
    <View style={styles.sheet}>
      {/* Header — price + per-night */}
      <View style={styles.headerRow}>
        <Text style={styles.price}>
          {unitPrice > 0 ? fmtNGN(unitPrice) : '₦–'}
          <Text style={styles.priceSuffix}> / night</Text>
        </Text>
      </View>

      {/* Date pickers */}
      <View style={styles.dateRow}>
        <PressableScale
          onPress={() => setShowCheckIn(true)}
          style={styles.dateField}
          hapticStyle="light"
        >
          <View style={styles.dateFieldInner}>
            <Text style={styles.fieldLabel}>CHECK-IN</Text>
            <View style={styles.dateValueRow}>
              <CalendarDays size={14} color={GOLD} strokeWidth={2} />
              <Text style={styles.dateValue}>{displayDate(checkIn)}</Text>
            </View>
          </View>
        </PressableScale>
        <PressableScale
          onPress={() => setShowCheckOut(true)}
          style={styles.dateField}
          hapticStyle="light"
        >
          <View style={styles.dateFieldInner}>
            <Text style={styles.fieldLabel}>CHECK-OUT</Text>
            <View style={styles.dateValueRow}>
              <CalendarDays size={14} color={GOLD} strokeWidth={2} />
              <Text style={styles.dateValue}>{displayDate(checkOut)}</Text>
            </View>
          </View>
        </PressableScale>
      </View>

      {showCheckIn && (
        <DateTimePicker
          value={checkIn}
          mode="date"
          minimumDate={today}
          onChange={(_: unknown, d?: Date) => {
            if (Platform.OS !== 'ios') setShowCheckIn(false);
            if (d) {
              setCheckIn(d);
              if (d.getTime() >= checkOut.getTime()) {
                const next = new Date(d);
                next.setDate(next.getDate() + 1);
                setCheckOut(next);
              }
            }
          }}
        />
      )}
      {showCheckOut && (
        <DateTimePicker
          value={checkOut}
          mode="date"
          minimumDate={new Date(checkIn.getTime() + 86_400_000)}
          onChange={(_: unknown, d?: Date) => {
            if (Platform.OS !== 'ios') setShowCheckOut(false);
            if (d) setCheckOut(d);
          }}
        />
      )}

      {/* Guests stepper */}
      <View style={styles.guestsRow}>
        <View style={styles.guestsLabelCol}>
          <Text style={styles.fieldLabel}>GUESTS</Text>
          <View style={styles.guestsValueRow}>
            <Users size={14} color={GOLD} strokeWidth={2} />
            <Text style={styles.guestsValue}>
              {guests} {guests === 1 ? 'guest' : 'guests'}
            </Text>
          </View>
        </View>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setGuests((g) => Math.max(1, g - 1))}
            style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
            accessibilityLabel="Decrease guests"
            disabled={guests <= 1}
          >
            <Minus size={16} color={guests <= 1 ? INK_FAINT : INK} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => setGuests((g) => Math.min(maxGuests, g + 1))}
            style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
            accessibilityLabel="Increase guests"
            disabled={guests >= maxGuests}
          >
            <Plus size={16} color={guests >= maxGuests ? INK_FAINT : INK} strokeWidth={2} />
          </Pressable>
        </View>
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
            emailFocused ? styles.inputFocused : null,
            emailError ? styles.inputError : null,
          ]}
          accessibilityLabel="Confirmation email"
        />
        {emailError ? <Text style={styles.errorCaption}>{emailError}</Text> : null}
      </View>

      {/* Total */}
      {total > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {fmtNGN(unitPrice)} × {nights} {nights === 1 ? 'night' : 'nights'}
          </Text>
          <Text style={styles.totalValue}>{fmtNGN(total)}</Text>
        </View>
      )}

      {/* CTA */}
      <PressableScale
        onPress={onPressReserve}
        disabled={pending}
        style={[styles.cta, pending && styles.ctaDisabled]}
        hapticStyle="medium"
      >
        {pending ? (
          <ActivityIndicator color={SURFACE_DEEP} />
        ) : (
          <Text style={styles.ctaText}>
            {signedIn ? 'Reserve' : 'Sign in to book'}
          </Text>
        )}
      </PressableScale>

      <Text style={styles.footerCaption}>
        You won&apos;t be charged until your booking is confirmed
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
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  price: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    color: CREAM,
    letterSpacing: -0.4,
  },
  priceSuffix: { fontSize: 13, color: INK_FAINT, fontFamily: TYPE.body.fontFamily, fontWeight: '400' },

  dateRow: { flexDirection: 'row', gap: SPACE_2 },
  dateField: { flex: 1 },
  dateFieldInner: {
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_3,
    paddingVertical: SPACE_3,
    minHeight: 56,
  },
  dateValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dateValue: { ...TYPE.body, color: INK, fontWeight: '600', fontSize: 13 },
  fieldLabel: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    letterSpacing: 1.5,
    color: GOLD,
    fontWeight: '600',
  },

  guestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_3,
    minHeight: 56,
  },
  guestsLabelCol: { flex: 1 },
  guestsValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  guestsValue: { ...TYPE.body, color: INK, fontWeight: '600', fontSize: 13 },
  stepperRow: { flexDirection: 'row', gap: SPACE_2 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPressed: { opacity: 0.6 },

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
  ctaText: { fontSize: 15, fontWeight: '700', color: SURFACE_DEEP, letterSpacing: 0.2 },

  footerCaption: { ...TYPE.caption, color: INK_FAINT, textAlign: 'center', fontSize: 10 },
});
