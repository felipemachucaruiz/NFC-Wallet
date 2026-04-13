import * as React from "react";
import {
  format, parse, isValid, addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay,
  setMonth as dfSetMonth, setYear as dfSetYear, getMonth, getYear,
} from "date-fns";
import { es, enUS } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function DateTimePicker({ value, onChange, placeholder, className, "data-testid": testId }: DateTimePickerProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<CalendarView>("days");

  const isEs = i18n.language === "es";
  const locale = isEs ? es : enUS;

  const datePart = value ? value.substring(0, 10) : "";
  const timePart = value ? value.substring(11, 16) : "";

  const dateObj = datePart ? parse(datePart, "yyyy-MM-dd", new Date()) : undefined;
  const validDate = dateObj && isValid(dateObj) ? dateObj : undefined;

  const [displayMonth, setDisplayMonth] = React.useState<Date>(
    () => validDate ?? new Date()
  );

  const [selectedHour, setSelectedHour] = React.useState<number>(
    timePart ? parseInt(timePart.split(":")[0], 10) : 12
  );
  const [selectedMinute, setSelectedMinute] = React.useState<number>(
    timePart ? parseInt(timePart.split(":")[1], 10) : 0
  );

  React.useEffect(() => {
    if (timePart) {
      setSelectedHour(parseInt(timePart.split(":")[0], 10));
      setSelectedMinute(parseInt(timePart.split(":")[1], 10));
    }
  }, [timePart]);

  const yearsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (view === "years" && yearsRef.current) {
      const sel = yearsRef.current.querySelector<HTMLElement>('[data-selected="true"]');
      sel?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [view]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear + 5 - 1930 + 1 }, (_, i) => currentYear + 5 - i);
  const months = isEs ? MONTHS_ES : MONTHS_EN;
  const weekdays = isEs ? WEEKDAYS_ES : WEEKDAYS_EN;

  const buildTime = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

  const emitValue = (d: string, t: string) => {
    if (d) onChange(`${d}T${t}`);
  };

  const displayText = validDate
    ? `${format(validDate, "PPP", { locale })} ${timePart || buildTime(selectedHour, selectedMinute)}`
    : null;

  const captionMonthName = format(displayMonth, "MMMM", { locale });
  const captionYear = getYear(displayMonth);
  const calDays = buildCalendarDays(displayMonth);

  const handleDayClick = (day: Date) => {
    emitValue(format(day, "yyyy-MM-dd"), buildTime(selectedHour, selectedMinute));
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
        <Button
          variant="outline"
          data-testid={testId}
          className={cn(
            "w-full justify-start text-left font-normal h-9",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {displayText || <span>{placeholder || "Seleccionar fecha y hora"}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x divide-border">
          {/* Calendar side */}
          <div className="p-4">
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
                    const isToday = isSameDay(day, new Date());
                    const isSelected = !!validDate && isSameDay(day, validDate);

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => handleDayClick(day)}
                        className={cn(
                          "h-8 w-full rounded-full text-[0.82rem] transition-colors select-none",
                          inMonth ? "text-foreground" : "text-muted-foreground opacity-30",
                          isSelected && "bg-primary text-primary-foreground font-semibold",
                          !isSelected && isToday && "bg-primary/25 text-primary font-semibold",
                          !isSelected && !isToday && inMonth && "hover:bg-muted",
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
              <div className="grid grid-cols-3 gap-1.5 w-[220px]">
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
              <div ref={yearsRef} className="grid grid-cols-3 gap-1.5 w-[220px] h-[210px] overflow-y-auto pr-1">
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
          </div>

          {/* Time picker side */}
          <div className="flex flex-col min-w-[130px]">
            <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-b">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Hora</span>
            </div>
            <div className="flex border-b">
              <div className="flex-1 text-center py-1.5 text-[11px] font-medium text-muted-foreground border-r">HH</div>
              <div className="flex-1 text-center py-1.5 text-[11px] font-medium text-muted-foreground">MM</div>
            </div>
            <div className="flex flex-1">
              <ScrollArea className="h-60 flex-1 border-r">
                <div className="py-1 px-1">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setSelectedHour(h);
                        emitValue(datePart, buildTime(h, selectedMinute));
                      }}
                      className={cn(
                        "w-full rounded-md py-1.5 text-sm text-center font-mono transition-colors",
                        selectedHour === h
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <ScrollArea className="h-60 flex-1">
                <div className="py-1 px-1">
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setSelectedMinute(m);
                        const newTime = buildTime(selectedHour, m);
                        emitValue(datePart, newTime);
                        if (datePart) setOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-md py-1.5 text-sm text-center font-mono transition-colors",
                        selectedMinute === m
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-accent text-foreground"
                      )}
                    >
                      {pad(m)}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
