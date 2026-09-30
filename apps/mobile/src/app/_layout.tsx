import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Jost_500Medium, Jost_600SemiBold, Jost_700Bold } from '@expo-google-fonts/jost';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { BagProvider } from '@/lib/bag';
import { WishlistProvider } from '@/lib/wishlist';

SplashScreen.preventAutoHideAsync();

const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.light.background,
    card: Colors.light.background,
    text: Colors.light.text,
    border: Colors.light.hairline,
    primary: Colors.light.tint,
  },
};

export default function RootLayout() {
  const [loaded] = useFonts({
    Jost_500Medium,
    Jost_600SemiBold,
    Jost_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  const headerOptions = {
    headerShown: true,
    headerTintColor: Colors.light.text,
    headerStyle: { backgroundColor: Colors.light.background },
    headerTitleStyle: { fontFamily: 'Jost_600SemiBold', color: Colors.light.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
  };

  return (
    <BagProvider>
      <WishlistProvider>
        <ThemeProvider value={NavTheme}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ contentStyle: { backgroundColor: Colors.light.background } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="product/[slug]"
              options={{
                headerShown: true,
                headerTransparent: true,
                headerTitle: '',
                headerBackButtonDisplayMode: 'minimal',
                headerTintColor: Colors.light.text,
              }}
            />
            <Stack.Screen name="wishlist" options={{ ...headerOptions, title: 'Wishlist' }} />
            <Stack.Screen name="orders" options={{ ...headerOptions, title: 'Orders' }} />
            <Stack.Screen name="checkout" options={{ ...headerOptions, title: 'Checkout' }} />
            <Stack.Screen name="chat" options={{ ...headerOptions, title: 'AYVANA Stylist' }} />
          </Stack>
        </ThemeProvider>
      </WishlistProvider>
    </BagProvider>
  );
}
