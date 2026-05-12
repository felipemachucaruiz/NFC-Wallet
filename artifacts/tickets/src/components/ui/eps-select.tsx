import { useState } from "react";
import { Check, ChevronsUpDown, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EPS_OPTIONS = [
  "Aliansalud EPS",
  "Asmet Salud EPS",
  "Cajacopi EPS",
  "Capital Salud EPS",
  "Coosalud EPS",
  "Compensar EPS",
  "Comfama EPS",
  "Comfenalco Valle EPS",
  "Emssanar EPS",
  "Famisanar EPS",
  "Medimás EPS",
  "Mutual Ser EPS",
  "Nueva EPS",
  "Salud Total EPS",
  "Sanitas EPS",
  "Savia Salud EPS",
  "Servicio Occidental de Salud (SOS)",
  "Sura EPS",
  "Régimen subsidiado",
  "No aplica",
];

interface EpsSelectProps {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  placeholder?: string;
}

export function EpsSelect({ value, onChange, hasError, placeholder = "Selecciona tu EPS" }: EpsSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal h-9 px-3 text-sm",
            !value && "text-muted-foreground",
            hasError && "border-destructive",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <HeartPulse className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar EPS..." className="h-9" />
          <CommandList>
            <CommandEmpty>No se encontró la EPS.</CommandEmpty>
            <CommandGroup>
              {EPS_OPTIONS.map((eps) => (
                <CommandItem
                  key={eps}
                  value={eps}
                  onSelect={(current) => {
                    onChange(current === value ? "" : current);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === eps ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {eps}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
