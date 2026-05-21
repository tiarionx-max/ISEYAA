import { Tabs } from 'expo-router';
import { View, Platform, StyleSheet } from 'react-native';
import { Globe, Grid2x2, CreditCard, Sparkles, User } from 'lucide-react-native';
import {
  SURFACE_DEEP,
  GOLD,
  GOLD_DIM,
  INK_FAINT,
} from '../../lib/tokens';

function TabIcon({ icon: Icon, focused }: { icon: any; focused: boolean }) {
  if (focused) {
    return (
      <View style={styles.iconWrapperActive}>
        <Icon size={24} color={GOLD} strokeWidth={2} />
      </View>
    );
  }
  return <Icon size={24} color={INK_FAINT} strokeWidth={1.5} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INK_FAINT,
        tabBarStyle: {
          backgroundColor: SURFACE_DEEP,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 80 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 0.2,
          marginTop: 1,
        },
      }}
    >
      {/* ── Visible tabs (5) ─────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon icon={Globe} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ focused }) => <TabIcon icon={Grid2x2} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ focused }) => <TabIcon icon={CreditCard} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="concierge"
        options={{
          title: 'Concierge',
          tabBarIcon: ({ focused }) => <TabIcon icon={Sparkles} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => <TabIcon icon={User} focused={focused} />,
        }}
      />

      {/* ── Hidden legacy tabs (href: null removes from tab bar) ── */}
      <Tabs.Screen name="events" options={{ href: null }} />
      <Tabs.Screen name="stays" options={{ href: null }} />
      <Tabs.Screen name="studio" options={{ href: null }} />
      <Tabs.Screen name="transport" options={{ href: null }} />
      <Tabs.Screen name="delivery" options={{ href: null }} />
      <Tabs.Screen name="driver" options={{ href: null }} />
      <Tabs.Screen name="rider" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapperActive: {
    width: 40,
    height: 30,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
