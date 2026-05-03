export const inventoryQueryKeys = {
  dashboard: (date?: string | null) => ["inventory", "dashboard", date ?? "today"] as const,
  places: () => ["inventory", "places"] as const,
  products: () => ["inventory", "products"] as const,
  stocks: (placeId?: string | null) => ["inventory", "stocks", placeId ?? "all"] as const,
  stockTransfers: () => ["inventory", "stocks", "transfer"] as const,
  checklistToday: (date?: string | null) =>
    ["inventory", "checklist", "today", date ?? "today"] as const,
  checklistById: (checklistId?: string | null) =>
    ["inventory", "checklist", "id", checklistId ?? "none"] as const,
  checklistItems: (checklistId?: string | null) =>
    ["inventory", "checklist", "items", checklistId ?? "none"] as const,
  alerts: (filters: { status?: string | null; placeId?: string | null; productId?: string | null }) =>
    [
      "inventory",
      "alerts",
      filters.status ?? "all",
      filters.placeId ?? "all",
      filters.productId ?? "all",
    ] as const,
};
