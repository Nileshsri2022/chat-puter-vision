import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { checkAuthStatus, signIn, getCurrentUser, type BackendUser } from "@/lib/backend";
import { useToast } from "@/hooks/use-toast";

interface AuthButtonProps {
  onAuthChange?: (isAuthenticated: boolean) => void;
}

/**
 * Sign-in button. Auth state comes from the documented synchronous
 * `puter.auth.isSignedIn()` check; re-checked on mount and when the tab
 * regains focus (no polling — the SDK documents no auth-change events).
 */
export const AuthButton = ({ onAuthChange }: AuthButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<BackendUser | null>(null);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    const signedIn = checkAuthStatus();
    const u = signedIn ? await getCurrentUser() : null;
    setUser(u);
    onAuthChange?.(signedIn);
    return u;
  }, [onAuthChange]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signIn();
      if (result && result.success === false) {
        throw new Error(result.msg || result.error || "Sign in failed");
      }
      await refresh();
      const u = await getCurrentUser();
      toast({
        title: "Signed in successfully",
        description: u?.username
          ? `Welcome, ${u.username}. You can now use AI models.`
          : "You can now use AI models.",
        duration: 3000,
      });
    } catch (error) {
      console.error("Sign in error:", error);
      const message = error instanceof Error ? error.message : "";
      let description = "Failed to sign in. Please try again.";
      if (/popup|blocked/i.test(message)) {
        description = "Popup blocked. Please allow popups for this site and try signing in again.";
      } else if (/network|fetch/i.test(message)) {
        description = "Network error. Please check your connection and try again.";
      } else if (/timeout/i.test(message)) {
        description = "Sign in timed out. Please try again.";
      } else if (/auth_window_closed/i.test(message)) {
        description = "Sign-in window was closed before completing.";
      } else if (message) {
        description = message;
      }
      toast({ title: "Sign in failed", description, variant: "destructive", duration: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      disabled={isLoading}
      className="bg-primary hover:bg-primary/90"
      aria-label={isLoading ? "Signing in…" : "Sign in"}
    >
      {isLoading ? (
        <>
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          Signing in…
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
};
