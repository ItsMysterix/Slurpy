"use client";

/**
 * RequireAuth - Client-side auth guard component
 * Wraps protected page content and ensures user is authenticated
 * Shows loading state and redirects to sign-in if not authenticated
 */

import { useAuth } from "@/lib/auth-hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Show loading spinner while auth is being determined
  if (!isLoaded) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-sage-50 to-mint-50 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-sage-500 mx-auto" />
          <p className="text-sm text-sage-600 dark:text-sage-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render protected content if not authenticated
  // The useEffect above will redirect them
  if (!isSignedIn) {
    return null;
  }

  return <>{children}</>;
}
