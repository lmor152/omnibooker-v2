import { useEffect, type ReactNode } from "react";
import { BookOpen, CalendarDays, CalendarSync, LogIn, LogOut, RefreshCw, Settings, Store } from "lucide-react";
import { Toaster, toast } from "sonner";
import { clearDataCache, DataProvider, useData } from "../app/data";
import { PullToRefresh } from "../app/PullToRefresh";
import { navigate, useRoute, type Route } from "../app/router";
import { BookingsPage } from "../features/bookings/BookingsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { ProviderManager } from "./providers/ProviderManager";
import { SessionManager } from "./sessions/SessionManager";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";
import { cn } from "./ui/utils";

interface DashboardProps {
  isAuthenticated: boolean;
  userName?: string;
  /** Stable per-account key for the offline cache (e.g. the user id). */
  userKey?: string;
  getAccessToken: () => Promise<string>;
  onLogin: () => void;
  onLogout: () => void;
  /** Set when showing demo data to a logged-out visitor; returns them to the home page. */
  onExitPreview?: () => void;
}

type Tab = "bookings" | "sessions" | "providers";

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "bookings", label: "Bookings", icon: CalendarDays },
  { id: "sessions", label: "Sessions", icon: CalendarSync },
  { id: "providers", label: "Providers", icon: Store },
];

/** The signed-in app (or the demo): data store, header, navigation and the current page. */
export function Dashboard(props: DashboardProps) {
  return (
    <DataProvider
      key={props.isAuthenticated ? props.userKey ?? "user" : "demo"}
      isAuthenticated={props.isAuthenticated}
      userKey={props.userKey}
      getAccessToken={props.getAccessToken}
    >
      <Shell {...props} />
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: "mt-[env(safe-area-inset-top)]" }} />
    </DataProvider>
  );
}

function Shell({ isAuthenticated, userName, onLogin, onLogout, onExitPreview }: DashboardProps) {
  const route = useRoute();
  const data = useData();
  const section = route.segments[0];
  const activeTab: Tab | null = section === "sessions" || section === "providers" ? section : section === "settings" ? null : "bookings";

  // A tapped notification asks an already-open app to show its booking.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "open" || typeof event.data.url !== "string") return;
      const target = new URL(event.data.url, window.location.origin);
      if (target.origin !== window.location.origin) return;
      navigate(target.hash.replace(/^#/, "") || "/bookings");
      data.refresh().catch(() => null);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [data.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = () => {
    clearDataCache();
    onLogout();
  };

  const refresh = () => {
    data.refresh().catch(() => null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF8]">
      <Header
        isAuthenticated={isAuthenticated}
        userName={userName}
        isRefreshing={data.isRefreshing}
        onRefresh={refresh}
        onLogin={onLogin}
        onLogout={logout}
        onExitPreview={onExitPreview}
      />

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] px-safe sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
        {data.loadError && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="min-w-0 flex-1 break-words">
              Couldn't refresh: {data.loadError}
              {!data.isLoading && <span className="text-red-700/80"> Showing what was loaded last.</span>}
            </p>
            <button type="button" onClick={refresh} className="shrink-0 font-medium underline">
              Retry
            </button>
          </div>
        )}
        {!isAuthenticated && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Preview with demo data. Log in to manage your own bookings.
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
          <SideNav activeTab={activeTab} settingsActive={section === "settings"} />
          <main className="min-w-0">
            {data.isLoading ? <PageSkeleton /> : <Page route={route} userName={userName} onLogin={onLogin} onLogout={logout} />}
          </main>
        </div>
      </div>

      <BottomNav activeTab={activeTab} />
      {isAuthenticated && <PullToRefresh onRefresh={data.refresh} />}
    </div>
  );
}

/** Wraps a store action so failures show a toast (pages also show errors inline where they have a form). */
function withToast<A extends unknown[]>(action: (...args: A) => Promise<void>, success?: string) {
  return async (...args: A) => {
    try {
      await action(...args);
      if (success) toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      throw error;
    }
  };
}

function Page({
  route,
  userName,
  onLogin,
  onLogout,
}: {
  route: Route;
  userName?: string;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const data = useData();
  const section = route.segments[0];
  const pageKey = `${section}?${route.query.toString()}`;

  if (section === "sessions") {
    const edit = route.query.get("edit");
    return (
      <SessionManager
        key={pageKey}
        bookingSlots={data.slots}
        bookingTasks={data.tasks}
        providers={data.providers}
        destinations={data.destinations}
        preferences={data.preferences}
        onAddSlot={withToast(data.addSlot)}
        onUpdateSlot={withToast(data.updateSlot)}
        onDeleteSlot={withToast(data.deleteSlot, "Session deleted")}
        onResyncSlot={withToast(data.resyncSlot, "Upcoming dates rescheduled")}
        onTestSlot={data.testSlot}
        initialEditId={edit ? Number(edit) : null}
        initialAdd={route.query.get("add") === "1"}
      />
    );
  }
  if (section === "providers") {
    return (
      <ProviderManager
        key={pageKey}
        providers={data.providers}
        onAddProvider={withToast(data.addProvider)}
        onUpdateProvider={withToast(data.updateProvider)}
        onDeleteProvider={withToast(data.deleteProvider, "Provider deleted")}
        onTestProvider={data.testProvider}
        initialAdd={route.query.get("add") === "1"}
      />
    );
  }
  if (section === "settings") {
    return <SettingsPage route={route} userName={userName} onLogin={onLogin} onLogout={onLogout} />;
  }
  return <BookingsPage route={route} />;
}

function Header({
  isAuthenticated,
  userName,
  isRefreshing,
  onRefresh,
  onLogin,
  onLogout,
  onExitPreview,
}: {
  isAuthenticated: boolean;
  userName?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onExitPreview?: () => void;
}) {
  const brand = (
    <>
      <div className="flex h-9 w-9 -rotate-3 transform items-center justify-center overflow-hidden rounded-xl border border-green-100 bg-white shadow-sm">
        <img src="/favicon.png" alt="" className="h-6 w-6 object-contain" />
      </div>
      <h1 className="text-lg font-bold text-green-700 sm:text-xl">Bookie Monster</h1>
    </>
  );

  return (
    <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 pt-safe px-safe backdrop-blur-sm">
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {onExitPreview ? (
          <button
            type="button"
            onClick={onExitPreview}
            className="-m-1 flex items-center gap-2.5 rounded-xl p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            aria-label="Back to home"
          >
            {brand}
          </button>
        ) : (
          <button type="button" onClick={() => navigate("/bookings")} className="flex items-center gap-2.5" aria-label="Bookings">
            {brand}
          </button>
        )}

        {isAuthenticated ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="hidden h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-green-700 disabled:opacity-50 sm:flex"
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                className="flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                aria-label="Account and settings"
              >
                <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                  {userName?.charAt(0)?.toUpperCase() ?? "?"}
                  {isRefreshing && (
                    <span className="absolute inset-0 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                  )}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[13rem] rounded-xl border-gray-200 bg-white p-1 shadow-lg">
                {userName && (
                  <>
                    <DropdownMenuLabel className="px-3 py-2">
                      <span className="block text-[11px] font-normal uppercase tracking-wide text-gray-400">Signed in as</span>
                      <span className="block truncate text-sm font-medium text-gray-800">{userName}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-gray-100" />
                  </>
                )}
                <MenuItem icon={<Settings className="h-4 w-4" />} onSelect={() => navigate("/settings")}>
                  Settings
                </MenuItem>
                <MenuItem icon={<BookOpen className="h-4 w-4" />} onSelect={() => navigate("/settings/guides")}>
                  Guides
                </MenuItem>
                <MenuItem icon={<RefreshCw className="h-4 w-4" />} onSelect={onRefresh} disabled={isRefreshing}>
                  Refresh
                </MenuItem>
                <DropdownMenuSeparator className="bg-gray-100" />
                <DropdownMenuItem onSelect={onLogout} className="min-h-10 gap-3 px-3 text-red-600 focus:bg-red-50 focus:text-red-700">
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={onLogin}
              className="flex h-10 items-center gap-2 rounded-full bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <LogIn className="h-4 w-4" />
              Log in
            </button>
          </div>
        )}
      </header>
    </div>
  );
}

function MenuItem({
  icon,
  onSelect,
  disabled,
  children,
}: {
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled} className="min-h-10 gap-3 px-3 text-gray-700">
      {icon}
      {children}
    </DropdownMenuItem>
  );
}

/** Desktop sidebar. */
function SideNav({ activeTab, settingsActive }: { activeTab: Tab | null; settingsActive: boolean }) {
  return (
    <aside className="hidden lg:block">
      <nav className="sticky top-24 flex flex-col gap-1" aria-label="Main">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(`/${id}`)}
            aria-current={activeTab === id ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors",
              activeTab === id ? "bg-green-50 font-medium text-green-700" : "text-gray-700 hover:bg-gray-100",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
        <div className="my-2 border-t border-gray-200" />
        <button
          type="button"
          onClick={() => navigate("/settings")}
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-4 py-2.5 text-left transition-colors",
            settingsActive ? "bg-green-50 font-medium text-green-700" : "text-gray-700 hover:bg-gray-100",
          )}
        >
          <Settings className="h-5 w-5" />
          Settings
        </button>
      </nav>
    </aside>
  );
}

/** Phone/tablet tab bar, pinned to the bottom within thumb reach. */
function BottomNav({ activeTab }: { activeTab: Tab | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] px-safe backdrop-blur-sm lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-3">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                navigate(`/${id}`);
                window.scrollTo({ top: 0 });
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                active ? "text-green-700" : "text-gray-500 hover:text-gray-800",
              )}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-green-100")}>
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-8 w-40 bg-gray-200" />
      <Skeleton className="h-20 w-full rounded-xl bg-gray-200" />
      <Skeleton className="h-10 w-full rounded-lg bg-gray-200" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl bg-gray-200" />
      ))}
    </div>
  );
}
