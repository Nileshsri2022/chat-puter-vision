// Credit balance via puter.auth.getMonthlyUsage().
// Docs: https://docs.puter.com/Auth/getMonthlyUsage/ (read 2026-10-13).
// Resources are measured in microcents ($0.50 = 50,000,000).

import type { MonthlyUsage } from "./backend";

const MICROCENTS_PER_DOLLAR = 100_000_000;

export interface CreditBalance {
  remaining: number;
  allowance: number;
}

/** Remaining/allowance credit in dollars, or null when unavailable. */
export async function getCreditBalance(): Promise<CreditBalance | null> {
  try {
    const puter = window.puter;
    if (!puter?.auth?.getMonthlyUsage) return null;
    const usage: MonthlyUsage = await puter.auth.getMonthlyUsage();
    const remaining = usage?.allowanceInfo?.remaining;
    const allowance = usage?.allowanceInfo?.monthUsageAllowance;
    if (typeof remaining !== "number" || typeof allowance !== "number") {
      return null;
    }
    return {
      remaining: remaining / MICROCENTS_PER_DOLLAR,
      allowance: allowance / MICROCENTS_PER_DOLLAR,
    };
  } catch {
    return null;
  }
}

export function formatCredits(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}
