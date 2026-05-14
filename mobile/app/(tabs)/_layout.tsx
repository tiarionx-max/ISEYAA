import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Map, Calendar, Home, Music, User, Car, Truck } from 'lucide-react-native';

const MIDNIGHT = '#0A1515';
const GOLD = '#C8962A';
const GOLD_LIGHT = '#E0AA42';
const INACTIVE = 'rgba(255,255,255,0.28)';

function TabIcon({ icon: Icon, focused, label }: { icon: any; focused: boolean; label: string }) {
  return (
    <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
      <Icon size={22} color={focused ? GOLD_LIGHT : INACTIVE} strokeWidth={focused ? 2 : 1.5} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD_LIGHT,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: MIDNIGHT,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 80 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          // Native shadow for depth on Android
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ focused }) => <TabIcon icon={Map} focused={focused} label="Explore" />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ focused }) => <TabIcon icon={Calendar} focused={focused} label="Events" />,
        }}
      />
      <Tabs.Screen
        name="stays"
        options={{
          title: 'Stays',
          tabBarIcon: ({ focused }) => <TabIcon icon={Home} focused={focused} label="Stays" />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          tabBarIcon: ({ focused }) => <TabIcon icon={Music} focused={focused} label="Studio" />,
        }}
      />
      <Tabs.Screen
        name="transport"
        options={{
          title: 'Transport',
          tabBarIcon: ({ focused }) => <TabIcon icon={Car} focused={focused} label="Transport" />,
        }}
      />
      <Tabs.Screen
        name="driver"
        options={{
          title: 'Driver',
          tabBarIcon: ({ focused }) => <TabIcon icon={Truck} focused={focused} label="Driver" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon icon={User} focused={focused} label="Profile" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 40,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  iconWrapperActive: {
    backgroundColor: 'rgba(200,150,42,0.15)',
  },
});
