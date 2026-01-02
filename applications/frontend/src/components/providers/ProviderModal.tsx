import { useEffect, useState } from "react";
import { X, AlertTriangle, CreditCard } from "lucide-react";
import type { Provider, ProviderInput, ProviderType } from "../../types";

interface ProviderModalProps {
  provider: Provider | null;
  onSave: (providerInput: ProviderInput) => Promise<void>;
  onClose: () => void;
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

export function ProviderModal({ provider, onSave, onClose }: ProviderModalProps) {
  const [form, setForm] = useState<ProviderInput>(defaultProvider);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
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
          cardCvc: provider.credentials.cardCvc ?? "",
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
    if (!form.name || !form.credentials.username || !form.credentials.password) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        ...form,
        credentials: {
          ...form.credentials,
          additionalInfo: form.credentials.additionalInfo || undefined,
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-xl font-bold text-gray-800">
            {provider ? "Edit Provider" : "Add Provider"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Provider Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., My Tennis Club"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          {/* Provider Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) => handleProviderTypeChange(e.target.value as ProviderType)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="Clubspark">Clubspark</option>
              <option value="Better">Better</option>
              <option value="Gymbox">Gymbox</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Username / Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username / Email <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.credentials.username}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credentials: { ...prev.credentials, username: e.target.value },
                }))
              }
              placeholder="your.email@example.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={form.credentials.password}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credentials: { ...prev.credentials, password: e.target.value },
                }))
              }
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          {/* Additional Information */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Information <span className="text-gray-500">(Optional)</span>
            </label>
            <textarea
              value={form.credentials.additionalInfo ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  credentials: { ...prev.credentials, additionalInfo: e.target.value },
                }))
              }
              placeholder="e.g., Member ID, Club name, etc."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Card CVC Section - e.g. Better */}
          {requiresCardCvc(form.type) && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <h4 className="font-semibold text-gray-800">Stored Card Verification</h4>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Better only needs the security code for the card already saved in your account.
                This is used at booking time to re-verify the card with Opayo.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Security Code (CVC) <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={form.credentials.cardCvc ?? ""}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    setForm((prev) => ({
                      ...prev,
                      credentials: { ...prev.credentials, cardCvc: value.slice(0, 4) },
                    }));
                  }}
                  placeholder="123"
                  maxLength={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          )}

          {/* Card Details Section - Conditional based on provider type */}
          {requiresCardDetails(form.type) && (
            <>
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <h4 className="font-semibold text-gray-800">Payment Card Details</h4>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium mb-1">Security Recommendation</p>
                    <p className="text-sm text-amber-700">
                      Please use a virtual card with a spending limit for this provider.
                    </p>
                  </div>
                </div>

                {/* Card Number */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Card Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
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
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Expiry Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Expiry Date (MM/YY) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
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
                      placeholder="MM/YY"
                      maxLength={5}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* CVC */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      CVC <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
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
                      placeholder="123"
                      maxLength={4}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : provider ? "Save Changes" : "Add Provider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
