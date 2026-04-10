import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Search, Calendar, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { mockEvents, formatDateRange } from "@/data/mockEvents";

interface SearchAutocompleteProps {
  className?: string;
  onNavigate?: () => void;
}

export function SearchAutocomplete({ className, onNavigate }: SearchAutocompleteProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return mockEvents
      .filter((e) => e.active && (
        e.name.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.venueName.toLowerCase().includes(q)
      ))
      .slice(0, 5);
  }, [query]);

  useEffect(() => {
    setOpen(results.length > 0 && query.trim().length >= 2);
    setActiveIndex(-1);
  }, [results, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const goToEvent = (id: string) => {
    setOpen(false);
    setQuery("");
    navigate(`/event/${id}`);
    onNavigate?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" && query.trim()) {
        e.preventDefault();
        setOpen(false);
        navigate(`/?q=${encodeURIComponent(query.trim())}`);
        onNavigate?.();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          goToEvent(results[activeIndex].id);
        } else if (query.trim()) {
          setOpen(false);
          navigate(`/?q=${encodeURIComponent(query.trim())}`);
          onNavigate?.();
        }
        break;
      case "Escape":
        setOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      <Input
        ref={inputRef}
        type="search"
        placeholder={t("nav.search")}
        className="pl-10 bg-card border-border"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          {results.map((event, i) => (
            <button
              key={event.id}
              type="button"
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                i === activeIndex ? "bg-primary/10" : "hover:bg-muted/50"
              }`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => goToEvent(event.id)}
            >
              <img
                src={event.coverImage}
                alt=""
                className="w-12 h-12 rounded-lg object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{event.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDateRange(event.startsAt, event.endsAt, event.isMultiDay)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {event.city}
                  </span>
                </div>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="w-full px-3 py-2 text-xs text-primary hover:bg-muted/50 border-t border-border text-center"
            onClick={() => {
              setOpen(false);
              navigate(`/?q=${encodeURIComponent(query.trim())}`);
              onNavigate?.();
            }}
          >
            {t("nav.searchAll")}
          </button>
        </div>
      )}
    </div>
  );
}
