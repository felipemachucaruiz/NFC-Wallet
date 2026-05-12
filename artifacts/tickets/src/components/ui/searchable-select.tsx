import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  hasError?: boolean;
  clearable?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar...",
  hasError,
  clearable = true,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full h-9 px-3 flex items-center justify-between gap-2 rounded-md border text-sm transition-colors",
          "bg-background text-foreground",
          open
            ? "border-primary ring-2 ring-primary/20"
            : hasError
            ? "border-destructive"
            : "border-input hover:border-primary/50",
        )}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {clearable && value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { onChange(option); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors",
                    option === value
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/60 text-foreground",
                  )}
                >
                  {option}
                  {option === value && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
