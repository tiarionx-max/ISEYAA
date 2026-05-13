import { Tabs } from 'expo-router';
import { Map, Calendar, Home, Music, User, Car, Truck } from 'lucide-react-native';

const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const INACTIVE = '#6B7280';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: JUNGLE,
          borderTopColor: 'rgba(255,255,255,0.1)',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, marginTop: -2 },
        headerStyle: { backgroundColor: JUNGLE },
        headerTintColor: GOLD,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => <Map color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stays"
        options={{
          title: 'Stays',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          tabBarIcon: ({ color, size }) => <Music color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transport"
        options={{
          title: 'Transport',
          tabBarIcon: ({ color, size }) => <Car color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="driver"
        options={{
          title: 'Driver',
          tabBarIcon: ({ color, size }) => <Truck color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
