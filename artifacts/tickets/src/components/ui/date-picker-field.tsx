import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
}

export function DatePickerField({
  value,
  onChange,
  placeholder,
  className,
  hasError,
}: DatePickerFieldProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const locale = i18n.language === "es" ? es : enUS;

  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  const displayValue = selected
    ? format(selected, "dd/MM/yyyy")
    : "";

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, "yyyy-MM-dd"));
      setOpen(false);
    }
  };

  const defaultMonth = selected ?? new Date(new Date().getFullYear() - 25, 0, 1);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-left text-sm shadow-xs transition-colors",
            "hover:border-primary/50 focus:outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px]",
            !displayValue && "text-muted-foreground",
            hasError && "border-destructive",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{displayValue || placeholder || "DD/MM/AAAA"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          captionLayout="dropdown"
          defaultMonth={defaultMonth}
          startMonth={new Date(1930, 0)}
          endMonth={new Date()}
          disabled={{ after: new Date() }}
          locale={locale}
        />
      </PopoverContent>
    </Popover>
  );
}
