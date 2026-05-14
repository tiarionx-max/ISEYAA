import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react-native';

const GOLD = '#C8962A';
const FOREST = '#1A6B3C';
const JUNGLE = '#1C2B2B';

type CheckinResult = 'VALID' | 'ALREADY_USED' | 'NOT_FOUND' | null;

export default function QrCheckinScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<CheckinResult>(null);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  async function handleBarCodeScanned({ data }: { type: string; data: string }) {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    try {
      // Extract qr_hash from QR data (expected format: "ISEYAA_TICKET:{qr_hash}")
      const qrHash = data.startsWith('ISEYAA_TICKET:')
        ? data.replace('ISEYAA_TICKET:', '')
        : data;

      const response = await api.post(`/tickets/${qrHash}/checkin`);
      setResult(response.data.status as CheckinResult);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setResult('NOT_FOUND');
      } else {
        Alert.alert('Error', 'Failed to check in. Please try again.');
        setScanned(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setScanned(false);
  }

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.permText}>Camera access is required for QR check-in.</Text>
          <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
            <Text style={styles.permButtonText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          {result === 'VALID' && (
            <>
              <CheckCircle size={64} color="#4ADE80" />
              <Text style={[styles.resultText, { color: '#4ADE80' }]}>Check-in Successful!</Text>
              <Text style={styles.resultSub}>Ticket is valid. Welcome!</Text>
            </>
          )}
          {result === 'ALREADY_USED' && (
            <>
              <AlertCircle size={64} color={GOLD} />
              <Text style={[styles.resultText, { color: GOLD }]}>Already Used</Text>
              <Text style={styles.resultSub}>This ticket has already been scanned.</Text>
            </>
          )}
          {result === 'NOT_FOUND' && (
            <>
              <XCircle size={64} color="#F87171" />
              <Text style={[styles.resultText, { color: '#F87171' }]}>Ticket Not Found</Text>
              <Text style={styles.resultSub}>This QR code is not valid.</Text>
            </>
          )}
          <TouchableOpacity style={styles.scanAgainBtn} onPress={handleReset}>
            <Text style={styles.scanAgainText}>Scan Another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.scanTitle}>Scan Event QR Code</Text>
      <Text style={styles.scanSubtitle}>Point camera at attendee's ticket QR</Text>

      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleBarCodeScanned}
        />
        {/* Scan frame overlay */}
        <View style={styles.scanFrame} />
        {loading && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Checking ticket...</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: JUNGLE },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  permButton: {
    backgroundColor: FOREST,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permButtonText: { color: 'white', fontWeight: '600' },
  scanTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    paddingTop: 16,
  },
  scanSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  scanFrame: {
    position: 'absolute',
    top: '25%',
    left: '20%',
    right: '20%',
    bottom: '25%',
    borderWidth: 2,
    borderColor: GOLD,
    borderRadius: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: 'white', fontSize: 16, fontWeight: '600' },
  cancelBtn: {
    padding: 16,
    alignItems: 'center',
  },
  cancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  resultText: { fontSize: 24, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  resultSub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 32 },
  scanAgainBtn: {
    backgroundColor: FOREST,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    width: '80%',
    alignItems: 'center',
  },
  scanAgainText: { color: 'white', fontWeight: '600', fontSize: 14 },
  doneBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    width: '80%',
    alignItems: 'center',
  },
  doneBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});
