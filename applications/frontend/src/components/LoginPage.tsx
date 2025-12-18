import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Calendar, Lock, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";

export function LoginPage() {
  const { loginWithRedirect, isLoading, error } = useAuth0();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLocalError(null);
    try {
      await loginWithRedirect();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Unable to sign in");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Calendar className="w-10 h-10 text-blue-600" />
            <h1 className="text-4xl">Omnibooker</h1>
          </div>
          <p className="text-gray-600">
            Automate your booking tasks across all platforms
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Use your Auth0 account to manage your automated bookings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                You&apos;ll be redirected to Auth0 to complete the secure login flow.
              </p>
              <Button type="button" className="w-full" disabled={isLoading} onClick={handleLogin}>
                <Lock className="w-4 h-4 mr-2" />
                {isLoading ? "Redirecting..." : "Continue with Auth0"}
              </Button>
            </div>
            {(error || localError) && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error?.message ?? localError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
