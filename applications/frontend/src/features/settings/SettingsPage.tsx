import { ChevronLeft, ChevronRight, FileText, LogIn, LogOut, UserRound } from "lucide-react";
import { guides } from "../../guides";
import { useData } from "../../app/data";
import { navigate, type Route } from "../../app/router";
import { PageHeader } from "../../components/common/PageHeader";
import { GuidesTab } from "../../components/guides/GuidesTab";
import { NotificationSettings } from "../../components/settings/NotificationSettings";
import { PushSettings } from "../../components/settings/PushSettings";
import { Button } from "../../components/ui/button";

/** Everything you set up once: account, Discord and confirmation defaults, and the guides. */
export function SettingsPage({
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

  if (route.segments[1] === "guides") {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="-ml-2 mb-2 flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </button>
        <GuidesTab
          slug={route.segments[2]}
          onSelect={(slug) => navigate(`/settings/guides/${encodeURIComponent(slug)}`, { replace: true })}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <section className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-gray-900">{data.isAuthenticated ? userName ?? "Signed in" : "Not signed in"}</p>
            <p className="text-sm text-gray-500">{data.isAuthenticated ? "Your bookings sync across devices." : "You're looking at demo data."}</p>
          </div>
          {data.isAuthenticated ? (
            <Button variant="outline" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          ) : (
            <Button onClick={onLogin}>
              <LogIn className="h-4 w-4" />
              Log in
            </Button>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-base font-semibold text-gray-800">Notifications &amp; confirmations</h3>
          <p className="mb-3 text-sm text-gray-600">
            Get booking updates on your phone or in Discord. Unconfirmed bookings can be cancelled automatically while they're still
            refundable.
          </p>
          {data.isAuthenticated && (
            <div className="mb-4">
              <PushSettings getAccessToken={data.getAccessToken} />
            </div>
          )}
          <NotificationSettings
            isAuthenticated={data.isAuthenticated}
            getAccessToken={data.getAccessToken}
            destinations={data.destinations}
            onDestinationsChange={data.setDestinations}
            onPreferencesChange={data.setPreferences}
          />
        </section>

        <section>
          <h3 className="mb-3 text-base font-semibold text-gray-800">Guides</h3>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <button
                  type="button"
                  onClick={() => navigate(`/settings/guides/${encodeURIComponent(guide.slug)}`)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="flex-1">{guide.title}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
