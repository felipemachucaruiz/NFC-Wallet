import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minuteStep?: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimePicker({ value, onChange, placeholder, className, minuteStep = 15 }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedHour, setSelectedHour] = React.useState<number | null>(null);
  const hourRef = React.useRef<HTMLDivElement>(null);
  const minuteRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (value) {
      const [h] = value.split(":");
      setSelectedHour(parseInt(h, 10));
    }
  }, [value]);

  React.useEffect(() => {
    if (open && hourRef.current && selectedHour !== null) {
      const btn = hourRef.current.querySelector<HTMLElement>(`[data-hour="${selectedHour}"]`);
      btn?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [open, selectedHour]);

  const minutes = React.useMemo(() => {
    const m: number[] = [];
    for (let i = 0; i < 60; i += minuteStep) m.push(i);
    return m;
  }, [minuteStep]);

  const formatHour = (h: number) => String(h).padStart(2, "0");
  const formatMinute = (m: number) => String(m).padStart(2, "0");

  const selectedMinute = React.useMemo(() => {
    if (!value) return null;
    const [, m] = value.split(":");
    return m ? parseInt(m, 10) : null;
  }, [value]);

  const handleSelect = (h: number, m: number) => {
    onChange(`${formatHour(h)}:${formatMinute(m)}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4 shrink-0" />
          {value || <span>{placeholder || "Hora"}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <div
            ref={hourRef}
            className="h-56 w-16 overflow-y-scroll border-r"
          >
            <div className="p-1">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  data-hour={h}
                  onClick={() => setSelectedHour(h)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-sm text-center transition-colors",
                    selectedHour === h
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  {formatHour(h)}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={minuteRef}
            className="h-56 w-16 overflow-y-scroll"
          >
            <div className="p-1">
              {selectedHour !== null ? (
                minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelect(selectedHour, m)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-sm text-center transition-colors",
                      selectedMinute === m && value?.startsWith(formatHour(selectedHour))
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {formatMinute(m)}
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  Hora
                </p>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
