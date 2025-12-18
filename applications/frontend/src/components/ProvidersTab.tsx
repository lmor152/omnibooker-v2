import { useState } from "react";
import type { Provider, ProviderInput } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Plus } from "lucide-react";
import { ProviderCard } from "./ProviderCard";
import { AddProviderDialog } from "./AddProviderDialog";

interface ProvidersTabProps {
  providers: Provider[];
  onAddProvider: (provider: ProviderInput) => Promise<void>;
  onUpdateProvider: (id: number, provider: Partial<ProviderInput>) => Promise<void>;
  onDeleteProvider: (id: number) => Promise<void>;
}

export function ProvidersTab({ providers, onAddProvider, onUpdateProvider, onDeleteProvider }: ProvidersTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl">Provider Profiles</h2>
          <p className="text-gray-600">
            Manage your booking platform credentials
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No providers yet</CardTitle>
            <CardDescription>
              Add your first provider profile to start automating bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={setEditingProvider}
              onDelete={onDeleteProvider}
            />
          ))}
        </div>
      )}

      <AddProviderDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={(payload) => onAddProvider(payload)}
      />

      {editingProvider && (
        <AddProviderDialog
          open={Boolean(editingProvider)}
          onOpenChange={(open) => {
            if (!open) setEditingProvider(null);
          }}
          mode="edit"
          provider={editingProvider}
          onSave={(payload) => onUpdateProvider(editingProvider.id, payload)}
        />
      )}
    </div>
  );
}
