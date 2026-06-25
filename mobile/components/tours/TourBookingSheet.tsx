/**
 * TourBookingSheet — Phase 9, Plan 09-11
 *
 * Sticky booking sheet for the tour detail screen.
 * Mirrors NightlyBookingSheet.tsx structure.
 *
 * Features:
 *   - Date picker (minimumDate = today)
 *   - Passenger stepper (1..maxGroupSize, default 2)
 *   - Bulk discount caption (>=10 → 10% off, >=25 → 20% off)
 *   - Split-bill Switch toggle
 *   - Confirmation email TextInput
 *   - Total = pricePerPerson × passengerCount
 *   - "Reserve tour" CTA / "Sign in to book" fallback
 *
 * All colors from tokens — no inline hex.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Pressable,
  Switch,
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
  INK_MID,
  BORDER_GLASS,
  BORDER_SUBTLE,
  BORDER_FOCUS,
  ERROR,
  ERROR_TEXT,
  SUCCESS_TEXT,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SPACE_6,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
} from '../../lib/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type TourBookingArgs = {
  tourDate: string;
  passengerCount: number;
  email: string;
  splitBill: boolean;
};

export type TourPackageForSheet = {
  id: string;
  name?: string;
  pricePerPerson?: number | null;
  price?: number | null;
  maxGroupSize?: number | null;
};

export type TourBookingSheetProps = {
  pkg: TourPackageForSheet;
  pending: boolean;
  signedIn: boolean;
  defaultEmail?: string | null;
  onSubmit: (args: TourBookingArgs) => void;
};

function fmtNGN(n: number): string {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function bulkDiscountLabel(count: number): string | null {
  if (count >= 25) return '20% group discount applied';
  if (count >= 10) return '10% group discount applied';
  return null;
}

function applyBulkDiscount(base: number, count: number): number {
  if (count >= 25) return base * 0.8;
  if (count >= 10) return base * 0.9;
  return base;
}

export function TourBookingSheet({
  pkg,
  pending,
  signedIn,
  defaultEmail,
  onSubmit,
}: TourBookingSheetProps): JSX.Element {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  }, []);

  const [tourDate, setTourDate] = useState<Date>(today);
  const [passengerCount, setPassengerCount] = useState<number>(2);
  const [splitBill, setSplitBill] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!email && defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail, email]);

  const maxGroupSize = pkg.maxGroupSize ?? 50;
  const unitPrice = Number(pkg.pricePerPerson ?? pkg.price ?? 0);
  const discountedUnit = applyBulkDiscount(unitPrice, passengerCount);
  const total = discountedUnit * passengerCount;
  const discountLabel = bulkDiscountLabel(passengerCount);
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
      tourDate: isoDate(tourDate),
      passengerCount,
      email: email.trim(),
      splitBill,
    });
  };

  return (
    <View style={styles.sheet}>
      {/* Header — price per person */}
      <View style={styles.headerRow}>
        <Text style={styles.price}>
          {unitPrice > 0 ? fmtNGN(unitPrice) : '₦–'}
          <Text style={styles.priceSuffix}> / person</Text>
        </Text>
      </View>

      {/* Tour date picker */}
      <PressableScale
        onPress={() => setShowDatePicker(true)}
        style={styles.dateField}
        hapticStyle="light"
      >
        <View style={styles.dateFieldInner}>
          <Text style={styles.fieldLabel}>TOUR DATE</Text>
          <View style={styles.dateValueRow}>
            <CalendarDays size={14} color={GOLD} strokeWidth={2} />
            <Text style={styles.dateValue}>{displayDate(tourDate)}</Text>
          </View>
        </View>
      </PressableScale>

      {showDatePicker && (
        <DateTimePicker
          value={tourDate}
          mode="date"
          minimumDate={today}
          onChange={(_: unknown, d?: Date) => {
            if (Platform.OS !== 'ios') setShowDatePicker(false);
            if (d) setTourDate(d);
          }}
        />
      )}

      {/* Passenger stepper */}
      <View style={styles.stepperBlock}>
        <View style={styles.stepperLabelCol}>
          <Text style={styles.fieldLabel}>PASSENGERS</Text>
          <View style={styles.stepperValueRow}>
            <Users size={14} color={GOLD} strokeWidth={2} />
            <Text style={styles.stepperValue}>
              {passengerCount} {passengerCount === 1 ? 'person' : 'people'}
            </Text>
          </View>
        </View>
        <View style={styles.stepperBtns}>
          <Pressable
            onPress={() => setPassengerCount((c) => Math.max(1, c - 1))}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            accessibilityLabel="Decrease passengers"
            disabled={passengerCount <= 1}
          >
            <Minus size={16} color={passengerCount <= 1 ? INK_FAINT : INK} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => setPassengerCount((c) => Math.min(maxGroupSize, c + 1))}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            accessibilityLabel="Increase passengers"
            disabled={passengerCount >= maxGroupSize}
          >
            <Plus size={16} color={passengerCount >= maxGroupSize ? INK_FAINT : INK} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Bulk discount caption */}
      {discountLabel ? (
        <Text style={styles.discountCaption}>{discountLabel}</Text>
      ) : passengerCount >= 8 ? (
        <Text style={styles.discountHint}>Book 10+ for 10% off, 25+ for 20% off</Text>
      ) : null}

      {/* Split-bill toggle */}
      <View style={styles.splitRow}>
        <View style={styles.splitLabelCol}>
          <Text style={styles.splitLabel}>Split the bill</Text>
          <Text style={styles.splitSub}>Share a payment link with your group</Text>
        </View>
        <Switch
          value={splitBill}
          onValueChange={setSplitBill}
          trackColor={{ false: BORDER_SUBTLE, true: GOLD }}
          thumbColor={splitBill ? SURFACE_DEEP : INK_SECONDARY}
          accessibilityLabel="Enable split bill"
        />
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
            {fmtNGN(Math.round(discountedUnit))} × {passengerCount}{passengerCount === 1 ? ' person' : ' people'}
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
            {signedIn ? 'Reserve tour' : 'Sign in to book'}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  price: {
    fontFamily: FONT_DISPLAY,
    fontSize: 24,
    color: CREAM,
    letterSpacing: -0.4,
  },
  priceSuffix: {
    fontSize: 13,
    color: INK_FAINT,
    fontFamily: TYPE.body.fontFamily,
    fontWeight: '400',
  },

  dateField: {},
  dateFieldInner: {
    backgroundColor: SURFACE_MID,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_3,
    paddingVertical: SPACE_3,
    minHeight: 56,
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dateValue: {
    ...TYPE.body,
    color: INK,
    fontWeight: '600',
    fontSize: 13,
  },
  fieldLabel: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    letterSpacing: 1.5,
    color: GOLD,
    fontWeight: '600',
  },

  stepperBlock: {
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
  stepperLabelCol: { flex: 1 },
  stepperValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  stepperValue: {
    ...TYPE.body,
    color: INK,
    fontWeight: '600',
    fontSize: 13,
  },
  stepperBtns: { flexDirection: 'row', gap: SPACE_2 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: { opacity: 0.6 },

  discountCaption: {
    fontFamily: FONT_UI,
    fontSize: 12,
    color: SUCCESS_TEXT,
    textAlign: 'center',
    fontWeight: '600',
  },
  discountHint: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: INK_MID,
    textAlign: 'center',
  },

  splitRow: {
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
    gap: SPACE_3,
  },
  splitLabelCol: { flex: 1 },
  splitLabel: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: INK,
  },
  splitSub: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: INK_MID,
    marginTop: 2,
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
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: SURFACE_DEEP,
    letterSpacing: 0.2,
  },

  footerCaption: {
    ...TYPE.caption,
    color: INK_FAINT,
    textAlign: 'center',
    fontSize: 10,
  },
});
