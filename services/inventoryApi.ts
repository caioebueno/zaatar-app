import { INVENTORY_API_BASE_URL } from "@/constants/inventory";
import type {
  AckInventoryAlertInput,
  CreateInventoryPlaceInput,
  CreateInventoryProductInput,
  InventoryAlert,
  InventoryApiErrorCode,
  InventoryApiError,
  InventoryChecklistWithItems,
  InventoryDashboard,
  InventoryPlace,
  InventoryProduct,
  InventoryStock,
  DeleteInventoryStockInput,
  ListInventoryAlertsInput,
  OpenDailyInventoryChecklistInput,
  ResolveInventoryAlertInput,
  SubmitInventoryChecklistInput,
  TransferInventoryStockInput,
  TransferInventoryStockResponse,
  UpdateInventoryStockChecklistPromptInput,
  UpdateInventoryChecklistItemInput,
  UpdateInventoryPlaceInput,
  UpdateInventoryProductInput,
  UpsertInventoryStockInput,
} from "@/types/inventory";

type RequestConfig = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export class InventoryRequestError extends Error {
  status: number;
  field?: string;
  reason?: string;
  service?: string;
  id?: string;
  code: InventoryApiErrorCode;

  constructor(status: number, payload: InventoryApiError | null) {
    const detail = payload?.field ?? payload?.reason ?? payload?.id ?? "unknown";
    const message = payload?.error ?? `Inventory API request failed: ${status}`;
    super(`${message} (${detail})`);
    this.name = "InventoryRequestError";
    this.status = status;
    this.field = payload?.field;
    this.reason = payload?.reason;
    this.service = payload?.service;
    this.id = payload?.id;
    this.code = this.resolveCode(payload);
  }

  private resolveCode(payload: InventoryApiError | null): InventoryApiErrorCode {
    if (!payload?.error) return "UNKNOWN";
    if (payload.error === "Invalid payload") return "INVALID_PAYLOAD";
    if (payload.error === "Not found") return "NOT_FOUND";
    if (payload.error === "Conflict") return "CONFLICT";
    return "UNKNOWN";
  }
}

function createQueryString(
  query: Record<string, string | number | boolean | null | undefined>,
) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString.length > 0 ? `?${queryString}` : "";
}

async function inventoryRequest<T>(path: string, config: RequestConfig = {}): Promise<T> {
  const response = await fetch(`${INVENTORY_API_BASE_URL}${path}`, {
    method: config.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: config.body === undefined ? undefined : JSON.stringify(config.body),
  });

  const responseBody = (await response.json().catch(() => null)) as T | InventoryApiError | null;

  if (!response.ok) {
    const apiError =
      responseBody && typeof responseBody === "object" && "error" in responseBody
        ? (responseBody as InventoryApiError)
        : null;

    throw new InventoryRequestError(response.status, apiError);
  }

  return responseBody as T;
}

export function getInventoryDashboard(date?: string | null) {
  return inventoryRequest<InventoryDashboard>(
    `/dashboard${createQueryString({ date: date ?? undefined })}`,
  );
}

export function listInventoryPlaces() {
  return inventoryRequest<InventoryPlace[]>("/places");
}

export function createInventoryPlace(payload: CreateInventoryPlaceInput) {
  return inventoryRequest<InventoryPlace>("/places", {
    method: "POST",
    body: payload,
  });
}

export function updateInventoryPlace(payload: UpdateInventoryPlaceInput) {
  const { placeId, ...body } = payload;
  return inventoryRequest<InventoryPlace>(`/places/${placeId}`, {
    method: "PATCH",
    body,
  });
}

export function listInventoryProducts() {
  return inventoryRequest<InventoryProduct[]>("/products");
}

export function createInventoryProduct(payload: CreateInventoryProductInput) {
  return inventoryRequest<InventoryProduct>("/products", {
    method: "POST",
    body: payload,
  });
}

export function updateInventoryProduct(payload: UpdateInventoryProductInput) {
  const { productId, ...body } = payload;
  return inventoryRequest<InventoryProduct>(`/products/${productId}`, {
    method: "PATCH",
    body,
  });
}

export function listInventoryStocks(placeId?: string | null) {
  return inventoryRequest<InventoryStock[]>(
    `/stocks${createQueryString({ placeId: placeId ?? undefined })}`,
  );
}

export function upsertInventoryStock(payload: UpsertInventoryStockInput) {
  return inventoryRequest<InventoryStock>("/stocks", {
    method: "POST",
    body: payload,
  });
}

export function updateInventoryStockChecklistPrompt(
  payload: UpdateInventoryStockChecklistPromptInput,
) {
  return inventoryRequest<InventoryStock>("/stocks/prompt", {
    method: "PATCH",
    body: payload,
  });
}

export function deleteInventoryStock(payload: DeleteInventoryStockInput) {
  return inventoryRequest<InventoryStock>("/stocks", {
    method: "DELETE",
    body: payload,
  });
}

export function transferInventoryStock(payload: TransferInventoryStockInput) {
  return inventoryRequest<TransferInventoryStockResponse>("/stocks/transfer", {
    method: "POST",
    body: payload,
  });
}

export function openDailyInventoryChecklist(payload: OpenDailyInventoryChecklistInput = {}) {
  return inventoryRequest<InventoryChecklistWithItems>("/checklists/daily/open", {
    method: "POST",
    body: payload,
  });
}

export function getTodayInventoryChecklist(date?: string | null) {
  return inventoryRequest<InventoryChecklistWithItems | null>(
    `/checklists/today${createQueryString({ date: date ?? undefined })}`,
  );
}

export function updateInventoryChecklistItem(payload: UpdateInventoryChecklistItemInput) {
  const { checklistId, itemId, ...body } = payload;
  return inventoryRequest<InventoryChecklistWithItems>(
    `/checklists/${checklistId}/items/${itemId}`,
    {
      method: "PATCH",
      body,
    },
  );
}

export function submitInventoryChecklist(payload: SubmitInventoryChecklistInput) {
  const { checklistId, ...body } = payload;
  return inventoryRequest<InventoryChecklistWithItems>(`/checklists/${checklistId}/submit`, {
    method: "POST",
    body,
  });
}

export function listInventoryAlerts(filters: ListInventoryAlertsInput = {}) {
  return inventoryRequest<InventoryAlert[]>(
    `/alerts${createQueryString({
      status: filters.status ?? undefined,
      placeId: filters.placeId ?? undefined,
      productId: filters.productId ?? undefined,
    })}`,
  );
}

export function ackInventoryAlert(payload: AckInventoryAlertInput) {
  const { alertId, ...body } = payload;
  return inventoryRequest<InventoryAlert>(`/alerts/${alertId}/ack`, {
    method: "PATCH",
    body,
  });
}

export function resolveInventoryAlert(payload: ResolveInventoryAlertInput) {
  const { alertId, ...body } = payload;
  return inventoryRequest<InventoryAlert>(`/alerts/${alertId}/resolve`, {
    method: "PATCH",
    body,
  });
}
