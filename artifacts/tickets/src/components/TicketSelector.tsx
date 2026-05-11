import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Minus, Plus, X, ChevronRight, Check, Calendar, CreditCard as IdCard, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/ui/phone-input";
import { Badge } from "@/components/ui/badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/lib/format";
import type { EventData, TicketType, AttendeeData } from "@/data/types";

function fmtDisplayDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return d && m && y ? `${d}/${m}/${y}` : dateStr;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 h-9 px-3 flex items-center rounded-md border border-border bg-muted/40 text-sm text-foreground/70">
        {value || "—"}
      </div>
    </div>
  );
}

interface TicketSelectorProps {
  event: EventData;
  ticketType: TicketType;
  sectionName: string;
  onClose: () => void;
  preSelectedUnitId?: string | null;
}

export function TicketSelector({ event, ticketType, sectionName, onClose, preSelectedUnitId }: TicketSelectorProps) {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const isRace = event.category === "race";
  const isNumbered = ticketType.isNumberedUnits && ticketType.units && ticketType.units.length > 0;
  const [step, setStep] = useState<"quantity" | "unit" | "attendees">(isNumbered ? "unit" : "quantity");
  const [quantity, setQuantity] = useState(isNumbered ? (ticketType.ticketsPerUnit || 1) : 1);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(preSelectedUnitId ?? null);
  const [attendees, setAttendees] = useState<AttendeeData[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const maxQty = Math.min(ticketType.maxPerOrder, ticketType.availableCount);
  const subtotal = ticketType.price * (isNumbered ? 1 : quantity);
  const serviceFee = ticketType.serviceFeeType === "percentage"
    ? Math.round(subtotal * ticketType.serviceFee / 100)
    : ticketType.serviceFee * (isNumbered ? 1 : quantity);
  const total = subtotal + serviceFee;

  const handleQuantityChange = (newQty: number) => {
    const q = Math.max(1, Math.min(maxQty, newQty));
    setQuantity(q);
  };

  const handleContinueToAttendees = () => {
    const count = isNumbered ? (ticketType.ticketsPerUnit || 1) : quantity;
    const initial: AttendeeData[] = Array.from({ length: count }, (_, i) => {
      if (i === 0 && user) {
        return { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone, dateOfBirth: user.dateOfBirth || "", sex: (user.sex || "") as AttendeeData["sex"], idDocument: user.idDocument || "" };
      }
      return { name: "", email: "", phone: "", dateOfBirth: "", sex: "", idDocument: "" };
    });
    setAttendees(initial);
    setStep("attendees");
  };

  const handleUnitSelect = (unitId: string) => {
    setSelectedUnitId(unitId);
  };

  const handleUnitContinue = () => {
    if (!selectedUnitId) return;
    handleContinueToAttendees();
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
      if (i === 0 && isAuthenticated && !!user) {
        if (isRace && !a.shirtSize) newErrors[`${i}-shirtSize`] = t("ticketSelection.required");
        return;
      }
      if (!a.name.trim()) newErrors[`${i}-name`] = t("ticketSelection.required");
      if (!a.email.trim()) newErrors[`${i}-email`] = t("ticketSelection.required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) newErrors[`${i}-email`] = t("ticketSelection.invalidEmail");
      if (!a.phone.trim()) newErrors[`${i}-phone`] = t("ticketSelection.required");
      if (!a.dateOfBirth.trim()) newErrors[`${i}-dateOfBirth`] = t("ticketSelection.required");
      if (!a.sex) newErrors[`${i}-sex`] = t("ticketSelection.required");
      if (!a.idDocument.trim()) newErrors[`${i}-idDocument`] = t("ticketSelection.required");
      if (isRace && !a.shirtSize) newErrors[`${i}-shirtSize`] = t("ticketSelection.required");
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToCheckout = () => {
    if (!validateAttendees()) return;

    const selectedUnit = isNumbered && selectedUnitId
      ? ticketType.units?.find((u) => u.id === selectedUnitId)
      : null;

    const checkoutData: Record<string, unknown> = {
      eventId: event.id,
      eventName: event.name,
      ticketTypeId: ticketType.id,
      ticketTypeName: ticketType.name,
      sectionName,
      validDays: ticketType.validDays,
      price: ticketType.price,
      quantity: isNumbered ? (ticketType.ticketsPerUnit || 1) : quantity,
      attendees,
      subtotal,
      serviceFee,
      total,
      currencyCode: event.currencyCode,
    };

    if (isNumbered && selectedUnitId) {
      checkoutData.unitSelections = [{ ticketTypeId: ticketType.id, unitId: selectedUnitId }];
      checkoutData.selectedUnitLabel = selectedUnit ? `${selectedUnit.unitLabel} ${selectedUnit.unitNumber}` : "";
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
            <p className="text-primary font-bold mt-1">{formatPrice(ticketType.price, event.currencyCode, i18n.language)}</p>
          </div>

          {step === "unit" && isNumbered ? (
            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">
                  {t("ticketSelection.selectUnit", { label: ticketType.unitLabel || "Unit" })}
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("ticketSelection.unitIncludes", { count: ticketType.ticketsPerUnit || 1 })}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {ticketType.units!.map((unit) => {
                    const isAvailable = unit.status === "available";
                    const isSelected = selectedUnitId === unit.id;
                    return (
                      <button
                        key={unit.id}
                        disabled={!isAvailable}
                        onClick={() => handleUnitSelect(unit.id)}
                        className={`relative p-3 rounded-lg border text-center transition-all ${
                          !isAvailable
                            ? "border-border bg-muted/30 opacity-40 cursor-not-allowed"
                            : isSelected
                            ? "border-primary bg-primary/10 ring-2 ring-primary"
                            : "border-border hover:border-primary/50 cursor-pointer"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">{ticketType.unitLabel || unit.unitLabel}</p>
                        <p className="text-lg font-bold">{unit.unitNumber}</p>
                        {!isAvailable && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 mt-1">
                            {t("event.soldOut")}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-bold text-base">
                  <span>{t("ticketSelection.total")}</span>
                  <span className="text-primary">{formatPrice(total, event.currencyCode, i18n.language)}</span>
                </div>
              </div>

              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                size="lg"
                onClick={handleUnitContinue}
                disabled={!selectedUnitId}
              >
                {t("ticketSelection.continue")}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : step === "quantity" ? (
            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">{t("ticketSelection.quantity")}</Label>
                {isRace ? (
                  <p className="text-xs text-muted-foreground">
                    {t("ticketSelection.raceSingleTicket", "Las carreras permiten solo 1 entrada por persona.")}
                  </p>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ticketSelection.subtotal")}</span>
                  <span>{formatPrice(subtotal, event.currencyCode, i18n.language)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ticketSelection.serviceFee")}</span>
                  <span>{formatPrice(serviceFee, event.currencyCode, i18n.language)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>{t("ticketSelection.total")}</span>
                  <span className="text-primary">{formatPrice(total, event.currencyCode, i18n.language)}</span>
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

              {attendees.map((attendee, index) => {
                const isPrimaryBuyer = index === 0 && isAuthenticated && !!user;
                return (
                <div key={index} className="bg-card rounded-lg border border-border p-4">
                  <p className="font-medium text-sm mb-3">
                    {t("ticketSelection.ticket")} {index + 1}
                    {isPrimaryBuyer && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">({t("ticketSelection.yourTicket", "Tu entrada")})</span>
                    )}
                  </p>
                  <div className="space-y-3">
                    {isPrimaryBuyer ? (
                      <>
                        <ReadOnlyField label={t("ticketSelection.name")} value={attendee.name} />
                        <ReadOnlyField label={t("ticketSelection.email")} value={attendee.email} />
                        <ReadOnlyField label={t("ticketSelection.phone")} value={attendee.phone} />
                        <ReadOnlyField label={t("ticketSelection.dateOfBirth", "Fecha de nacimiento")} value={fmtDisplayDate(attendee.dateOfBirth)} />
                        <ReadOnlyField
                          label={t("ticketSelection.sex", "Género")}
                          value={attendee.sex === "male" ? t("ticketSelection.male", "Masculino") : attendee.sex === "female" ? t("ticketSelection.female", "Femenino") : attendee.sex === "non_binary" ? t("ticketSelection.nonBinary", "No binario") : "—"}
                        />
                        <ReadOnlyField label={t("ticketSelection.idDocument", "Núm. de identificación")} value={attendee.idDocument} />
                      </>
                    ) : (
                      <>
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
                          <PhoneField
                            value={attendee.phone}
                            onChange={(v) => updateAttendee(index, "phone", v)}
                            className={errors[`${index}-phone`] ? "[&_div]:border-destructive" : ""}
                          />
                          {errors[`${index}-phone`] && (
                            <p className="text-xs text-destructive mt-1">{errors[`${index}-phone`]}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {t("ticketSelection.dateOfBirth", "Fecha de nacimiento")} *
                          </Label>
                          <div className="mt-1">
                            <DatePickerField
                              value={attendee.dateOfBirth}
                              onChange={(v) => updateAttendee(index, "dateOfBirth", v)}
                              hasError={!!errors[`${index}-dateOfBirth`]}
                            />
                          </div>
                          {errors[`${index}-dateOfBirth`] && (
                            <p className="text-xs text-destructive mt-1">{errors[`${index}-dateOfBirth`]}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {t("ticketSelection.sex", "Género")} *
                          </Label>
                          <div className="flex gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => updateAttendee(index, "sex", "male")}
                              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${attendee.sex === "male" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                            >
                              {t("ticketSelection.male", "Masculino")}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateAttendee(index, "sex", "female")}
                              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${attendee.sex === "female" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                            >
                              {t("ticketSelection.female", "Femenino")}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateAttendee(index, "sex", "non_binary")}
                              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${attendee.sex === "non_binary" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                            >
                              {t("ticketSelection.nonBinary", "No binario")}
                            </button>
                          </div>
                          {errors[`${index}-sex`] && (
                            <p className="text-xs text-destructive mt-1">{errors[`${index}-sex`]}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <IdCard className="w-3 h-3" />
                            {t("ticketSelection.idDocument", "Núm. de identificación")} *
                          </Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={attendee.idDocument}
                            onChange={(e) => updateAttendee(index, "idDocument", e.target.value.replace(/\D/g, ""))}
                            placeholder="1234567890"
                            className={`mt-1 ${errors[`${index}-idDocument`] ? "border-destructive" : ""}`}
                          />
                          {errors[`${index}-idDocument`] && (
                            <p className="text-xs text-destructive mt-1">{errors[`${index}-idDocument`]}</p>
                          )}
                        </div>
                      </>
                    )}

                    {isRace && (() => {
                      const sizes = event.raceConfig?.sizes ?? ["XS", "S", "M", "L", "XL", "XXL"];
                      return (
                        <div>
                          <Label className="text-xs flex items-center gap-1 mb-2">
                            {t("ticketSelection.shirtSize", "Talla de camiseta")} *
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {sizes.map((size) => (
                              <button
                                key={size}
                                type="button"
                                onClick={() => updateAttendee(index, "shirtSize", size)}
                                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                                  attendee.shirtSize === size
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                          {errors[`${index}-shirtSize`] && (
                            <p className="text-xs text-destructive mt-1">{errors[`${index}-shirtSize`]}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                );
              })}

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-bold text-base">
                  <span>{t("ticketSelection.total")}</span>
                  <span className="text-primary">{formatPrice(total, event.currencyCode, i18n.language)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(isNumbered ? "unit" : "quantity")} className="flex-1">
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
