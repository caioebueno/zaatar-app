import { API_BASE_URL } from "@/constants/api";

export type StationPreparationStep = {
  id: string;
  name: string;
  includeComments: boolean;
  includeModifiers: boolean;
};

export type Station = {
  id: string;
  name: string;
  preparationSteps: StationPreparationStep[];
};

export class StationApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "StationApiError";
  }
}

export async function fetchStations(token: string): Promise<Station[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/stations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new StationApiError(0, "NETWORK");
  }

  if (!res.ok) {
    throw new StationApiError(res.status, `HTTP ${res.status}`);
  }

  const data = (await res.json()) as { items: Station[] };
  return data.items;
}
