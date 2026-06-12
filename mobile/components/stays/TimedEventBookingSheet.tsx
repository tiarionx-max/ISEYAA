/**
 * TimedEventBookingSheet — Plan 08-08 (Wave 4)
 *
 * Sticky booking sheet variant for `property.bookingMode === 'TIMED_EVENT'`.
 * Mirrors web `TimedEventForm` at `web/src/app/stays/[id]/page.tsx` (around line 298)
 * BUT corrects the formula per H-3 + CONTEXT §Stay Detail:
 *
 *   ✗ Old (web): `total = people × pricePerNight`
 *   ✓ New (here): `total = pricePerHour × slotLengthHours`
 *      Fallback: if pricePerHour is null/undefined, use flat pricePerNight as total
 *
 * Submit payload: full ISO timestamps from the picked slot (start, end).
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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, Minus, Plus, Users } from 'lucide-react-native';

import { Chip } from '../ui/Chip';
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

import type { BookingArgs, BookingSheetProps } from './NightlyBookingSheet';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Slot = {
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
};

// Default slot offering when the property has no slot data — single 09:00–12:00 window.
const DEFAULT_SLOTS: Slot[] = [
  { label: '09:00 – 12:00', startHour: 9, startMin: 0, endHour: 12, endMin: 0 },
  { label: '13:00 – 16:00', startHour: 13, startMin: 0, endHour: 16, endMin: 0 },
  { label: '17:00 – 20:00', startHour: 17, startMin: 0, endHour: 20, endMin: 0 },
];

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function slotLengthHours(slot: Slot): number {
  const startMs = slot.startHour * 60 + slot.startMin;
  const endMs = slot.endHour * 60 + slot.endMin;
  return Math.max(0, (endMs - startMs) / 60);
}

export function TimedEventBookingSheet({
  property,
  pending,
  signedIn,
  defaultEmail,
  onSubmit,
}: BookingSheetProps): JSX.Element {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [date, setDate] = useState<Date>(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  });
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [guests, setGuests] = useState<number>(2);
  const [email, setEmail] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [showDate, setShowDate] = useState(false);

  useEffect(() => {
    if (!email && defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail, email]);

  const slots = DEFAULT_SLOTS;
  const slot = slots[selectedSlotIndex];

  const maxGuests = property.maxGuests ?? 32;
  const pricePerHour = property.pricePerHour != null ? Number(property.pricePerHour) : null;
  const fallbackFlat = Number(property.pricePerNight ?? 0);

  // H-3 formula: total = pricePerHour × slot length (in hours).
  // Fallback when pricePerHour absent: flat pricePerNight (no multiplier).
  const slotHours = slotLengthHours(slot);
  const total = pricePerHour != null ? pricePerHour * slotHours : fallbackFlat;
  const unitLabel = pricePerHour != null ? `${fmtNGN(pricePerHour)} × ${slotHours}h` : 'Flat rate';

  const validEmail = EMAIL_RE.test(email.trim());

  const onPressBook = (): void => {
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
    start.setHours(slot.startHour, slot.startMin, 0, 0);
    const end = new Date(date);
    end.setHours(slot.endHour, slot.endMin, 0, 0);
    const args: BookingArgs = {
      checkIn: start.toISOString(),
      checkOut: end.toISOString(),
      guests,
      email: email.trim(),
    };
    onSubmit(args);
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.headerRow}>
        <Text style={styles.price}>
          {pricePerHour != null ? `From ${fmtNGN(pricePerHour)}` : fmtNGN(fallbackFlat)}
          <Text style={styles.priceSuffix}>
            {pricePerHour != null ? ' / hour' : ' flat'}
          </Text>
        </Text>
      </View>

      {/* Date */}
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

      {/* Slot chips */}
      <View style={styles.slotBlock}>
        <Text style={styles.fieldLabel}>TIME SLOT</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.slotsRow}
        >
          {slots.map((s, i) => (
            <Chip
              key={s.label}
              label={s.label}
              active={i === selectedSlotIndex}
              onPress={() => setSelectedSlotIndex(i)}
            />
          ))}
        </ScrollView>
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

      {/* Total — TIMED_EVENT formula: pricePerHour × slot length (H-3) */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{unitLabel}</Text>
        <Text style={styles.totalValue}>{fmtNGN(total)}</Text>
      </View>

      <PressableScale
        onPress={onPressBook}
        disabled={pending}
        style={[styles.cta, pending && styles.ctaDisabled]}
        hapticStyle="medium"
      >
        {pending ? (
          <ActivityIndicator color={SURFACE_DEEP} />
        ) : (
          <Text style={styles.ctaText}>
            {signedIn ? 'Book experience' : 'Sign in to book'}
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

  dateField: { width: '100%' },
  dateFieldInner: {
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_4,
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

  slotBlock: { gap: 6 },
  slotsRow: { gap: SPACE_2, paddingVertical: 4 },

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
});
