import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import {
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, TextInput } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

void SplashScreen.preventAutoHideAsync();

let hasAppliedGlobalFont = false;

// export const unstable_settings = {
//   anchor: '(tabs)',
// };

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    if (!hasAppliedGlobalFont) {
      Text.defaultProps = Text.defaultProps ?? {};
      Text.defaultProps.style = [
        Text.defaultProps.style,
        { fontFamily: "Figtree_400Regular" },
      ];

      TextInput.defaultProps = TextInput.defaultProps ?? {};
      TextInput.defaultProps.style = [
        TextInput.defaultProps.style,
        { fontFamily: "Figtree_400Regular" },
      ];

      hasAppliedGlobalFont = true;
    }

    void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
