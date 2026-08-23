import { Redirect, Stack, useSegments } from "expo-router";
import { useAuth } from "@/contexts/auth";

export default function AppLayout() {
  const { token, isLoading, businesses, selectedBusinessId } = useAuth();
  const segments = useSegments();

  if (isLoading) return null;
  if (!token) return <Redirect href="/(auth)/login" />;

  const currentRoute   = segments[segments.length - 1];
  const needsOrgSelect = !selectedBusinessId;

  if (needsOrgSelect && currentRoute !== "org-select") {
    return <Redirect href="/(app)/org-select" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
