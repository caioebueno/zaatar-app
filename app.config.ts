import type { ExpoConfig } from "expo/config";

const mapboxDownloadToken = process.env.MAPBOX_DOWNLOADS_TOKEN ?? "";

if (!mapboxDownloadToken) {
  console.warn(
    "MAPBOX_DOWNLOADS_TOKEN is not set. Android native builds that include @rnmapbox/maps will fail until this secret is configured.",
  );
}

const config: ExpoConfig = {
  name: "zaatar-app",
  slug: "zaatar-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "zaatarapp",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.caioebueno.zaatarapp",
  },
  android: {
    package: "com.caioebueno.zaatarapp",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  androidNavigationBar: {
    backgroundColor: "#F4F6F8",
    barStyle: "dark-content",
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    "expo-secure-store",
    [
      "@rnmapbox/maps",
      {
        RNMapboxMapsDownloadToken: mapboxDownloadToken,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "c4bdc253-373a-4226-91eb-4e5b4b98d235",
    },
  },
  owner: "caioebueno",
};

export default config;
