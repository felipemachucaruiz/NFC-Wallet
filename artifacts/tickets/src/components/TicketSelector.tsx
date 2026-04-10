import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Minus, Plus, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/data/mockEvents";
import type { EventData, TicketType, AttendeeData } from "@/data/types";

interface TicketSelectorProps {
  event: EventData;
  ticketType: TicketType;
  sectionName: string;
  onClose: () => void;
}

const SERVICE_FEE_RATE = 0.08;

export function TicketSelector({ event, ticketType, sectionName, onClose }: TicketSelectorProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const [step, setStep] = useState<"quantity" | "attendees">("quantity");
  const [quantity, setQuantity] = useState(1);
  const [attendees, setAttendees] = useState<AttendeeData[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const maxQty = Math.min(ticketType.maxPerOrder, ticketType.availableCount);
  const subtotal = ticketType.price * quantity;
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
  const total = subtotal + serviceFee;

  const handleQuantityChange = (newQty: number) => {
    const q = Math.max(1, Math.min(maxQty, newQty));
    setQuantity(q);
  };

  const handleContinueToAttendees = () => {
    const initial: AttendeeData[] = Array.from({ length: quantity }, (_, i) => {
      if (i === 0 && user) {
        return { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone };
      }
      return { name: "", email: "", phone: "" };
    });
    setAttendees(initial);
    setStep("attendees");
  };

  const updateAttendee = (index: number, field: keyof AttendeeData, value: string) => {
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${index}-${field}`];
      return next;
    });
  };

  const validateAttendees = (): boolean => {
    const newErrors: Record<string, string> = {};
    attendees.forEach((a, i) => {
      if (!a.name.trim()) newErrors[`${i}-name`] = t("ticketSelection.required");
      if (!a.email.trim()) newErrors[`${i}-email`] = t("ticketSelection.required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) newErrors[`${i}-email`] = t("ticketSelection.invalidEmail");
      if (!a.phone.trim()) newErrors[`${i}-phone`] = t("ticketSelection.required");
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToCheckout = () => {
    if (!validateAttendees()) return;

    const checkoutData = {
      eventId: event.id,
      eventName: event.name,
      ticketTypeId: ticketType.id,
      ticketTypeName: ticketType.name,
      sectionName,
      validDays: ticketType.validDays,
      price: ticketType.price,
      quantity,
      attendees,
      subtotal,
      serviceFee,
      total,
      currencyCode: event.currencyCode,
    };

    if (!isAuthenticated) {
      sessionStorage.setItem("tapee_checkout", JSON.stringify(checkoutData));
      openAuthModal("login", "checkout");
      onClose();
      return;
    }
    sessionStorage.setItem("tapee_checkout", JSON.stringify(checkoutData));
    navigate("/checkout");
    onClose();
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("ticketSelection.title")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <div className="bg-card rounded-lg border border-border p-4 mb-4">
            <p className="font-semibold">{ticketType.name}</p>
            <p className="text-sm text-muted-foreground">{sectionName} — {ticketType.validDays}</p>
            <p className="text-primary font-bold mt-1">{formatPrice(ticketType.price, event.currencyCode)}</p>
          </div>

          {step === "quantity" ? (
            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">{t("ticketSelection.quantity")}</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("ticketSelection.maxPerOrder", { max: maxQty })}
                </p>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-2xl font-bold w-8 text-center">{quantity}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= maxQty}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ticketSelection.subtotal")}</span>
                  <span>{formatPrice(subtotal, event.currencyCode)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ticketSelection.serviceFee")}</span>
                  <span>{formatPrice(serviceFee, event.currencyCode)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>{t("ticketSelection.total")}</span>
                  <span className="text-primary">{formatPrice(total, event.currencyCode)}</span>
                </div>
              </div>

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                size="lg"
                onClick={handleContinueToAttendees}
              >
                {t("ticketSelection.continue")}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">{t("ticketSelection.attendeeInfo")}</p>

              {attendees.map((attendee, index) => (
                <div key={index} className="bg-card rounded-lg border border-border p-4">
                  <p className="font-medium text-sm mb-3">
                    {t("ticketSelection.ticket")} {index + 1}
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">{t("ticketSelection.name")}</Label>
                      <Input
                        value={attendee.name}
                        onChange={(e) => updateAttendee(index, "name", e.target.value)}
                        className={errors[`${index}-name`] ? "border-destructive" : ""}
                      />
                      {errors[`${index}-name`] && (
                        <p className="text-xs text-destructive mt-1">{errors[`${index}-name`]}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">{t("ticketSelection.email")}</Label>
                      <Input
                        type="email"
                        value={attendee.email}
                        onChange={(e) => updateAttendee(index, "email", e.target.value)}
                        className={errors[`${index}-email`] ? "border-destructive" : ""}
                      />
                      {errors[`${index}-email`] && (
                        <p className="text-xs text-destructive mt-1">{errors[`${index}-email`]}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">{t("ticketSelection.phone")}</Label>
                      <Input
                        type="tel"
                        value={attendee.phone}
                        onChange={(e) => updateAttendee(index, "phone", e.target.value)}
                        className={errors[`${index}-phone`] ? "border-destructive" : ""}
                      />
                      {errors[`${index}-phone`] && (
                        <p className="text-xs text-destructive mt-1">{errors[`${index}-phone`]}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-bold text-base">
                  <span>{t("ticketSelection.total")}</span>
                  <span className="text-primary">{formatPrice(total, event.currencyCode)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("quantity")} className="flex-1">
                  {t("common.back")}
                </Button>
                <Button
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleProceedToCheckout}
                >
                  {t("ticketSelection.continue")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
