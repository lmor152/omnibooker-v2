import type { Provider } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Trash2, Eye, EyeOff, Pencil, CreditCard } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface ProviderCardProps {
  provider: Provider;
  onDelete: (id: number) => Promise<void>;
  onEdit?: (provider: Provider) => void;
}

export function ProviderCard({ provider, onDelete, onEdit }: ProviderCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getProviderIcon = (type: string) => {
    const icons: Record<string, string> = {
      Clubspark: '🎾',
      Better: '🏊',
      Gymbox: '🏋️',
      Other: '📅',
    };
    return icons[type] || '📅';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getProviderIcon(provider.type)}</span>
              <div>
                <CardTitle className="text-lg">{provider.name}</CardTitle>
                <Badge variant="secondary" className="mt-1">
                  {provider.type}
                </Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit?.(provider)}
              >
                <Pencil className="w-4 h-4 text-gray-700" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Username</p>
            <p className="text-sm">{provider.credentials.username}</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-gray-600">Password</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
              </Button>
            </div>
            <p className="text-sm font-mono">
              {showPassword ? provider.credentials.password : '••••••••'}
            </p>
          </div>
          {provider.credentials.additionalInfo && (
            <div>
              <p className="text-sm text-gray-600">Additional Info</p>
              <p className="text-sm">{provider.credentials.additionalInfo}</p>
            </div>
          )}
          {provider.credentials.cardDetails && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CreditCard className="w-4 h-4" />
                <span>Payment card on file</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Card ending in ••{provider.credentials.cardDetails.cardNumber.slice(-4)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the provider profile "{provider.name}" and all associated
              booking slots. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsDeleting(true);
                try {
                  await onDelete(provider.id);
                  setShowDeleteDialog(false);
                } catch (err) {
                  console.error("Failed to delete provider", err);
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
