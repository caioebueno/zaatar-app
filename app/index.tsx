import { Redirect } from "expo-router";
import { View } from "react-native";
import { useAuth } from "@/contexts/auth";

export default function Index() {
  const { token, isLoading, selectedBusinessId } = useAuth();

  if (isLoading) return <View style={{ flex: 1, backgroundColor: "#0a0807" }} />;
  if (!token) return <Redirect href="/(auth)/login" />;

  if (!selectedBusinessId) {
    return <Redirect href="/(app)/org-select" />;
  }

  return <Redirect href="/(app)" />;
}
