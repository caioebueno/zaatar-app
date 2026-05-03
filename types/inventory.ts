export type InventoryPlaceType = "FRIDGE" | "FREEZER" | "SHELF" | "PANTRY" | "OTHER";

export type InventoryChecklistStatus = "OPEN" | "SUBMITTED" | "REVIEWED";

export type InventoryChecklistItemResult =
  | "PENDING"
  | "OK"
  | "BELOW_MIN"
  | "REFILL_NEEDED"
  | "OUT_OF_STOCK";

export type InventoryAlertType = "LOW_STOCK" | "THRESHOLD" | "REFILL";

export type InventoryAlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type InventoryAlertStatus = "OPEN" | "ACKED" | "RESOLVED";

export type InventoryPlace = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  type: InventoryPlaceType;
  active: boolean;
  displayOrder: number | null;
  notes: string | null;
};

export type InventoryProduct = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  unit: string;
  active: boolean;
  minQuantity: number;
  alertThreshold: number | null;
  requiresRefill: boolean;
  notes: string | null;
};

export type InventoryStock = {
  id: string;
  createdAt: string;
  updatedAt: string;
  placeId: string;
  productId: string;
  placeName: string;
  productName: string;
  currentQuantity: number;
  minQuantity: number;
  notifyBelowThreshold: boolean;
  includeInChecklist: boolean;
  lastCheckedAt: string | null;
  lastCheckedBy: string | null;
};

export type InventoryChecklist = {
  id: string;
  createdAt: string;
  updatedAt: string;
  checkDate: string;
  status: InventoryChecklistStatus;
  startedBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
};

export type InventoryChecklistItem = {
  id: string;
  checklistId: string;
  placeId: string;
  productId: string;
  placeName: string;
  productName: string;
  expectedMinQuantity: number;
  countedQuantity: number | null;
  result: InventoryChecklistItemResult;
  outOfStock?: boolean | null;
  notes: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
};

export type InventoryChecklistWithItems = InventoryChecklist & {
  items: InventoryChecklistItem[];
};

export type InventoryAlert = {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: InventoryAlertType;
  severity: InventoryAlertSeverity;
  status: InventoryAlertStatus;
  message: string;
  placeId: string;
  productId: string;
  placeName: string;
  productName: string;
  checklistId: string | null;
  checklistItemId: string | null;
  triggeredAt: string;
  ackedAt: string | null;
  ackedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type InventoryDashboard = {
  floridaDate: string;
  totalActivePlaces: number;
  totalActiveProducts: number;
  belowMinimumCount: number;
  refillRequiredCount: number;
  openAlertCount: number;
  todayChecklist: {
    id: string;
    status: InventoryChecklistStatus;
    itemCount: number;
    checkedCount: number;
  } | null;
};

export type CreateInventoryPlaceInput = {
  name: string;
  type: InventoryPlaceType;
  active?: boolean;
  displayOrder?: number | null;
  notes?: string | null;
};

export type UpdateInventoryPlaceInput = {
  placeId: string;
  name?: string;
  type?: InventoryPlaceType;
  active?: boolean;
  displayOrder?: number | null;
  notes?: string | null;
};

export type CreateInventoryProductInput = {
  name: string;
  unit: string;
  active?: boolean;
  minQuantity: number;
  alertThreshold?: number | null;
  requiresRefill?: boolean;
  notes?: string | null;
};

export type UpdateInventoryProductInput = {
  productId: string;
  name?: string;
  unit?: string;
  active?: boolean;
  minQuantity?: number;
  alertThreshold?: number | null;
  requiresRefill?: boolean;
  notes?: string | null;
};

export type UpsertInventoryStockInput = {
  placeId: string;
  productId: string;
  currentQuantity: number;
  minQuantity?: number;
  notifyBelowThreshold?: boolean;
  includeInChecklist?: boolean;
  actorId?: string | null;
  source?: "MANUAL" | "CHECKLIST" | "SYSTEM";
};

export type UpdateInventoryStockChecklistPromptInput = {
  placeId: string;
  productId: string;
  includeInChecklist: boolean;
  actorId?: string | null;
};

export type DeleteInventoryStockInput = {
  placeId: string;
  productId: string;
  actorId?: string | null;
  source?: "MANUAL" | "SYSTEM";
};

export type TransferInventoryStockInput = {
  fromPlaceId: string;
  toPlaceId: string;
  productId: string;
  quantity: number;
  actorId?: string | null;
  source?: "MANUAL" | "CHECKLIST" | "SYSTEM";
  checklistId?: string | null;
  checklistItemId?: string | null;
  notes?: string | null;
};

export type TransferInventoryStockResponse = {
  fromStock: InventoryStock;
  toStock: InventoryStock;
};

export type OpenDailyInventoryChecklistInput = {
  workerId?: string | null;
  date?: string | null;
};

export type UpdateInventoryChecklistItemInput = {
  checklistId: string;
  itemId: string;
  countedQuantity: number;
  notes?: string | null;
  result?: InventoryChecklistItemResult | null;
  workerId?: string | null;
};

export type SubmitInventoryChecklistInput = {
  checklistId: string;
  workerId?: string | null;
};

export type ListInventoryAlertsInput = {
  status?: InventoryAlertStatus | null;
  placeId?: string | null;
  productId?: string | null;
};

export type AckInventoryAlertInput = {
  alertId: string;
  workerId?: string | null;
};

export type ResolveInventoryAlertInput = {
  alertId: string;
  workerId?: string | null;
};

export type InventoryApiError = {
  error: string;
  field?: string;
  reason?: string;
  service?: string;
  id?: string;
};

export type InventoryApiErrorCode = "INVALID_PAYLOAD" | "NOT_FOUND" | "CONFLICT" | "UNKNOWN";
