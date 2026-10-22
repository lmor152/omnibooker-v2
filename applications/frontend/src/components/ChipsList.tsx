import { useState, type KeyboardEvent } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Plus, X, ChevronUp, ChevronDown } from "lucide-react";

interface ChipsListProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  note?: string;
  /** e.g. "time" to get the native time picker on phones. */
  inputType?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  id?: string;
  /**
   * Optional hook to validate/normalize a value before adding.
   * Return { value } to add the normalized value, or { error } to block and surface a message.
   */
  onAddAttempt?: (value: string) => { value: string } | { error: string };
  /**
   * Optional callback to surface validation errors to the parent.
   */
  onError?: (message: string | null) => void;
}

export function ChipsList({
  items,
  onChange,
  placeholder,
  note,
  inputType = "text",
  inputMode,
  id,
  onAddAttempt,
  onError,
}: ChipsListProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (onAddAttempt) {
      const result = onAddAttempt(trimmed);
      if ("error" in result) {
        onError?.(result.error);
        return;
      }
      if (items.includes(result.value)) {
        setInputValue("");
        onError?.(null);
        return;
      }
      onChange([...items, result.value]);
      setInputValue("");
      onError?.(null);
      return;
    }

    if (items.includes(trimmed)) {
      setInputValue("");
      onError?.(null);
      return;
    }

    onChange([...items, trimmed]);
    setInputValue("");
    onError?.(null);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newItems = [...items];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      onChange(newItems);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < items.length - 1) {
      const newItems = [...items];
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      onChange(newItems);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const iconButton =
    "flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          type={inputType}
          inputMode={inputMode}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={handleAdd} className="h-11 shrink-0 px-4">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>
      {note && <p className="text-xs text-gray-500">{note}</p>}
      {items.length > 0 && (
        <ol className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {items.map((item, index) => (
            <li key={item} className="flex items-center gap-2 py-1 pl-3 pr-1">
              <span className="w-5 text-xs font-medium text-gray-400 tabular-nums">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{item}</span>
              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className={iconButton}
                    aria-label={`Move ${item} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                    className={iconButton}
                    aria-label={`Move ${item} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className={`${iconButton} hover:bg-red-50 hover:text-red-600`}
                aria-label={`Remove ${item}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
