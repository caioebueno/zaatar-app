import { API_BASE_URL } from "@/constants/api";

export type SalesAnalyticsResponse = {
  startDate: string;
  endDate: string;
  receitaTotal: number;    // cents
  ticketMedio: number;     // cents
  totalPedidos: number;
  evolucaoReceita: { date: string; receita: number }[];
  volumePedidos: { date: string; pedidos: number }[];
};

// Converts a YYYY-MM-DD date string (interpreted as an ET calendar date) to the
// UTC ISO timestamp of ET midnight on that day. ET is UTC-4 (EDT) or UTC-5 (EST).
function etMidnightToUTC(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Probe UTC midnight of the same calendar date, then measure how far ahead
  // UTC is from ET midnight by reading the ET clock at that moment.
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(utcMidnight);
  const etH   = parseInt(parts.find(p => p.type === "hour")!.value);
  const etMin = parseInt(parts.find(p => p.type === "minute")!.value);
  const etSec = parseInt(parts.find(p => p.type === "second")!.value);
  // At UTC midnight, ET clock shows etH:etMin:etSec (e.g. 20:00:00 for EDT = UTC-4).
  // ET midnight of dateStr is that many hours later in UTC.
  const offsetMs = ((24 - etH) * 3600 - etMin * 60 - etSec) % 86400 * 1000;
  return new Date(utcMidnight.getTime() + offsetMs).toISOString();
}

// Adds one calendar day to a YYYY-MM-DD string (UTC-noon trick avoids DST issues).
function nextDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function fetchSalesAnalytics(
  token: string,
  startDate: string,
  endDate: string,
): Promise<SalesAnalyticsResponse> {
  // Convert ET calendar dates to UTC boundaries:
  //   startDate → ET midnight of that day (inclusive)
  //   endDate   → ET midnight of the *next* day (exclusive)
  const utcStart = etMidnightToUTC(startDate);
  const utcEnd   = etMidnightToUTC(nextDateStr(endDate));

  const res = await fetch(
    `${API_BASE_URL}/analytics/orders/sales?startDate=${encodeURIComponent(utcStart)}&endDate=${encodeURIComponent(utcEnd)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`fetchSalesAnalytics: ${res.status}`);
  return res.json() as Promise<SalesAnalyticsResponse>;
}
