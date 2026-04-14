import { useState, useRef, useEffect } from "react";
import {
  format, parse, isValid, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isAfter,
  setMonth as dfSetMonth, setYear as dfSetYear, getMonth, getYear,
} from "date-fns";
import { es, enUS } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type CalendarView = "days" | "months" | "years";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_ES = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
const WEEKDAYS_EN = ["mo", "tu", "we", "th", "fr", "sa", "su"];

function buildCalendarDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

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
  const [view, setView] = useState<CalendarView>("days");

  const isEs = i18n.language === "es";
  const locale = isEs ? es : enUS;

  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  const [displayMonth, setDisplayMonth] = useState<Date>(
    () => selected ?? new Date(new Date().getFullYear() - 25, 0, 1)
  );

  const yearsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "years" && yearsRef.current) {
      const sel = yearsRef.current.querySelector<HTMLElement>('[data-selected="true"]');
      sel?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [view]);

  const today = new Date();
  const currentYear = today.getFullYear();
  const years = Array.from({ length: currentYear - 1930 + 1 }, (_, i) => currentYear - i);
  const months = isEs ? MONTHS_ES : MONTHS_EN;
  const weekdays = isEs ? WEEKDAYS_ES : WEEKDAYS_EN;

  const displayValue = selected ? format(selected, "dd/MM/yyyy") : "";
  const captionMonthName = format(displayMonth, "MMMM", { locale });
  const captionYear = getYear(displayMonth);

  const calDays = buildCalendarDays(displayMonth);

  const handleDayClick = (day: Date) => {
    if (isAfter(day, today)) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
    setView("days");
  };

  const handleMonthSelect = (idx: number) => {
    setDisplayMonth(dfSetMonth(displayMonth, idx));
    setView("days");
  };

  const handleYearSelect = (year: number) => {
    setDisplayMonth(dfSetYear(displayMonth, year));
    setView("months");
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) setView("days");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs transition-colors",
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

      <PopoverContent className="w-[264px] p-4" align="start">
        {/* Caption */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setView(v => v === "months" ? "days" : "months")}
              className="capitalize hover:text-primary transition-colors"
            >
              {captionMonthName}
            </button>
            <button
              type="button"
              onClick={() => setView(v => v === "years" ? "days" : "years")}
              className="hover:text-primary transition-colors ml-1"
            >
              {captionYear}
            </button>
          </div>
          {view === "days" && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setDisplayMonth(m => subMonths(m, 1))}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDisplayMonth(m => addMonths(m, 1))}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Days view */}
        {view === "days" && (
          <>
            <div className="grid grid-cols-7 mb-1">
              {weekdays.map(d => (
                <div key={d} className="text-center text-[0.7rem] text-muted-foreground py-1 select-none">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {calDays.map(day => {
                const inMonth = isSameMonth(day, displayMonth);
                const isToday = isSameDay(day, today);
                const isSelected = !!selected && isSameDay(day, selected);
                const isFuture = isAfter(day, today);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    disabled={isFuture}
                    className={cn(
                      "h-8 w-full rounded-full text-[0.82rem] transition-colors select-none",
                      inMonth ? "text-foreground" : "text-muted-foreground opacity-30",
                      isSelected && "bg-primary text-primary-foreground font-semibold",
                      !isSelected && isToday && "bg-primary/25 text-primary font-semibold",
                      !isSelected && !isToday && !isFuture && inMonth && "hover:bg-muted",
                      isFuture && "cursor-not-allowed opacity-25",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Months view */}
        {view === "months" && (
          <div className="grid grid-cols-3 gap-1.5">
            {months.map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMonthSelect(i)}
                className={cn(
                  "py-2 rounded-lg text-sm font-medium transition-colors",
                  getMonth(displayMonth) === i
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {/* Years view */}
        {view === "years" && (
          <div ref={yearsRef} className="grid grid-cols-3 gap-1.5 h-[210px] overflow-y-auto pr-1">
            {years.map(y => (
              <button
                key={y}
                type="button"
                data-selected={getYear(displayMonth) === y}
                onClick={() => handleYearSelect(y)}
                className={cn(
                  "py-2 rounded-lg text-sm font-medium transition-colors",
                  getYear(displayMonth) === y
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
