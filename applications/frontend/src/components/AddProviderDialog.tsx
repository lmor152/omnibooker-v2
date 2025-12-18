import { useEffect, useState } from "react";
import type { Provider, ProviderInput, ProviderType } from "../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import { CreditCard, AlertTriangle } from "lucide-react";
import { Separator } from "./ui/separator";

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: ProviderInput, providerId?: number) => Promise<void>;
  mode?: "create" | "edit";
  provider?: Provider;
}

const defaultProvider: ProviderInput = {
  name: "",
  type: "Clubspark",
  credentials: {
    username: "",
    password: "",
    additionalInfo: "",
    cardDetails: undefined,
  },
};

// Providers that require card details for booking
const PROVIDERS_REQUIRING_CARD_DETAILS: ProviderType[] = ["Clubspark"];

const requiresCardDetails = (providerType: ProviderType): boolean => {
  return PROVIDERS_REQUIRING_CARD_DETAILS.includes(providerType);
};

export function AddProviderDialog({ open, onOpenChange, onSave, mode = "create", provider }: AddProviderDialogProps) {
  const [form, setForm] = useState<ProviderInput>(defaultProvider);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider && open) {
      setForm({
        name: provider.name,
        type: provider.type,
        credentials: {
          username: provider.credentials.username,
          password: provider.credentials.password,
          additionalInfo: provider.credentials.additionalInfo ?? "",
          cardDetails: provider.credentials.cardDetails
            ? {
                cardNumber: provider.credentials.cardDetails.cardNumber,
                expiryDate: provider.credentials.cardDetails.expiryDate,
                cvc: provider.credentials.cardDetails.cvc,
              }
            : undefined,
        },
      });
    } else if (open) {
      setForm({
        name: defaultProvider.name,
        type: defaultProvider.type,
        credentials: { 
          ...defaultProvider.credentials,
          cardDetails: requiresCardDetails(defaultProvider.type) 
            ? { cardNumber: "", expiryDate: "", cvc: "" }
            : undefined,
        },
      });
    }
  }, [provider, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.credentials.username || !form.credentials.password) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave(
        {
          ...form,
          credentials: {
            ...form.credentials,
            additionalInfo: form.credentials.additionalInfo || undefined,
            cardDetails: form.credentials.cardDetails && 
              form.credentials.cardDetails.cardNumber && 
              form.credentials.cardDetails.expiryDate && 
              form.credentials.cardDetails.cvc
                ? form.credentials.cardDetails
                : undefined,
          },
        },
        provider?.id,
      );
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save provider";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProviderTypeChange = (newType: ProviderType) => {
    setForm((prev) => ({
      ...prev,
      type: newType,
      credentials: {
        ...prev.credentials,
        cardDetails: requiresCardDetails(newType)
          ? prev.credentials.cardDetails || { cardNumber: "", expiryDate: "", cvc: "" }
          : undefined,
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Provider Profile" : "Edit Provider"}</DialogTitle>
          <DialogDescription>Enter your credentials for a booking platform</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Profile Name</Label>
            <Input
              id="name"
              placeholder="e.g., My Tennis Club"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Provider Type</Label>
            <Select
              value={form.type}
              onValueChange={handleProviderTypeChange}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Clubspark">Clubspark</SelectItem>
                <SelectItem value="Better">Better</SelectItem>
                <SelectItem value="Gymbox">Gymbox</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username / Email</Label>
            <Input
              id="username"
              placeholder="your.email@example.com"
              value={form.credentials.username}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credentials: { ...prev.credentials, username: e.target.value },
                }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={form.credentials.password}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credentials: { ...prev.credentials, password: e.target.value },
                }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="additionalInfo">Additional Information (Optional)</Label>
            <Textarea
              id="additionalInfo"
              placeholder="e.g., Member ID, Club name, etc."
              value={form.credentials.additionalInfo ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credentials: { ...prev.credentials, additionalInfo: e.target.value },
                }))
              }
              rows={3}
            />
          </div>

          {/* Card Details Section - Conditional based on provider type */}
          {requiresCardDetails(form.type) && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <h3 className="font-medium">Payment Card Details</h3>
                </div>
                
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>Security recommendation:</strong> Please use a virtual card with a spending limit for this provider.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="cardNumber">Card Number</Label>
                  <Input
                    id="cardNumber"
                    placeholder="1234 5678 9012 3456"
                    value={form.credentials.cardDetails?.cardNumber ?? ""}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\s/g, "");
                      setForm((prev) => ({
                        ...prev,
                        credentials: {
                          ...prev.credentials,
                          cardDetails: {
                            ...prev.credentials.cardDetails,
                            cardNumber: value,
                            expiryDate: prev.credentials.cardDetails?.expiryDate ?? "",
                            cvc: prev.credentials.cardDetails?.cvc ?? "",
                          },
                        },
                      }));
                    }}
                    maxLength={19}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiryDate">Expiry Date (MM/YY)</Label>
                    <Input
                      id="expiryDate"
                      placeholder="MM/YY"
                      value={form.credentials.cardDetails?.expiryDate ?? ""}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, "");
                        if (value.length >= 2) {
                          value = value.slice(0, 2) + "/" + value.slice(2, 4);
                        }
                        setForm((prev) => ({
                          ...prev,
                          credentials: {
                            ...prev.credentials,
                            cardDetails: {
                              ...prev.credentials.cardDetails,
                              cardNumber: prev.credentials.cardDetails?.cardNumber ?? "",
                              expiryDate: value,
                              cvc: prev.credentials.cardDetails?.cvc ?? "",
                            },
                          },
                        }));
                      }}
                      maxLength={5}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cvc">CVC</Label>
                    <Input
                      id="cvc"
                      type="password"
                      placeholder="123"
                      value={form.credentials.cardDetails?.cvc ?? ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setForm((prev) => ({
                          ...prev,
                          credentials: {
                            ...prev.credentials,
                            cardDetails: {
                              ...prev.credentials.cardDetails,
                              cardNumber: prev.credentials.cardDetails?.cardNumber ?? "",
                              expiryDate: prev.credentials.cardDetails?.expiryDate ?? "",
                              cvc: value,
                            },
                          },
                        }));
                      }}
                      maxLength={4}
                      required
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : mode === "create" ? "Add Provider" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
