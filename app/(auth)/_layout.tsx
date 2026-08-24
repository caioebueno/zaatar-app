import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/contexts/auth";

export default function AuthLayout() {
  const { token, isLoading } = useAuth();

  if (isLoading) return null;
  if (token) return <Redirect href="/(app)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
