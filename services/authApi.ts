import { API_BASE_URL } from "@/constants/api";

export type AuthOwner = {
  id: string;
  email: string;
  name: string;
  phone: string;
};

export type SendOTPResponse = {
  ok: true;
  expiresInMinutes: number;
};

export type VerifyOTPResponse = {
  ok: true;
  accessToken: string;
  expiresAt: string;
  owner: AuthOwner;
  selectedBusinessId: string | null;
  businesses: { id: string; name: string; branch?: string | null }[];
};

export type OTPErrorType =
  | { type: "OTP_NOT_FOUND_OR_EXPIRED" }
  | { type: "OTP_INVALID"; remainingAttempts: number }
  | { type: "NOT_FOUND" }
  | { type: "INVALID_PAYLOAD"; field: string }
  | { type: "NETWORK" }
  | { type: "UNKNOWN" };

export class OTPError extends Error {
  constructor(public readonly detail: OTPErrorType) {
    super(detail.type);
    this.name = "OTPError";
  }
}

async function request<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OTPError({ type: "NETWORK" });
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 404) throw new OTPError({ type: "NOT_FOUND" });
    if (data?.reason === "OTP_NOT_FOUND_OR_EXPIRED")
      throw new OTPError({ type: "OTP_NOT_FOUND_OR_EXPIRED" });
    if (data?.reason === "OTP_INVALID")
      throw new OTPError({ type: "OTP_INVALID", remainingAttempts: data.remainingAttempts ?? 0 });
    if (data?.field)
      throw new OTPError({ type: "INVALID_PAYLOAD", field: data.field });
    throw new OTPError({ type: "UNKNOWN" });
  }

  return data as T;
}

export function sendOwnerOTP(phone: string, language = "en") {
  return request<SendOTPResponse>("owners/auth/otp/send", { phone, language });
}

export function verifyOwnerOTP(phone: string, code: string) {
  return request<VerifyOTPResponse>("owners/auth/otp/verify", { phone, code });
}
