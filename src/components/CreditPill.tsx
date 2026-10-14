import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkAuthStatus } from "@/lib/backend";
import { getCreditBalance, formatCredits, type CreditBalance } from "@/lib/usage";
import "./CreditPill.css";

/**
 * Remaining account credit, refreshed on mount and when the tab regains focus.
 * Amber when under 10% of the monthly allowance. Hidden when unavailable.
 */
export const CreditPill = () => {
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!checkAuthStatus()) {
        if (alive) setBalance(null);
        return;
      }
      const b = await getCreditBalance();
      if (alive) setBalance(b);
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, []);

  if (!balance) return null;
  const low = balance.allowance > 0 && balance.remaining / balance.allowance < 0.1;
  return (
    <div
      role="status"
      className={cn("credit-pill", low ? "credit-pill-low" : "credit-pill-normal")}
      title={`${formatCredits(balance.remaining)} of ${formatCredits(balance.allowance)} monthly credit remaining`}
      aria-label={`${formatCredits(balance.remaining)} of ${formatCredits(balance.allowance)} monthly credit remaining`}
    >
      <Zap className="credit-pill-icon" aria-hidden="true" />
      <span className="credit-pill-value">{formatCredits(balance.remaining)}</span>
    </div>
  );
};
