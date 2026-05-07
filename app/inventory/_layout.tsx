import { Tabs } from "expo-router";

export default function InventoryLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="stocks" />
      <Tabs.Screen name="refill" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="places" options={{ href: null }} />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="daily-checklist" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
