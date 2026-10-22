import { Calendar, CalendarCheck, CalendarCog, CalendarSync, CheckCircle } from "lucide-react";

interface HomePageProps {
  onLogin: () => void;
  onPreview: () => void;
}

/** Landing page, shown only to logged-out visitors. */
export function HomePage({ onLogin, onPreview }: HomePageProps) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50 pt-safe px-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl overflow-hidden border border-green-100 shadow-sm transform -rotate-3 bg-white flex items-center justify-center shrink-0">
              <img src="/favicon.png" alt="" className="w-6 h-6 sm:w-8 sm:h-8 object-contain" />
            </div>
            <h1 className="text-green-700 text-lg sm:text-2xl font-bold truncate">Bookie Monster</h1>
          </div>
          <button
            onClick={onLogin}
            className="shrink-0 h-10 px-5 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Log in
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-green-50/30 py-10 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-green-600 mb-3 sm:mb-4">
                Automated booking assistant
              </p>
              <h2 className="text-3xl sm:text-5xl font-bold mb-4 sm:mb-6 text-green-800">
                Never Miss a Booking Again
              </h2>
              <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0">
                Bookie Monster automatically books your favourite recurring sessions: tennis courts,
                gym classes, and more. Set it once, and let the monster handle the rest!
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <button
                  onClick={onLogin}
                  className="w-full sm:w-auto px-10 py-3.5 bg-green-600 text-white rounded-full hover:bg-green-700 transition-all shadow-lg hover:shadow-xl text-lg font-semibold"
                >
                  Log in
                </button>
                <button
                  onClick={onPreview}
                  className="w-full sm:w-auto px-6 py-3 text-green-700 font-medium rounded-full hover:bg-green-50 transition-colors"
                >
                  Preview the dashboard
                </button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <img
                  src="/images/welcome.png"
                  alt="Illustration of automated booking"
                  className="w-full max-w-xs sm:max-w-md rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl"
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
      <section className="py-12 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-2xl sm:text-3xl font-bold text-center mb-10 sm:mb-12 text-gray-800">
            How Bookie Monster Works
          </h3>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12 px-2 sm:px-0">
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
      <section className="overflow-hidden py-12 sm:py-24 bg-gradient-to-b from-green-50/50 to-white pb-[max(3rem,env(safe-area-inset-bottom))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">
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
                onClick={onLogin}
                className="mt-8 w-full sm:w-auto px-8 py-3.5 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors font-medium"
              >
                Get Started Now
              </button>
            </div>

            <div className="relative hidden md:block">
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
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
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
