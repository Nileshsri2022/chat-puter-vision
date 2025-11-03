import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { checkAuthStatus, signIn, getCurrentUser } from "@/lib/puter";
import { useToast } from "@/hooks/use-toast";

interface AuthButtonProps {
  onAuthChange?: (isAuthenticated: boolean) => void;
}

export const AuthButton = ({ onAuthChange }: AuthButtonProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Check authentication status on component mount
    const checkAuth = () => {
      console.log('Checking auth status...');
      const authStatus = checkAuthStatus();
      console.log('Auth status:', authStatus, 'User:', getCurrentUser());
      setIsAuthenticated(authStatus);
      setUser(getCurrentUser());
      onAuthChange?.(authStatus);
    };

    checkAuth();

    // Set up a listener for auth changes if available
    if (typeof window !== 'undefined' && window.puter?.auth) {
      // Check periodically for auth changes
      const interval = setInterval(checkAuth, 2000);
      return () => clearInterval(interval);
    }
  }, [onAuthChange]);

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signIn();
      setIsAuthenticated(true);
      setUser(result);
      onAuthChange?.(true);

      toast({
        title: "Signed in successfully",
        description: "You can now use Claude AI.",
        duration: 3000,
      });
    } catch (error: any) {
      console.error('Sign in error:', error);

      let errorMessage = "Failed to sign in. Please try again.";

      if (error.message?.includes("popup") || error.message?.includes("blocked")) {
        errorMessage = "Popup blocked. Please allow popups for this site and try signing in again.";
      } else if (error.message?.includes("network") || error.message?.includes("fetch")) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message?.includes("timeout")) {
        errorMessage = "Sign in timed out. Please try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Sign in failed",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Signed in as {user.name || user.email || 'User'}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Force refresh auth status
            const refreshAuth = () => {
              console.log('Refreshing auth status...');
              const authStatus = checkAuthStatus();
              setIsAuthenticated(authStatus);
              setUser(getCurrentUser());
              onAuthChange?.(authStatus);
            };
            refreshAuth();
          }}
        >
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={handleSignIn}
      disabled={isLoading}
      className="bg-primary hover:bg-primary/90"
    >
      {isLoading ? "Signing in..." : "Sign in to Puter"}
    </Button>
  );
};
