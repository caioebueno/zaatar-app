import { API_BASE_URL } from "@/constants/api";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PreparationTaskModifier = {
  id: string;
  modifierGroupItemId: string;
  completed: boolean;
};

export type PreparationTask = {
  id: string;
  preparationStepCategoryId: string;
  preparationStepId: string;
  quantity: number;
  comments?: string | null;
  completed: boolean;
  completedComments: boolean;
  goalMinutes?: number | null;
  expectedAt?: string | null;
  modifiers?: PreparationTaskModifier[];
};

export type PreparationTaskCategory = {
  id: string;
  orderId: string;
  stationId?: string | null;
  categoryId?: string | null;
  completed: boolean;
  tasks?: PreparationTask[];
};

export type CreatePreparationTaskCategoryInput = {
  id?: string;
  orderId: string;
  stationId?: string | null;
  categoryId?: string | null;
  completed?: boolean;
};

export type UpdatePreparationTaskCategoryInput = {
  stationId?: string | null;
  categoryId?: string | null;
  completed?: boolean;
};

export type CreatePreparationTaskInput = {
  id?: string;
  preparationStepCategoryId: string;
  preparationStepId: string;
  quantity?: number;
  comments?: string | null;
  completed?: boolean;
  completedComments?: boolean;
  goalMinutes?: number | null;
  expectedAt?: string | null;
  modifiers?: PreparationTaskModifier[];
};

export type UpdatePreparationTaskInput = {
  quantity?: number;
  comments?: string | null;
  completed?: boolean;
  completedComments?: boolean;
  goalMinutes?: number | null;
  expectedAt?: string | null;
  modifiers?: PreparationTaskModifier[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ── Categories ─────────────────────────────────────────────────────────────────

export async function fetchPreparationTaskCategories(
  token: string,
  filters?: { orderId?: string; stationId?: string; completed?: boolean },
): Promise<PreparationTaskCategory[]> {
  const params = new URLSearchParams();
  if (filters?.orderId)   params.set("orderId",   filters.orderId);
  if (filters?.stationId) params.set("stationId", filters.stationId);
  if (filters?.completed !== undefined) params.set("completed", String(filters.completed));
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(`${API_BASE_URL}/preparation-task-categories${query}`, {
    headers: authHeaders(token),
  });
  return parseResponse<PreparationTaskCategory[]>(res);
}

export async function fetchPreparationTaskCategory(
  token: string,
  categoryId: string,
): Promise<PreparationTaskCategory> {
  const res = await fetch(`${API_BASE_URL}/preparation-task-categories/${categoryId}`, {
    headers: authHeaders(token),
  });
  return parseResponse<PreparationTaskCategory>(res);
}

export async function createPreparationTaskCategory(
  token: string,
  input: CreatePreparationTaskCategoryInput,
): Promise<PreparationTaskCategory> {
  const res = await fetch(`${API_BASE_URL}/preparation-task-categories`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return parseResponse<PreparationTaskCategory>(res);
}

export async function updatePreparationTaskCategory(
  token: string,
  categoryId: string,
  input: UpdatePreparationTaskCategoryInput,
): Promise<PreparationTaskCategory> {
  const res = await fetch(`${API_BASE_URL}/preparation-task-categories/${categoryId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return parseResponse<PreparationTaskCategory>(res);
}

export async function deletePreparationTaskCategory(
  token: string,
  categoryId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/preparation-task-categories/${categoryId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── Station groups ─────────────────────────────────────────────────────────────

export async function updatePreparationTaskStation(
  token: string,
  preparationTaskStationId: string,
  input: { completed: boolean },
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/preparation-task-stations/${preparationTaskStationId}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

export async function fetchPreparationTasks(
  token: string,
  filters?: { orderId?: string; stationId?: string; preparationStepCategoryId?: string; completed?: boolean },
): Promise<PreparationTask[]> {
  const params = new URLSearchParams();
  if (filters?.orderId)                    params.set("orderId",                    filters.orderId);
  if (filters?.stationId)                  params.set("stationId",                  filters.stationId);
  if (filters?.preparationStepCategoryId)  params.set("preparationStepCategoryId",  filters.preparationStepCategoryId);
  if (filters?.completed !== undefined)    params.set("completed",                  String(filters.completed));
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(`${API_BASE_URL}/preparation-tasks${query}`, {
    headers: authHeaders(token),
  });
  return parseResponse<PreparationTask[]>(res);
}

export async function fetchPreparationTask(
  token: string,
  taskId: string,
): Promise<PreparationTask> {
  const res = await fetch(`${API_BASE_URL}/preparation-tasks/${taskId}`, {
    headers: authHeaders(token),
  });
  return parseResponse<PreparationTask>(res);
}

export async function createPreparationTask(
  token: string,
  input: CreatePreparationTaskInput,
): Promise<PreparationTask> {
  const res = await fetch(`${API_BASE_URL}/preparation-tasks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return parseResponse<PreparationTask>(res);
}

export async function updatePreparationTask(
  token: string,
  taskId: string,
  input: UpdatePreparationTaskInput,
): Promise<PreparationTask> {
  const res = await fetch(`${API_BASE_URL}/preparation-tasks/${taskId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
  return parseResponse<PreparationTask>(res);
}

export async function deletePreparationTask(
  token: string,
  taskId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/preparation-tasks/${taskId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
