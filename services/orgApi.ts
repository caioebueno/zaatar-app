import { API_BASE_URL } from "@/constants/api";

export type Business = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type Branch = {
  id: string;
  name: string;
};

export type FetchBusinessesResponse = {
  selectedBusinessId: string | null;
  items: Business[];
};

export type CurrentBusinessResponse = {
  id: string;
  name: string;
  logoUrl: string | null;
  branches: Branch[];
};

export class BusinessApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BusinessApiError";
  }
}

export async function fetchBusinesses(token: string): Promise<FetchBusinessesResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/businesses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new BusinessApiError(0, "NETWORK");
  }
  if (!res.ok) throw new BusinessApiError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as FetchBusinessesResponse;
}

export async function fetchCurrentBusiness(token: string, businessId: string): Promise<CurrentBusinessResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/businesses/current`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-business-id": businessId,
      },
    });
  } catch {
    throw new BusinessApiError(0, "NETWORK");
  }
  if (!res.ok) throw new BusinessApiError(res.status, `HTTP ${res.status}`);
  return (await res.json()) as CurrentBusinessResponse;
}
