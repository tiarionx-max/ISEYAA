/**
 * Tour Rate Screen — Phase 9, Plan 09-11
 *
 * Deep-link target for push notifications: `iseyaa://tours/rate/:bookingId`.
 * Fetches the booking from GET /api/v1/tour-bookings/:bookingId and renders
 * the RatingModal with booking data pre-filled.
 *
 * Registered in _layout.tsx with presentation: 'transparentModal' + animation: 'fade'
 * so it overlays the previous screen gracefully.
 *
 * Closes TOUR-07 (mobile-side).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { fetcher } from '../../../lib/api';
import { RatingModal, type VenueTarget } from '../../../components/tours/RatingModal';
import {
  GOLD,
  INK,
  INK_SECONDARY,
  SURFACE_DEEP,
  TYPE,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  RADIUS_MD,
  BORDER_SUBTLE,
  SURFACE_RAISED,
  FONT_UI,
} from '../../../lib/tokens';
import { PressableScale } from '../../../components/ui/PressableScale';

// ── Types ──────────────────────────────────────────────────────────────────

type TourBookingDetail = {
  id: string;
  tourPackageId: string;
  tourDate: string;
  status: string;
  tourPackage?: {
    id: string;
    name?: string | null;
    // Backend relation is `tourGuide`, not `guideProfile` — see
    // TourBookingService.findById() (backend/src/modules/tour-bookings/tour-bookings.service.ts).
    tourGuide?: {
      id: string;
      user?: { firstName?: string | null; lastName?: string | null } | null;
    } | null;
    attractionIds?: string[];
    attractionNames?: string[];
    propertyId?: string | null;
    propertyName?: string | null;
  } | null;
};

// ── Screen ─────────────────────────────────────────────────────────────────

export default function TourRateScreen(): JSX.Element {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [modalVisible, setModalVisible] = useState(true);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tour-booking-detail', bookingId],
    queryFn: () => fetcher(`/tour-bookings/${bookingId}`),
    enabled: !!bookingId,
    staleTime: 60_000,
    retry: 1,
  });

  const booking: TourBookingDetail | undefined = data?.data ?? data;

  function handleClose() {
    setModalVisible(false);
    // Brief delay so the close animation is visible before pop
    setTimeout(() => router.back(), 150);
  }

  if (isLoading) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={s.errorCard}>
          <Text style={s.errorTitle}>Could not load booking</Text>
          <Text style={s.errorBody}>
            The booking may have been removed or you may not have permission to view it.
          </Text>
          <PressableScale onPress={() => router.back()} style={s.dismissBtn} hapticStyle="light">
            <Text style={s.dismissBtnText}>Go back</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  // Build venue targets from attractionIds/propertyId
  const venues: VenueTarget[] = [];
  const attrIds = booking.tourPackage?.attractionIds ?? [];
  const attrNames = booking.tourPackage?.attractionNames ?? [];
  attrIds.forEach((id, i) => {
    venues.push({ id, name: attrNames[i] ?? `Attraction ${i + 1}`, type: 'attraction' });
  });
  if (booking.tourPackage?.propertyId) {
    venues.push({
      id: booking.tourPackage.propertyId,
      name: booking.tourPackage.propertyName ?? 'Property',
      type: 'property',
    });
  }

  const guideUser = booking.tourPackage?.tourGuide?.user;
  const guideName =
    [guideUser?.firstName, guideUser?.lastName].filter(Boolean).join(' ') || null;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
      <RatingModal
        visible={modalVisible}
        onClose={handleClose}
        tourBookingId={booking.id}
        guideId={booking.tourPackage?.tourGuide?.id ?? null}
        guideName={guideName}
        tourPackageId={booking.tourPackageId}
        packageName={booking.tourPackage?.name ?? null}
        venues={venues}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(5,14,14,0.70)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_5,
    paddingVertical: SPACE_5,
    marginHorizontal: SPACE_4,
    gap: SPACE_3,
    alignItems: 'center',
  },
  errorTitle: {
    fontFamily: FONT_UI,
    fontSize: 17,
    fontWeight: '700',
    color: INK,
    textAlign: 'center',
  },
  errorBody: {
    ...TYPE.body,
    color: INK_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  dismissBtn: {
    backgroundColor: SURFACE_DEEP,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_3,
    borderRadius: RADIUS_MD,
    marginTop: SPACE_3,
  },
  dismissBtnText: { ...TYPE.bodyEmphasis, color: INK },
});
