import { useState, type KeyboardEvent } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Plus, X, ChevronUp, ChevronDown } from "lucide-react";

interface ChipsListProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  note?: string;
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

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" onClick={handleAdd} size="sm">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {note && <p className="text-xs text-gray-500">{note}</p>}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <Badge
              key={`${item}-${index}`}
              variant="secondary"
              className="pl-3 pr-1 py-1 flex items-center gap-1"
            >
              <span>{item}</span>
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === items.length - 1}
                  className="p-0.5 hover:bg-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-0.5 hover:bg-red-200 rounded ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
