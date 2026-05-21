import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SURFACE_MID, INK } from '../../lib/tokens';

export default function WalletScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.center}>
        <Text style={styles.text}>Wallet</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE_MID },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: INK, fontSize: 22, fontWeight: '700' },
});
