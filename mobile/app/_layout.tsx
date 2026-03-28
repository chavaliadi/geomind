import { useEffect, createContext, useContext, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTokenGetter } from '../services/api';

const ACTIVE   = '#0066FF';
const INACTIVE = '#9CA3AF';
const BG       = '#FFFFFF';
const BORDER   = '#E5E7EB';

// ── Auth Context ──────────────────────────────────────────────────────────────
type AuthUser = { id: string; email: string } | null;

type AuthContextType = {
  user: AuthUser;
  token: string | null;
  isLoaded: boolean;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({
  user: null, token: null, isLoaded: false,
  signIn: async () => {}, signOut: async () => {},
});

export const useAuthContext = () => useContext(AuthContext);

const TOKEN_KEY = 'geomind_jwt';
const USER_KEY  = 'geomind_user';

// ── Root Layout ───────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [token, setToken]     = useState<string | null>(null);
  const [user, setUser]       = useState<AuthUser>(null);
  const [isLoaded, setLoaded] = useState(false);

  // Restore persisted session on launch
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          setTokenGetter(() => Promise.resolve(savedToken));
        }
      } catch {
        // ignore storage errors on first launch
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const signIn = async (newToken: string, newUser: AuthUser) => {
    await AsyncStorage.setItem(TOKEN_KEY, newToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setTokenGetter(() => Promise.resolve(newToken));
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
    setTokenGetter(() => Promise.resolve(null));
  };

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={ACTIVE} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoaded, signIn, signOut }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarStyle: {
            backgroundColor: BG,
            borderTopColor: BORDER,
            borderTopWidth: 1,
            paddingBottom: 8,
            paddingTop: 6,
            height: 64,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 12,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <Ionicons name={focused ? 'checkbox' : 'checkbox-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sign-in"
          options={{ href: null }}
        />
      </Tabs>
    </AuthContext.Provider>
  );
}
