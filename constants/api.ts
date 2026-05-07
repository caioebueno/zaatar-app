import { Platform } from "react-native";

const FALLBACK_API_BASE_URL =
  Platform.OS === "web" ? "http://localhost:3000/api" : "http://192.168.1.151:3000/api";

function normalizeApiBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (trimmedBaseUrl.length === 0) {
    return FALLBACK_API_BASE_URL;
  }

  if (/\/api$/i.test(trimmedBaseUrl)) {
    return trimmedBaseUrl;
  }

  return `${trimmedBaseUrl}/api`;
}

const envApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export const API_BASE_URL = envApiBaseUrl
  ? normalizeApiBaseUrl(envApiBaseUrl)
  : FALLBACK_API_BASE_URL;

