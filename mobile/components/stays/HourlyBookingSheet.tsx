/**
 * HourlyBookingSheet — Plan 08-08 (Wave 4)
 *
 * Sticky booking sheet variant for `property.bookingMode === 'HOURLY'`.
 * Mirrors web `HourlyForm` at `web/src/app/stays/[id]/page.tsx` (around line 200).
 *
 * Compute formula: `total = hours × (pricePerHour ?? pricePerNight ?? 0)`.
 * Submit payload (full ISO timestamps because hourly bookings need wall-clock time):
 *   - checkIn = (date + time) ISO string
 *   - checkOut = checkIn + hours
 * Posts to `POST /api/v1/properties/:id/bookings` (CreateBookingDto — email REQUIRED).
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
import { CalendarDays, Clock, Minus, Plus, Users } from 'lucide-react-native';

import { PressableScale } from '../ui/PressableScale';
import {
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

import type { BookingArgs, BookingSheetProps } from './NightlyBookingSheet';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function displayTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function HourlyBookingSheet({
  property,
  pending,
  signedIn,
  defaultEmail,
  onSubmit,
}: BookingSheetProps): JSX.Element {
  const initialDate = useMemo(() => {
    const d = new Date();
    d.setHours(19, 0, 0, 0);
    return d;
  }, []);
  const [date, setDate] = useState<Date>(initialDate);
  const [time, setTime] = useState<Date>(initialDate);
  const [hours, setHours] = useState<number>(2);
  const [guests, setGuests] = useState<number>(2);
  const [email, setEmail] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    if (!email && defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail, email]);

  const maxGuests = property.maxGuests ?? 16;
  const unitPrice = Number(property.pricePerHour ?? property.pricePerNight ?? 0);
  const total = hours * unitPrice;
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
    const start = new Date(date);
    start.setHours(time.getHours(), time.getMinutes(), 0, 0);
    const end = new Date(start.getTime() + hours * 3_600_000);
    const args: BookingArgs = {
      checkIn: start.toISOString(),
      checkOut: end.toISOString(),
      guests,
      email: email.trim(),
    };
    onSubmit(args);
  };

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  return (
    <View style={styles.sheet}>
      <View style={styles.headerRow}>
        <Text style={styles.price}>
          {unitPrice > 0 ? fmtNGN(unitPrice) : '₦–'}
          <Text style={styles.priceSuffix}> / hour</Text>
        </Text>
      </View>

      {/* Date + start time */}
      <View style={styles.dateRow}>
        <PressableScale
          onPress={() => setShowDate(true)}
          style={styles.dateField}
          hapticStyle="light"
        >
          <View style={styles.dateFieldInner}>
            <Text style={styles.fieldLabel}>DATE</Text>
            <View style={styles.dateValueRow}>
              <CalendarDays size={14} color={GOLD} strokeWidth={2} />
              <Text style={styles.dateValue}>{displayDate(date)}</Text>
            </View>
          </View>
        </PressableScale>
        <PressableScale
          onPress={() => setShowTime(true)}
          style={styles.dateField}
          hapticStyle="light"
        >
          <View style={styles.dateFieldInner}>
            <Text style={styles.fieldLabel}>START TIME</Text>
            <View style={styles.dateValueRow}>
              <Clock size={14} color={GOLD} strokeWidth={2} />
              <Text style={styles.dateValue}>{displayTime(time)}</Text>
            </View>
          </View>
        </PressableScale>
      </View>

      {showDate && (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={today}
          onChange={(_: unknown, d?: Date) => {
            if (Platform.OS !== 'ios') setShowDate(false);
            if (d) setDate(d);
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={time}
          mode="time"
          onChange={(_: unknown, d?: Date) => {
            if (Platform.OS !== 'ios') setShowTime(false);
            if (d) setTime(d);
          }}
        />
      )}

      {/* Duration (hours) */}
      <View style={styles.guestsRow}>
        <View style={styles.guestsLabelCol}>
          <Text style={styles.fieldLabel}>DURATION</Text>
          <View style={styles.guestsValueRow}>
            <Clock size={14} color={GOLD} strokeWidth={2} />
            <Text style={styles.guestsValue}>
              {hours} {hours === 1 ? 'hour' : 'hours'}
            </Text>
          </View>
        </View>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setHours((h) => Math.max(1, h - 1))}
            style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
            accessibilityLabel="Decrease hours"
            disabled={hours <= 1}
          >
            <Minus size={16} color={hours <= 1 ? INK_FAINT : INK} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => setHours((h) => Math.min(12, h + 1))}
            style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
            accessibilityLabel="Increase hours"
            disabled={hours >= 12}
          >
            <Plus size={16} color={hours >= 12 ? INK_FAINT : INK} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Guests */}
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
            {fmtNGN(unitPrice)} × {hours} {hours === 1 ? 'hour' : 'hours'}
          </Text>
          <Text style={styles.totalValue}>{fmtNGN(total)}</Text>
        </View>
      )}

      <PressableScale
        onPress={onPressReserve}
        disabled={pending}
        style={[styles.cta, pending && styles.ctaDisabled]}
        hapticStyle="medium"
      >
        {pending ? (
          <ActivityIndicator color="#051A10" />
        ) : (
          <Text style={styles.ctaText}>
            {signedIn ? 'Reserve table' : 'Sign in to book'}
          </Text>
        )}
      </PressableScale>
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
  ctaText: { fontSize: 15, fontWeight: '700', color: '#051A10', letterSpacing: 0.2 },
});
