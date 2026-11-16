import { CheckCircle2, Circle } from "lucide-react";
import { useData } from "../../app/data";
import { navigate, type Route } from "../../app/router";
import { PageHeader } from "../../components/common/PageHeader";
import { cn } from "../../components/ui/utils";
import { AgendaView } from "./AgendaView";
import { BookingDetailSheet } from "./BookingDetailSheet";
import { HistoryView } from "./HistoryView";
import { MonthView } from "./MonthView";
import { TaskActionsProvider } from "./TaskActions";

type View = "agenda" | "month" | "history";
const VIEWS: { value: View; label: string }[] = [
  { value: "agenda", label: "Agenda" },
  { value: "month", label: "Month" },
  { value: "history", label: "History" },
];
const VIEW_KEY = "omnibooker:bookings-view";

function rememberedView(): View {
  try {
    const saved = window.localStorage.getItem(VIEW_KEY);
    return VIEWS.some((v) => v.value === saved) ? (saved as View) : "agenda";
  } catch {
    return "agenda";
  }
}

/** The home screen: what's coming up (or what's happened). Bookings that need a decision stand out in place. */
export function BookingsPage({ route }: { route: Route }) {
  const { slots } = useData();
  const requested = route.query.get("view");
  const view: View = VIEWS.some((v) => v.value === requested) ? (requested as View) : rememberedView();
  const taskId = route.segments[1] ? Number(route.segments[1]) : null;

  const setView = (next: View) => {
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignore
    }
    navigate(`/bookings?view=${next}`, { replace: true });
  };

  return (
    <TaskActionsProvider>
      <PageHeader title="Bookings" description="What needs you, and what's coming up." />

      {slots.length === 0 ? (
        <GettingStarted />
      ) : (
        <>
          <div role="tablist" aria-label="Bookings view" className="mb-4 grid grid-cols-3 rounded-lg bg-gray-100 p-1">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                role="tab"
                type="button"
                aria-selected={view === v.value}
                onClick={() => setView(v.value)}
                className={cn(
                  "h-9 rounded-md text-sm font-medium transition-colors",
                  view === v.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === "agenda" && <AgendaView />}
          {view === "month" && <MonthView />}
          {view === "history" && <HistoryView />}
        </>
      )}

      {taskId != null && Number.isFinite(taskId) && <BookingDetailSheet taskId={taskId} />}
    </TaskActionsProvider>
  );
}

/** First-run checklist, worked out from what's already set up. */
function GettingStarted() {
  const { providers, slots, destinations, isAuthenticated } = useData();
  const steps = [
    {
      done: providers.length > 0,
      title: "Add a provider",
      detail: "Your Better or ClubSpark login, so bookings can be made for you.",
      path: "/providers?add=1",
    },
    {
      done: slots.length > 0,
      title: "Add a session",
      detail: "When you want to play, and when booking opens.",
      path: "/sessions?add=1",
    },
    {
      done: destinations.length > 0,
      title: "Link Discord (optional)",
      detail: "Get booking updates and keep or cancel bookings from Discord.",
      path: "/settings",
    },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <h3 className="text-base font-semibold text-gray-900">Get set up</h3>
      <p className="mt-0.5 text-sm text-gray-600">
        {isAuthenticated ? "Three steps and your courts book themselves." : "Log in to set up your own bookings."}
      </p>
      <ol className="mt-4 space-y-2">
        {steps.map((step) => {
          const Icon = step.done ? CheckCircle2 : Circle;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => navigate(step.path)}
                className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-gray-50"
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", step.done ? "text-green-600" : "text-gray-300")} />
                <span className="min-w-0">
                  <span className={cn("block font-medium", step.done ? "text-gray-500 line-through" : "text-gray-900")}>{step.title}</span>
                  <span className="block text-sm text-gray-500">{step.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
