import { useState } from "react";
import { CalendarCog, ChevronDown, CreditCard, Edit2, Plus, Trash2 } from "lucide-react";
import type { Provider, ProviderInput } from "../../types";
import { ActionMenu } from "../common/ActionMenu";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { PageHeader } from "../common/PageHeader";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { ProviderModal } from "./ProviderModal";

interface ProviderManagerProps {
  providers: Provider[];
  onAddProvider: (provider: ProviderInput) => Promise<void>;
  onUpdateProvider: (id: number, updates: Partial<ProviderInput>) => Promise<void>;
  onDeleteProvider: (id: number) => Promise<void>;
  onTestProvider: (payload: {
    type: string;
    credentials: { username: string; password: string };
  }) => Promise<{ success: boolean; message: string }>;
}

export function ProviderManager({
  providers,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
  onTestProvider,
}: ProviderManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);

  const handleAddProvider = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };

  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };

  const handleDeleteProvider = async (providerId: number) => {
    try {
      await onDeleteProvider(providerId);
    } catch (error) {
      // Error is handled by parent
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
      <PageHeader
        title="Providers"
        description="Manage the booking platforms that Bookie Monster uses to make reservations."
        actions={
          <Button onClick={handleAddProvider}>
            <Plus className="w-4 h-4" />
            Add
          </Button>
        }
      />

      {providers.length > 0 ? (
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={() => handleEditProvider(provider)}
              onDelete={() => setDeletingProvider(provider)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 px-4 bg-white rounded-xl border border-gray-200">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CalendarCog className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold mb-1 text-gray-800">No providers yet</h3>
          <p className="text-gray-600 mb-5">Add a booking platform to start automating your reservations!</p>
          <Button size="lg" onClick={handleAddProvider}>
            <Plus className="w-5 h-5" />
            Add first provider
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deletingProvider !== null}
        onOpenChange={(open) => !open && setDeletingProvider(null)}
        title="Delete this provider?"
        description={
          deletingProvider
            ? `"${deletingProvider.name}" will be removed, along with all of its booking sessions and their tasks.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={() => deletingProvider && handleDeleteProvider(deletingProvider.id)}
      />

      {isModalOpen && (
        <ProviderModal
          provider={editingProvider}
          onSave={handleSaveProvider}
          onClose={() => setIsModalOpen(false)}
          onTest={onTestProvider}
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

  const [showDetails, setShowDetails] = useState(false);
  const cardStatus = provider.credentials.cardDetails
    ? "Card saved"
    : provider.credentials.cardCvc
      ? "Card CVC saved"
      : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 transform -rotate-6">
            <CalendarCog className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-800 truncate">{provider.name}</h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
              <span
                className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                  providerTypeColors[provider.type] || providerTypeColors.Other
                }`}
              >
                {provider.type}
              </span>
              {cardStatus && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <CreditCard className="h-3.5 w-3.5" />
                  {cardStatus}
                </span>
              )}
            </div>
          </div>
        </button>
        <ActionMenu
          items={[
            { label: "Edit", icon: Edit2, onSelect: onEdit },
            { label: "Delete", icon: Trash2, onSelect: onDelete, destructive: true },
          ]}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        aria-expanded={showDetails}
        className="mt-2 -mb-1 flex h-8 items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
      >
        Details
        <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
      </button>
      {showDetails && (
        <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Username</dt>
          <dd className="text-gray-800 break-all">{provider.credentials.username}</dd>
          {provider.credentials.additionalInfo && (
            <>
              <dt className="text-gray-500">Notes</dt>
              <dd className="text-gray-800 break-words">{provider.credentials.additionalInfo}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
