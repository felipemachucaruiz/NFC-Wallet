import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

interface PhoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
}

export function PhoneField({ value, onChange, className, required, placeholder }: PhoneFieldProps) {
  return (
    <PhoneInput
      international
      defaultCountry="CO"
      value={value}
      onChange={(v) => onChange(v || "")}
      className={cn("phone-input-field", className)}
      inputComponent={undefined}
      required={required}
      placeholder={placeholder}
    />
  );
}
