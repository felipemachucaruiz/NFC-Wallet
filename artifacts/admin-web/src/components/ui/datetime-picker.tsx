import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const locale = i18n.language === "es" ? es : undefined;

  const datePart = value ? value.substring(0, 10) : "";
  const timePart = value ? value.substring(11, 16) : "";

  const dateObj = datePart ? parse(datePart, "yyyy-MM-dd", new Date()) : undefined;
  const validDate = dateObj && isValid(dateObj) ? dateObj : undefined;

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

  const buildTime = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

  const emitValue = (d: string, t: string) => {
    if (d) {
      onChange(`${d}T${t}`);
    }
  };

  const displayText = validDate
    ? `${format(validDate, "PPP", { locale })} ${timePart || buildTime(selectedHour, selectedMinute)}`
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        <div className="flex">
          <div className="p-0">
            <Calendar
              mode="single"
              selected={validDate}
              onSelect={(day) => {
                if (day) {
                  emitValue(format(day, "yyyy-MM-dd"), buildTime(selectedHour, selectedMinute));
                }
              }}
              defaultMonth={validDate}
              locale={locale}
            />
          </div>
          <div className="border-l flex flex-col">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground text-center border-b flex items-center gap-1 justify-center">
              <Clock className="w-3 h-3" /> Hora
            </div>
            <div className="flex flex-1">
              <ScrollArea className="h-56 w-12">
                <div className="p-0.5">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setSelectedHour(h);
                        const newTime = buildTime(h, selectedMinute);
                        emitValue(datePart, newTime);
                      }}
                      className={cn(
                        "w-full rounded-md px-1.5 py-1 text-xs text-center transition-colors",
                        selectedHour === h
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      )}
                    >
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </ScrollArea>
              <ScrollArea className="h-56 w-12 border-l">
                <div className="p-0.5">
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
                        "w-full rounded-md px-1.5 py-1 text-xs text-center transition-colors",
                        selectedMinute === m && selectedHour !== null
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
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
