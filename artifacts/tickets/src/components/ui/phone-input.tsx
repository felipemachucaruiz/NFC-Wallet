import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check, Search } from "lucide-react";

const FLAG_CDN = "https://flagcdn.com/w40";

const COUNTRY_CODES = [
  { code: "+57", iso: "co", name: "Colombia" },
  { code: "+1", iso: "us", name: "Estados Unidos" },
  { code: "+52", iso: "mx", name: "México" },
  { code: "+54", iso: "ar", name: "Argentina" },
  { code: "+55", iso: "br", name: "Brasil" },
  { code: "+56", iso: "cl", name: "Chile" },
  { code: "+51", iso: "pe", name: "Perú" },
  { code: "+58", iso: "ve", name: "Venezuela" },
  { code: "+593", iso: "ec", name: "Ecuador" },
  { code: "+595", iso: "py", name: "Paraguay" },
  { code: "+598", iso: "uy", name: "Uruguay" },
  { code: "+591", iso: "bo", name: "Bolivia" },
  { code: "+34", iso: "es", name: "España" },
  { code: "+44", iso: "gb", name: "Reino Unido" },
  { code: "+49", iso: "de", name: "Alemania" },
  { code: "+33", iso: "fr", name: "Francia" },
  { code: "+39", iso: "it", name: "Italia" },
  { code: "+81", iso: "jp", name: "Japón" },
  { code: "+86", iso: "cn", name: "China" },
];

type Country = (typeof COUNTRY_CODES)[number];

function FlagImg({ iso, size = 20 }: { iso: string; size?: number }) {
  return (
    <img
      src={`${FLAG_CDN}/${iso}.png`}
      alt={iso.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      className="inline-block rounded-sm object-cover"
      style={{ width: size, height: Math.round(size * 0.75) }}
      loading="lazy"
    />
  );
}

interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
}

export function PhoneField({ value, onChange, className, required, placeholder = "300 123 4567" }: PhoneFieldProps) {
  const { t } = useTranslation();
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRY_CODES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setSearch("");
      }
    }
    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  const localNumber = value.startsWith(selectedCountry.code)
    ? value.slice(selectedCountry.code.length).trim()
    : value.startsWith("+") ? "" : value;

  const handleNumberChange = (num: string) => {
    const clean = num.replace(/[^\d\s]/g, "");
    onChange(clean ? `${selectedCountry.code}${clean}` : "");
  };

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setShowPicker(false);
    setSearch("");
    if (localNumber) {
      onChange(`${country.code}${localNumber}`);
    }
  };

  const filtered = search
    ? COUNTRY_CODES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search)
      )
    : COUNTRY_CODES;

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="flex items-center rounded-md border border-border bg-transparent overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1.5 px-3 h-9 border-r border-border hover:bg-muted/50 transition-colors shrink-0"
        >
          <FlagImg iso={selectedCountry.iso} size={20} />
          <span className="text-sm font-semibold text-foreground">{selectedCountry.code}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>

        <input
          type="tel"
          value={localNumber}
          onChange={(e) => handleNumberChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete="tel"
          className="flex-1 h-9 px-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>

      {showPicker && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 max-h-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.searchCountry")}
                className="w-full h-8 pl-8 pr-3 text-sm bg-muted/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-56">
            {filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${
                  country.code === selectedCountry.code ? "bg-primary/10" : ""
                }`}
              >
                <FlagImg iso={country.iso} size={24} />
                <span className="flex-1 text-sm text-foreground">{country.name}</span>
                <span className="text-sm font-semibold text-muted-foreground">{country.code}</span>
                {country.code === selectedCountry.code && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("common.noResults")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
