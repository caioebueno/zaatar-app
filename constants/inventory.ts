import { API_BASE_URL } from "@/constants/api";

function normalizeInventoryBaseUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  if (/\/api\/inventory$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/api$/i.test(trimmed)) {
    return `${trimmed}/inventory`;
  }

  return `${trimmed}/api/inventory`;
}

const envInventoryBaseUrl = process.env.EXPO_PUBLIC_INVENTORY_API_BASE_URL ?? "";
const normalizedInventoryBaseUrl = normalizeInventoryBaseUrl(envInventoryBaseUrl);

export const INVENTORY_API_BASE_URL =
  normalizedInventoryBaseUrl.length > 0
    ? normalizedInventoryBaseUrl
    : `${API_BASE_URL}/inventory`;
