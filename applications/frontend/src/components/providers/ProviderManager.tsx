import { useState } from "react";
import { Plus, Edit2, Trash2, CalendarCog } from "lucide-react";
import type { Provider, ProviderInput } from "../../types";
import { ProviderModal } from "./ProviderModal";

interface ProviderManagerProps {
  providers: Provider[];
  onAddProvider: (provider: ProviderInput) => Promise<void>;
  onUpdateProvider: (id: number, updates: Partial<ProviderInput>) => Promise<void>;
  onDeleteProvider: (id: number) => Promise<void>;
}

export function ProviderManager({
  providers,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
}: ProviderManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  const handleAddProvider = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };

  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };

  const handleDeleteProvider = async (providerId: number) => {
    if (
      confirm(
        "Are you sure you want to delete this provider? This will affect all associated booking sessions."
      )
    ) {
      try {
        await onDeleteProvider(providerId);
      } catch (error) {
        // Error is handled by parent
      }
    }
  };

  const handleSaveProvider = async (providerInput: ProviderInput) => {
    try {
      if (editingProvider) {
        await onUpdateProvider(editingProvider.id, providerInput);
      } else {
        await onAddProvider(providerInput);
      }
      setIsModalOpen(false);
    } catch (error) {
      // Error is handled by parent, rethrow to show in modal
      throw error;
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Providers</h2>
          <p className="text-gray-600">
            Manage the booking platforms that Bookie Monster uses to make reservations.
          </p>
        </div>
        <button
          onClick={handleAddProvider}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors self-start sm:self-auto font-medium"
        >
          <Plus className="w-5 h-5" />
          Add Provider
        </button>
      </div>

      {providers.length > 0 ? (
        <div className="grid gap-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={() => handleEditProvider(provider)}
              onDelete={() => handleDeleteProvider(provider.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CalendarCog className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-gray-800">No Providers Yet</h3>
          <p className="text-gray-600 mb-6">
            Add a booking platform to start automating your reservations!
          </p>
          <button
            onClick={handleAddProvider}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            Add First Provider
          </button>
        </div>
      )}

      {isModalOpen && (
        <ProviderModal
          provider={editingProvider}
          onSave={handleSaveProvider}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  onEdit,
  onDelete,
}: {
  provider: Provider;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const providerTypeColors: Record<string, string> = {
    Clubspark: "bg-blue-100 text-blue-700",
    Better: "bg-purple-100 text-purple-700",
    Gymbox: "bg-orange-100 text-orange-700",
    Other: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <div className="grid grid-cols-[auto,1fr] gap-3 items-start mb-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center flex-shrink-0 transform -rotate-6">
              <CalendarCog className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h4 className="text-lg font-semibold text-gray-800">{provider.name}</h4>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                    providerTypeColors[provider.type] || providerTypeColors.Other
                  }`}
                >
                  {provider.type}
                </span>
              </div>
              <p className="text-sm text-gray-600">Booking platform provider</p>
            </div>
          </div>

          {/* Configuration details */}
          <div className="mt-4 text-sm text-gray-600 space-y-1">
            <div>
              <span className="text-gray-500">Username:</span> {provider.credentials.username}
            </div>
            {provider.credentials.additionalInfo && (
              <div>
                <span className="text-gray-500">Info:</span> {provider.credentials.additionalInfo}
              </div>
            )}
            {provider.credentials.cardDetails && (
              <div className="flex items-center gap-1 text-green-600">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                <span>Card details configured</span>
              </div>
            )}
            {provider.credentials.cardCvc && (
              <div className="flex items-center gap-1 text-purple-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11V7m0 8h.01M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"
                  />
                </svg>
                <span>Card security code stored</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
          >
            <Edit2 className="w-4 h-4" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
