import { API_BASE_URL } from "@/constants/api";

export type DispatchDriver = {
  id: string;
  name: string;
  active: boolean;
  priorityLevel: number;
};

export type DispatchOrder = {
  id: string;
  number?: string;
  type?: "DELIVERY" | "TAKEAWAY";
  dispatchOrderIndex: number;
  delivered: boolean;
  deliveredAt?: string;
  estimatedDeliveryDurationMinutes: number | null;
  customer?: { id: string; name: string | null; phone: string | null };
  deliveryAddress?: {
    id: string;
    description: string;
    street: string;
    number: string;
    city: string;
    state: string;
    lat: string;
    lng: string;
  };
};

export type RoutePoint = {
  id: string;
  sessionId: string;
  sequence: number;
  createdAt: string;
  recordedAt: string;
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  altitudeMeters: number | null;
  source: string;
  isMocked: boolean | null;
};

// LatestRoutePoint shares the same shape as RoutePoint
export type LatestRoutePoint = RoutePoint;

export type DispatchEntity = {
  id: string;
  createdAt: string;
  queueIndex?: number;
  startedDeliveryAt?: string;
  dispatchAt?: string | null;
  leftRestaurantAt?: string | null;
  arrivedAtRestaurantAt?: string | null;
  completedAt?: string | null;
  latestRoutePoint?: LatestRoutePoint;
  routePoints?: RoutePoint[];
  dispatched: boolean;
  estimatedDeliveryDurationMinutes?: number;
  estimatedRoundTripDurationMinutes?: number;
  driverId?: string;
  driver?: DispatchDriver;
  orders: DispatchOrder[];
};

// Kept for backward compatibility — routePoints is now part of DispatchEntity
export type DispatchWithRoutePoints = DispatchEntity;

export class DispatchApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "DispatchApiError";
  }
}

export type FetchDispatchesParams = {
  status?: "active";
  startAt?: string;
  endAt?: string;
};

export async function fetchDispatches(
  token: string,
  params?: FetchDispatchesParams,
): Promise<DispatchEntity[]> {
  const qs = new URLSearchParams();
  if (params?.status)  qs.set("status", params.status);
  if (params?.startAt) qs.set("startAt", params.startAt);
  if (params?.endAt)   qs.set("endAt", params.endAt);
  const query = qs.toString();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/dispatches${query ? `?${query}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new DispatchApiError(0, "NETWORK");
  }
  if (!res.ok) throw new DispatchApiError(res.status, `HTTP ${res.status}`);
  return res.json() as Promise<DispatchEntity[]>;
}

// Convenience wrappers
export function fetchAllDispatches(token: string): Promise<DispatchEntity[]> {
  return fetchDispatches(token);
}

export function fetchActiveDeliveries(token: string): Promise<DispatchEntity[]> {
  return fetchDispatches(token, { status: "active" });
}

export async function fetchDispatchesByDateRange(
  token: string,
  startDate: string,
  endDate: string,
): Promise<DispatchEntity[]> {
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/drivers/dispatches?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    throw new DispatchApiError(0, "NETWORK");
  }
  if (!res.ok) throw new DispatchApiError(res.status, `HTTP ${res.status}`);
  return res.json() as Promise<DispatchEntity[]>;
}
