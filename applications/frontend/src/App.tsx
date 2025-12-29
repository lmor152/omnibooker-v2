import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { HomePage } from "./components/HomePage";
import { Dashboard } from "./components/Dashboard";
import type { User } from "./types";
import { fetchCurrentUser } from "./lib/api";

const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
const auth0ScopeParam = buildAuth0ScopeParam(import.meta.env.VITE_AUTH0_SCOPE);

function buildAuth0ScopeParam(value?: string) {
  if (!value) return "openid profile email";
  return value
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .join(" ");
}

type AppView = "home" | "dashboard";

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
  const [currentView, setCurrentView] = useState<AppView>("home");

  const displayName = user?.fullName?.trim() || user?.email?.trim() || undefined;

  const getApiToken = useCallback(() => {
    return getAccessTokenSilently({
      authorizationParams: {
        ...(auth0Audience ? { audience: auth0Audience } : {}),
        scope: auth0ScopeParam,
      },
    });
  }, [getAccessTokenSilently]);

  // Auto-redirect to login if not authenticated
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
  }, [authLoading, isAuthenticated, loginWithRedirect, redirecting]);

  // Fetch user profile when authenticated
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

  const handleNavigateToDashboard = () => {
    setCurrentView("dashboard");
  };

  const handleNavigateToHome = () => {
    setCurrentView("home");
  };

  // Show loading state
  if (authLoading || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-green-50/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-red-50/30">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Authentication Error</h2>
          <p className="text-gray-600 mb-4">{authError.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-green-50/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-red-50/30">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Profile Error</h2>
          <p className="text-gray-600 mb-4">{userError}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={handleLogout}
              className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show appropriate view based on currentView state
  if (!isAuthenticated || !user) {
    return <HomePage onNavigateToDashboard={handleNavigateToDashboard} userName={displayName} />;
  }

  if (currentView === "home") {
    return <HomePage onNavigateToDashboard={handleNavigateToDashboard} userName={displayName} />;
  }

  return (
    <Dashboard
      user={user}
      getAccessToken={getApiToken}
      onLogout={handleLogout}
      onNavigateToHome={handleNavigateToHome}
    />
  );
}
