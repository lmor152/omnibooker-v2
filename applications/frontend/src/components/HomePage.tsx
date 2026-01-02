import { Calendar, CalendarCheck, CalendarCog, CalendarSync, CheckCircle } from "lucide-react";

interface HomePageProps {
  onNavigateToDashboard: () => void;
  onLogin: () => void;
  onLogout: () => void;
  isAuthenticated: boolean;
  userName?: string;
}

export function HomePage({ onNavigateToDashboard, onLogin, onLogout, isAuthenticated, userName }: HomePageProps) {
  const displayName = userName?.trim();
  const userInitial = displayName?.charAt(0)?.toUpperCase();
  const accountButtonLabel = isAuthenticated ? "Logout" : "Log in";
  const accountButtonAction = isAuthenticated ? onLogout : onLogin;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl overflow-hidden border border-green-100 shadow-sm transform -rotate-3 bg-white flex items-center justify-center">
                <img src="/favicon.png" alt="Bookie Monster" className="w-9 h-9 object-contain" />
              </div>
              <h1 className="text-green-700 text-2xl font-bold">Bookie Monster</h1>
            </div>
            <div className="flex items-center gap-3">
              {displayName && (
                <div className="flex items-center gap-2 border border-gray-200 rounded-full bg-white px-3 py-1.5 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold">
                    {userInitial}
                  </div>
                  <div className="hidden sm:flex flex-col leading-tight">
                    <span className="text-[11px] uppercase tracking-wide text-gray-400">Signed in</span>
                    <span className="text-sm font-medium text-gray-800">{displayName}</span>
                  </div>
                </div>
              )}
              <button
                onClick={accountButtonAction}
                className="px-4 py-2 border border-gray-200 rounded-full bg-white text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
              >
                {accountButtonLabel}
              </button>
              <button
                onClick={onNavigateToDashboard}
                className="px-6 py-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-green-50/30 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <p className="text-sm uppercase tracking-[0.2em] text-green-600 mb-4">
                Automated booking assistant
              </p>
              <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-green-800">
                Never Miss a Booking Again
              </h2>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto lg:mx-0">
                Bookie Monster automatically books your favourite recurring sessions: tennis courts,
                gym classes, and more. Set it once, and let the monster handle the rest!
              </p>
              <div className="flex justify-center lg:justify-start">
                <button
                  onClick={onNavigateToDashboard}
                  className="px-10 py-4 bg-green-600 text-white rounded-full hover:bg-green-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl text-lg font-semibold"
                >
                  Start
                </button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <img
                  src="/images/welcome.png"
                  alt="Illustration of automated booking"
                  className="w-full max-w-md rounded-[2.5rem] shadow-2xl"
                />
                <div className="absolute -top-6 -left-6 w-24 h-24 bg-green-200 rounded-3xl opacity-60 blur-xl" />
                <div className="absolute -bottom-8 -right-10 w-32 h-32 bg-green-400 rounded-full opacity-20" />
              </div>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-green-200 rounded-2xl opacity-20 transform rotate-12 -z-10 hidden md:block" />
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-green-300 rounded-3xl opacity-20 transform -rotate-6 -z-10 hidden md:block" />
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-center mb-12 text-gray-800">
            How Bookie Monster Works
          </h3>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            <FeatureCard
              icon={<CalendarCog className="w-8 h-8" />}
              title="Connect Your Providers"
              description="Add your booking platforms like Clubspark or Gymbox. Configure them once with your preferences."
              step="1"
            />
            <FeatureCard
              icon={<CalendarSync className="w-8 h-8" />}
              title="Create Booking Sessions"
              description="Set up recurring sessions - tennis every Monday, pilates every Wednesday, or whatever fits your schedule."
              step="2"
            />
            <FeatureCard
              icon={<CalendarCheck className="w-8 h-8" />}
              title="Automatic Bookings"
              description="Bookie Monster automatically books your sessions at the right time, every time. Just show up and enjoy!"
              step="3"
            />
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-green-50/50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-6 text-gray-800">
                Why Use Bookie Monster?
              </h3>
              <div className="space-y-4">
                <BenefitItem
                  icon={<CheckCircle className="w-6 h-6 text-green-600" />}
                  text="Never forget to book your favourite sessions"
                />
                <BenefitItem
                  icon={<CheckCircle className="w-6 h-6 text-green-600" />}
                  text="Book at the exact moment slots become available"
                />
                <BenefitItem
                  icon={<CheckCircle className="w-6 h-6 text-green-600" />}
                  text="Set flexible booking strategies for optimal success"
                />
                <BenefitItem
                  icon={<CheckCircle className="w-6 h-6 text-green-600" />}
                  text="Manage all your recurring bookings in one place"
                />
              </div>
              <button
                onClick={onNavigateToDashboard}
                className="mt-8 px-8 py-4 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors font-medium"
              >
                Get Started Now
              </button>
            </div>

            <div className="relative">
              <div className="bg-gradient-to-br from-green-100 to-green-50 rounded-3xl p-8 shadow-xl">
                <div className="space-y-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Monday Tennis</p>
                        <p className="text-sm text-gray-600">Active</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Wednesday Pilates</p>
                        <p className="text-sm text-gray-600">Active</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">Friday Gym</p>
                        <p className="text-sm text-gray-600">Active</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-green-400 rounded-full opacity-20 -z-10" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-green-300 rounded-full opacity-20 -z-10" />
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  step,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  step: string;
}) {
  return (
    <div className="relative">
      <div className="absolute -top-4 -left-4 w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
        {step}
      </div>
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-4 text-green-600">
          {icon}
        </div>
        <h4 className="text-xl font-semibold mb-3 text-gray-800">{title}</h4>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function BenefitItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <p className="text-gray-700">{text}</p>
    </div>
  );
}
