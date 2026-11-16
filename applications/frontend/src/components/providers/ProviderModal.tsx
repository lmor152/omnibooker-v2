import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Provider, ProviderInput, ProviderType } from "../../types";
import { Field } from "../common/Field";
import { FormSection } from "../common/FormSection";
import { FormSheet, FormSheetActions } from "../common/FormSheet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/utils";

interface ProviderModalProps {
  provider: Provider | null;
  onSave: (providerInput: ProviderInput) => Promise<void>;
  onClose: () => void;
  onTest: (payload: {
    type: string;
    credentials: { username: string; password: string };
    providerId?: number;
  }) => Promise<{ success: boolean; message: string }>;
}

const defaultProvider: ProviderInput = {
  name: "",
  type: "Clubspark",
  credentials: {
    username: "",
    password: "",
    additionalInfo: "",
    cardDetails: undefined,
    cardCvc: undefined,
  },
};

// Providers that require card details for booking
const PROVIDERS_REQUIRING_CARD_DETAILS: ProviderType[] = ["Clubspark"];
const PROVIDERS_REQUIRING_CVC: ProviderType[] = ["Better"];

const requiresCardDetails = (providerType: ProviderType): boolean => {
  return PROVIDERS_REQUIRING_CARD_DETAILS.includes(providerType);
};

const requiresCardCvc = (providerType: ProviderType): boolean => {
  return PROVIDERS_REQUIRING_CVC.includes(providerType);
};

type TestStatus = "idle" | "loading" | "success" | "error";

export function ProviderModal({ provider, onSave, onClose, onTest }: ProviderModalProps) {
  const [form, setForm] = useState<ProviderInput>(defaultProvider);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState<string>("");
  // Saved secrets never come back from the server; blank fields keep them.
  const stored = provider?.credentials;
  const [replaceCard, setReplaceCard] = useState(false);
  const editingCard = !stored?.card || replaceCard;

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name,
        type: provider.type,
        credentials: {
          username: provider.credentials.username,
          password: "",
          additionalInfo: provider.credentials.additionalInfo ?? "",
          cardDetails: undefined,
          cardCvc: "",
        },
      });
    } else {
      setForm({
        ...defaultProvider,
        credentials: {
          ...defaultProvider.credentials,
          cardDetails: requiresCardDetails(defaultProvider.type)
            ? { cardNumber: "", expiryDate: "", cvc: "" }
            : undefined,
          cardCvc: requiresCardCvc(defaultProvider.type) ? "" : undefined,
        },
      });
    }
  }, [provider]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.credentials.username || (!provider && !form.credentials.password)) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        ...form,
        credentials: {
          ...form.credentials,
          additionalInfo: form.credentials.additionalInfo ?? undefined,
          cardDetails:
            form.credentials.cardDetails &&
            form.credentials.cardDetails.cardNumber &&
            form.credentials.cardDetails.expiryDate &&
            form.credentials.cardDetails.cvc
              ? form.credentials.cardDetails
              : undefined,
          cardCvc: form.credentials.cardCvc?.trim()
            ? form.credentials.cardCvc.trim()
            : undefined,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save provider";
      setError(message);
      setIsSubmitting(false);
    }
  };

  const supportsTest = form.type === "Better" || form.type === "Clubspark";

  const handleTest = async () => {
    setTestStatus("loading");
    setTestMessage("");
    try {
      const result = await onTest({
        type: form.type,
        credentials: {
          username: form.credentials.username,
          password: form.credentials.password,
        },
        // Blank password while editing: the server tests with the saved one.
        providerId: provider?.id,
      });
      if (result.success) {
        setTestStatus("success");
        setTestMessage(result.message);
        setTimeout(() => setTestStatus("idle"), 4000);
      } else {
        setTestStatus("error");
        setTestMessage(result.message);
      }
    } catch {
      setTestStatus("error");
      setTestMessage("Failed to reach server");
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
        cardCvc: requiresCardCvc(newType)
          ? prev.credentials.cardCvc || ""
          : undefined,
      },
    }));
  };

  const setCredentials = (updates: Partial<ProviderInput["credentials"]>) =>
    setForm((prev) => ({ ...prev, credentials: { ...prev.credentials, ...updates } }));

  const setCard = (updates: Partial<NonNullable<ProviderInput["credentials"]["cardDetails"]>>) =>
    setForm((prev) => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        cardDetails: {
          cardNumber: prev.credentials.cardDetails?.cardNumber ?? "",
          expiryDate: prev.credentials.cardDetails?.expiryDate ?? "",
          cvc: prev.credentials.cardDetails?.cvc ?? "",
          ...updates,
        },
      },
    }));

  return (
    <FormSheet
      title={provider ? "Edit provider" : "Add provider"}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <FormSheetActions
          message={
            testStatus === "success" || testStatus === "error" ? (
              <p
                className={cn(
                  "text-sm font-medium text-center",
                  testStatus === "success" ? "text-green-600" : "text-red-600",
                )}
              >
                {testMessage}
              </p>
            ) : null
          }
        >
          <Button type="button" variant="outline" size="lg" onClick={onClose} className="hidden sm:inline-flex">
            Cancel
          </Button>
          {supportsTest && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleTest}
              disabled={testStatus === "loading" || !form.credentials.username || (!form.credentials.password && !stored?.hasPassword)}
            >
              {testStatus === "loading" ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Testing…
                </>
              ) : (
                "Test login"
              )}
            </Button>
          )}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : provider ? "Save changes" : "Add provider"}
          </Button>
        </FormSheetActions>
      }
    >
      <div className="space-y-5">
        <FormSection title="Account">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="provider-name" required>
              <Input
                id="provider-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., My Tennis Club"
                required
              />
            </Field>

            <Field label="Platform" htmlFor="provider-type" required>
              <NativeSelect
                id="provider-type"
                value={form.type}
                onChange={(e) => handleProviderTypeChange(e.target.value as ProviderType)}
              >
                <option value="Clubspark">Clubspark</option>
                <option value="Better">Better</option>
                <option value="Gymbox">Gymbox</option>
                <option value="Other">Other</option>
              </NativeSelect>
            </Field>
          </div>

          <Field label="Username / email" htmlFor="provider-username" required>
            <Input
              id="provider-username"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={form.credentials.username}
              onChange={(e) => setCredentials({ username: e.target.value })}
              placeholder="your.email@example.com"
              required
            />
          </Field>

          <Field
            label="Password"
            htmlFor="provider-password"
            required={!stored?.hasPassword}
            hint={stored?.hasPassword ? "Saved. Leave blank to keep it." : undefined}
          >
            <Input
              id="provider-password"
              type="password"
              autoComplete={stored ? "new-password" : "current-password"}
              value={form.credentials.password}
              onChange={(e) => setCredentials({ password: e.target.value })}
              placeholder={stored?.hasPassword ? "Unchanged" : "••••••••"}
              required={!stored?.hasPassword}
            />
          </Field>

          <Field label="Notes" htmlFor="provider-notes" optional>
            <Textarea
              id="provider-notes"
              value={form.credentials.additionalInfo ?? ""}
              onChange={(e) => setCredentials({ additionalInfo: e.target.value })}
              placeholder="e.g., Member ID, Club name, etc."
              rows={2}
            />
          </Field>
        </FormSection>

        {/* Card CVC Section - e.g. Better */}
        {requiresCardCvc(form.type) && (
          <FormSection
            title="Stored card"
            description="Better only needs the security code for the card saved in your account, to re-verify it at booking time."
          >
            <Field
              label="Card security code (CVC)"
              htmlFor="provider-card-cvc"
              required={!stored?.hasCardCvc}
              hint={stored?.hasCardCvc ? "Saved. Leave blank to keep it." : undefined}
            >
              <Input
                id="provider-card-cvc"
                type="password"
                inputMode="numeric"
                autoComplete="cc-csc"
                value={form.credentials.cardCvc ?? ""}
                onChange={(e) => setCredentials({ cardCvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                placeholder={stored?.hasCardCvc ? "•••" : "123"}
                maxLength={4}
                className="max-w-[8rem]"
                required={!stored?.hasCardCvc}
              />
            </Field>
          </FormSection>
        )}

        {/* Card Details Section - Conditional based on provider type */}
        {requiresCardDetails(form.type) && (
          <FormSection title="Payment card" description="Clubspark can't save cards, so these are entered at booking time.">
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">Use a virtual card with a spending limit for this provider.</p>
            </div>

            {stored?.card && !replaceCard ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm">
                <span className="text-gray-800">
                  Card ending <strong>{stored.card.last4}</strong>, expires {stored.card.expiryDate}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => setReplaceCard(true)}>
                  Replace card
                </Button>
              </div>
            ) : null}
            {editingCard && (
            <>
            <Field label="Card number" htmlFor="provider-card-number" required>
              <Input
                id="provider-card-number"
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                value={form.credentials.cardDetails?.cardNumber ?? ""}
                onChange={(e) => setCard({ cardNumber: e.target.value.replace(/\s/g, "") })}
                placeholder="1234 5678 9012 3456"
                maxLength={19}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry (MM/YY)" htmlFor="provider-card-expiry" required>
                <Input
                  id="provider-card-expiry"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={form.credentials.cardDetails?.expiryDate ?? ""}
                  onChange={(e) => {
                    let value = e.target.value.replace(/\D/g, "");
                    if (value.length >= 2) {
                      value = value.slice(0, 2) + "/" + value.slice(2, 4);
                    }
                    setCard({ expiryDate: value });
                  }}
                  placeholder="MM/YY"
                  maxLength={5}
                  required
                />
              </Field>

              <Field label="CVC" htmlFor="provider-card-cvc-full" required>
                <Input
                  id="provider-card-cvc-full"
                  type="password"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  value={form.credentials.cardDetails?.cvc ?? ""}
                  onChange={(e) => setCard({ cvc: e.target.value.replace(/\D/g, "") })}
                  placeholder="123"
                  maxLength={4}
                  required
                />
              </Field>
            </div>
            </>
            )}
          </FormSection>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </div>
    </FormSheet>
  );
}
