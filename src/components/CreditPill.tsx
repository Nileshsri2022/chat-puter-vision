import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { checkAuthStatus } from "@/lib/puter";
import { getCreditBalance, formatCredits, type CreditBalance } from "@/lib/usage";

/**
 * Remaining Puter credit, refreshed on mount and when the tab regains focus.
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
      className={`flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium ${
        low ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
      }`}
      title={`${formatCredits(balance.remaining)} of ${formatCredits(balance.allowance)} monthly credit remaining`}
    >
      <Zap className="h-3 w-3" />
      {formatCredits(balance.remaining)}
    </div>
  );
};
