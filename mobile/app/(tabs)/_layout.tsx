import { Tabs } from 'expo-router';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { Globe, Grid2x2, CreditCard, Sparkles, User } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_DIM,
  INK_MID,
  BORDER,
  FONT_MONO,
} from '../../lib/tokens';

// ── Custom tab bar background (gradient + glass) ──────────────────────────
function TabBarBackground() {
  return (
    <LinearGradient
      colors={['rgba(5,14,14,0)', 'rgba(5,14,14,0.88)', 'rgba(5,14,14,0.97)']}
      style={StyleSheet.absoluteFill}
    />
  );
}

// ── Tab icon with gold pill when active ───────────────────────────────────
function TabIcon({ icon: Icon, focused }: { icon: typeof Globe; focused: boolean }) {
  return (
    <View style={[styles.iconBox, focused && styles.iconBoxActive]}>
      <Icon size={20} color={focused ? GOLD : INK_MID} strokeWidth={focused ? 2 : 1.5} />
    </View>
  );
}

// ── Tab label ─────────────────────────────────────────────────────────────
function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.label, focused ? styles.labelActive : styles.labelInactive]}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INK_MID,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.hiddenLabel,
      }}
    >
      {/* ── Visible tabs (5) ─────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon icon={Globe} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Discover" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ focused }) => <TabIcon icon={Grid2x2} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Book" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ focused }) => <TabIcon icon={CreditCard} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Wallet" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="concierge"
        options={{
          title: 'Concierge',
          tabBarIcon: ({ focused }) => <TabIcon icon={Sparkles} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Concierge" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => <TabIcon icon={User} focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="You" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const TAB_H = Platform.OS === 'ios' ? 84 : 68;
const TAB_BOTTOM = Platform.OS === 'ios' ? 24 : 12;

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(13,31,31,0.82)',
    borderTopWidth: 0,
    height: TAB_H,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingHorizontal: 6,
    borderRadius: 22,
    marginHorizontal: 12,
    marginBottom: TAB_BOTTOM,
    position: 'absolute',
    borderWidth: 1,
    borderColor: BORDER,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 0,
    gap: 4,
  },
  hiddenLabel: {
    display: 'none',
  },
  iconBox: {
    width: 44,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconBoxActive: {
    backgroundColor: GOLD_DIM,
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  labelActive: {
    color: GOLD,
    fontWeight: '700',
  },
  labelInactive: {
    color: INK_MID,
    fontWeight: '500',
  },
});
