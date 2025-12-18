import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Dashboard } from "./components/Dashboard";
import type { User } from "./types";
import { fetchCurrentUser } from "./lib/api";

const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
const auth0ScopeParam = buildAuth0ScopeParam(import.meta.env.VITE_AUTH0_SCOPE);

export default function App() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    getAccessTokenSilently,
    loginWithRedirect,
    logout,
  } = useAuth0();

  const [user, setUser] = useState<User | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const getApiToken = useCallback(() => {
    return getAccessTokenSilently({
      authorizationParams: {
        ...(auth0Audience ? { audience: auth0Audience } : {}),
        scope: auth0ScopeParam,
      },
    });
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (authLoading || isAuthenticated || redirecting) {
      return;
    }

    const search = window.location.search;
    const hasAuthParams = /code=|error=/.test(search);
    if (hasAuthParams) {
      return;
    }

    setRedirecting(true);
    loginWithRedirect({
      authorizationParams: {
        redirect_uri: window.location.origin,
        ...(auth0Audience ? { audience: auth0Audience } : {}),
        scope: auth0ScopeParam,
      },
    }).catch((error) => {
      console.error("Auth0 login redirect failed", error);
      setUserError(error instanceof Error ? error.message : "Unable to sign in");
      setRedirecting(false);
    });
  }, [authLoading, isAuthenticated, loginWithRedirect, redirecting, auth0Audience]);

  useEffect(() => {
    let canceled = false;

    if (!isAuthenticated) {
      setUser(null);
      setUserLoading(false);
      setUserError(null);
      return () => {
        canceled = true;
      };
    }

    (async () => {
      setUserLoading(true);
      setUserError(null);
      try {
        const token = await getApiToken();
        const authenticatedUser = await fetchCurrentUser(token);
        if (!canceled) {
          setUser(authenticatedUser);
        }
      } catch (error) {
        if (!canceled) {
          const message = error instanceof Error ? error.message : "Unable to load user profile";
          setUserError(message);
        }
      } finally {
        if (!canceled) {
          setUserLoading(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isAuthenticated, getApiToken]);

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  if (authLoading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading your dashboard...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          {redirecting ? "Redirecting to Auth0..." : "Preparing secure login..."}
        </p>
      </div>
    );
  }

  if (authError || userError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
        <p className="text-red-600 mb-4">{authError?.message ?? userError ?? "Authentication error"}</p>
        <button
          type="button"
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Dashboard user={user} getAccessToken={getApiToken} onLogout={handleLogout} />
    </div>
  );
}

function buildAuth0ScopeParam(customScope?: string): string {
  const requiredScopes = ["openid", "profile", "email"];
  const merged = new Set<string>(requiredScopes);
  if (customScope) {
    customScope
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
      .forEach((scope) => merged.add(scope));
  }
  return Array.from(merged).join(" ");
}