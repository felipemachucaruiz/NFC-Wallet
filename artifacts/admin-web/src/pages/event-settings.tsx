import { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useGetEvent,
  useUpdateEvent,
  useUnflagBracelet,
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/currency";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useEventContext } from "@/contexts/event-context";
import {
  Settings,
  MapPin,
  Package,
  Key,
  Shield,
  Lock,
  Wifi,
  Cpu,
  AlertTriangle,
  AlertOctagon,
  XCircle,
  RefreshCw,
  CheckCircle,
  Flag,
} from "lucide-react";

type NfcChipType = "ntag_21x" | "mifare_classic" | "desfire_ev3" | "mifare_ultralight_c";
type InventoryMode = "location_based" | "centralized_warehouse";

type EventDetail = {
  id: string;
  name: string;
  active?: boolean;
  currencyCode?: string;
  nfcBraceletsEnabled?: boolean;
  ticketingEnabled?: boolean;
  inventoryMode?: InventoryMode;
  nfcChipType?: NfcChipType;
  allowedNfcTypes?: NfcChipType[];
  hasHmacSecret?: boolean;
  hasDesfireKey?: boolean;
  hasUltralightCKey?: boolean;
  offlineSyncLimit?: number;
  maxOfflineSpendPerBracelet?: number;
  bankPaymentMethods?: string[];
  boxOfficePaymentMethods?: string[];
  bankMinTopup?: number;
  braceletActivationFee?: number;
};

type ConfirmType =
  | "inventory"
  | "rotate_key"
  | "generate_desfire_key"
  | "generate_ultralight_c_key"
  | "close_event"
  | null;

export default function EventSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: auth } = useGetCurrentAuthUser();
  const { eventId: adminEventId } = useEventContext();
  const eventId = auth?.user?.role === "admin" ? adminEventId : (auth?.user?.eventId ?? "");

  const { data: eventData, isLoading, refetch } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: ["event-settings", eventId] },
  });

  const event = eventData as EventDetail | undefined;
  const nfcBraceletsEnabled = event?.nfcBraceletsEnabled !== false;
  const ticketingEnabled = event?.ticketingEnabled === true;
  const currentMode: InventoryMode = event?.inventoryMode ?? "location_based";
  const currentAllowedTypes: NfcChipType[] = event?.allowedNfcTypes ?? [event?.nfcChipType ?? "ntag_21x"];

  const { data: flaggedData, refetch: refetchFlagged } = useQuery({
    queryKey: ["flagged-bracelets", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const res = await customFetch(`/api/events/${eventId}/flagged-bracelets`, { method: "GET" });
      return res as { flaggedBracelets: Array<{ nfcUid: string; lastKnownBalance?: number; flagReason: string | null; updatedAt: string }> };
    },
  });
  const flaggedBracelets = flaggedData?.flaggedBracelets ?? [];

  const [confirmType, setConfirmType] = useState<ConfirmType>(null);
  const [pendingMode, setPendingMode] = useState<InventoryMode | null>(null);
  const [pendingRefundCount, setPendingRefundCount] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isGeneratingDesfire, setIsGeneratingDesfire] = useState(false);
  const [isGeneratingUltralight, setIsGeneratingUltralight] = useState(false);
  const [isClosingEvent, setIsClosingEvent] = useState(false);
  const [isCheckingRefunds, setIsCheckingRefunds] = useState(false);

  const [offlineSyncLimit, setOfflineSyncLimit] = useState("");
  const [maxOfflineSpend, setMaxOfflineSpend] = useState("");
  const [isSavingLimits, setIsSavingLimits] = useState(false);

  const [selectedChipType, setSelectedChipType] = useState<NfcChipType>("ntag_21x");
  const [isSavingChipTypes, setIsSavingChipTypes] = useState(false);

  const [selectedBankMethods, setSelectedBankMethods] = useState<string[]>(["cash", "card_external", "nequi_transfer", "bancolombia_transfer", "other"]);
  const [selectedBoxOfficeMethods, setSelectedBoxOfficeMethods] = useState<string[]>(["gate_cash", "gate_transfer", "gate_card", "gate_nequi"]);
  const [bankMinTopupText, setBankMinTopupText] = useState("0");
  const [activationFeeText, setActivationFeeText] = useState("3000");
  const [isSavingPaymentConfig, setIsSavingPaymentConfig] = useState(false);

  useEffect(() => {
    if (event) {
      setOfflineSyncLimit(String(event.offlineSyncLimit ?? 500000));
      setMaxOfflineSpend(String(event.maxOfflineSpendPerBracelet ?? 200000));
      const types = event.allowedNfcTypes ?? [event.nfcChipType ?? "ntag_21x"];
      setSelectedChipType(types[0] ?? "ntag_21x");
      if (event.bankPaymentMethods) setSelectedBankMethods(event.bankPaymentMethods);
      if (event.boxOfficePaymentMethods) setSelectedBoxOfficeMethods(event.boxOfficePaymentMethods);
      if (event.bankMinTopup !== undefined) setBankMinTopupText(String(event.bankMinTopup));
      if (event.braceletActivationFee !== undefined) setActivationFeeText(String(event.braceletActivationFee));
    }
  }, [event?.offlineSyncLimit, event?.maxOfflineSpendPerBracelet, event?.nfcChipType, event?.allowedNfcTypes, event?.bankPaymentMethods, event?.boxOfficePaymentMethods, event?.bankMinTopup, event?.braceletActivationFee]);

  const updateEvent = useUpdateEvent();
  const unflagBracelet = useUnflagBracelet();

  const handleSavePaymentConfig = async () => {
    if (!eventId) return;
    if (selectedBankMethods.length === 0 || selectedBoxOfficeMethods.length === 0) {
      toast({ title: "Selecciona al menos un método de pago para cada área.", variant: "destructive" });
      return;
    }
    const minTopup = parseInt(bankMinTopupText, 10);
    if (isNaN(minTopup) || minTopup < 0) {
      toast({ title: "Monto mínimo inválido.", variant: "destructive" });
      return;
    }
    const activationFee = parseInt(activationFeeText, 10);
    if (isNaN(activationFee) || activationFee < 0) {
      toast({ title: "Fee de activación inválido.", variant: "destructive" });
      return;
    }
    setIsSavingPaymentConfig(true);
    try {
      await customFetch(`/api/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          bankPaymentMethods: selectedBankMethods,
          boxOfficePaymentMethods: selectedBoxOfficeMethods,
          bankMinTopup: minTopup,
          braceletActivationFee: activationFee,
        }),
      });
      refetch();
      toast({ title: "Configuración de pagos guardada." });
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setIsSavingPaymentConfig(false);
    }
  };

  const handleSelectMode = (mode: InventoryMode) => {
    if (mode === currentMode) return;
    setPendingMode(mode);
    setConfirmType("inventory");
  };

  const handleConfirm = async () => {
    if (!eventId) return;

    if (confirmType === "inventory" && pendingMode) {
      try {
        await updateEvent.mutateAsync({ eventId, data: { inventoryMode: pendingMode } });
        refetch();
        toast({ title: t("eventSettings.inventoryModeChanged") });
      } catch {
        toast({ title: t("common.error"), variant: "destructive" });
      }
    } else if (confirmType === "rotate_key") {
      setIsRotating(true);
      try {
        await customFetch(`/api/events/${eventId}/rotate-signing-key`, { method: "POST" });
        refetch();
        toast({ title: t("eventSettings.signingKeyRotated") });
      } catch {
        toast({ title: t("common.error"), variant: "destructive" });
      } finally {
        setIsRotating(false);
      }
    } else if (confirmType === "generate_desfire_key") {
      setIsGeneratingDesfire(true);
      try {
        await customFetch(`/api/events/${eventId}/generate-desfire-key`, { method: "POST" });
        refetch();
        toast({ title: t("eventSettings.desfireKeyGenerated") });
      } catch {
        toast({ title: t("common.error"), variant: "destructive" });
      } finally {
        setIsGeneratingDesfire(false);
      }
    } else if (confirmType === "generate_ultralight_c_key") {
      setIsGeneratingUltralight(true);
      try {
        await customFetch(`/api/events/${eventId}/generate-ultralight-c-key`, { method: "POST" });
        refetch();
        toast({ title: t("eventSettings.ultralightCKeyGenerated") });
      } catch {
        toast({ title: t("common.error"), variant: "destructive" });
      } finally {
        setIsGeneratingUltralight(false);
      }
    } else if (confirmType === "close_event") {
      setIsClosingEvent(true);
      try {
        const url = pendingRefundCount > 0
          ? `/api/events/${eventId}/close?force=true`
          : `/api/events/${eventId}/close`;
        const result = await customFetch(url, { method: "POST" }) as {
          braceletsFlagged?: number;
          refundRequestsCreated?: number;
        } | undefined;
        refetch();
        refetchFlagged();
        queryClient.invalidateQueries({ queryKey: ["event-settings", eventId] });
        toast({
          title: t("eventSettings.eventClosed"),
          description: t("eventSettings.eventClosedDetail", {
            flagged: result?.braceletsFlagged ?? 0,
            refunds: result?.refundRequestsCreated ?? 0,
          }),
        });
      } catch {
        toast({ title: t("common.error"), variant: "destructive" });
      } finally {
        setIsClosingEvent(false);
      }
    }

    setConfirmType(null);
    setPendingMode(null);
  };

  const handleCloseEventPress = async () => {
    if (!eventId) return;
    setIsCheckingRefunds(true);
    try {
      const result = await customFetch(`/api/events/${eventId}/pending-refund-count`, { method: "GET" }) as { pendingRefundCount: number };
      setPendingRefundCount(result.pendingRefundCount ?? 0);
      setConfirmType("close_event");
    } catch {
      setPendingRefundCount(0);
      setConfirmType("close_event");
    } finally {
      setIsCheckingRefunds(false);
    }
  };

  const handleSaveLimits = async () => {
    if (!eventId) return;
    const syncLimit = parseInt(offlineSyncLimit, 10);
    const braceletLimit = parseInt(maxOfflineSpend, 10);
    if (isNaN(syncLimit) || syncLimit <= 0 || isNaN(braceletLimit) || braceletLimit <= 0) {
      toast({ title: t("eventSettings.invalidLimitValues"), variant: "destructive" });
      return;
    }
    setIsSavingLimits(true);
    try {
      await customFetch(`/api/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({ offlineSyncLimit: syncLimit, maxOfflineSpendPerBracelet: braceletLimit }),
      });
      refetch();
      toast({ title: t("eventSettings.offlineLimitsSaved") });
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setIsSavingLimits(false);
    }
  };

  const handleSelectChipType = (chipType: NfcChipType) => {
    setSelectedChipType(chipType);
  };

  const allowedTypesChanged = selectedChipType !== (currentAllowedTypes[0] ?? "ntag_21x");

  const handleSaveChipTypes = async () => {
    if (!eventId || !allowedTypesChanged) return;
    setIsSavingChipTypes(true);
    try {
      await customFetch(`/api/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          allowedNfcTypes: [selectedChipType],
          nfcChipType: selectedChipType,
        }),
      });
      refetch();
      toast({ title: t("eventSettings.nfcChipSaved") });
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    } finally {
      setIsSavingChipTypes(false);
    }
  };

  const handleUnflag = (nfcUid: string) => {
    unflagBracelet.mutate(
      { nfcUid },
      {
        onSuccess: () => {
          refetchFlagged();
          toast({ title: t("eventSettings.braceletUnflagged") });
        },
        onError: (e: unknown) => {
          toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{t("eventSettings.noEvent")}</p>
      </div>
    );
  }

  const confirmTitle = () => {
    switch (confirmType) {
      case "inventory": return t("eventSettings.changeInventoryMode");
      case "rotate_key": return t("eventSettings.rotateSigningKey");
      case "generate_desfire_key": return t("eventSettings.generateDesfireKey");
      case "generate_ultralight_c_key": return t("eventSettings.generateUltralightCKey");
      case "close_event": return t("eventSettings.closeEvent");
      default: return "";
    }
  };

  const confirmDescription = () => {
    switch (confirmType) {
      case "inventory": return t("eventSettings.inventoryModeWarning");
      case "rotate_key": return t("eventSettings.rotateKeyWarning");
      case "generate_desfire_key": return t("eventSettings.desfireKeyConfirmDesc");
      case "generate_ultralight_c_key": return t("eventSettings.ultralightCKeyConfirmDesc");
      case "close_event": return t("eventSettings.closeEventConfirmDesc");
      default: return "";
    }
  };

  const isConfirmLoading = isRotating || isGeneratingDesfire || isGeneratingUltralight || isClosingEvent || updateEvent.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("eventSettings.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("eventSettings.subtitle")}</p>
      </div>

      {nfcBraceletsEnabled && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t("eventSettings.inventoryMode")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("eventSettings.inventoryModeLabel")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleSelectMode("location_based")}
              className={`relative flex items-start gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
                currentMode === "location_based"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`p-2.5 rounded-lg ${currentMode === "location_based" ? "bg-primary/10" : "bg-muted"}`}>
                <MapPin className={`h-5 w-5 ${currentMode === "location_based" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${currentMode === "location_based" ? "text-primary" : ""}`}>
                    {t("eventSettings.locationBased")}
                  </span>
                  {currentMode === "location_based" && <Badge variant="default">{t("common.active")}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("eventSettings.locationBasedDesc")}</p>
              </div>
            </button>
            <button
              onClick={() => handleSelectMode("centralized_warehouse")}
              className={`relative flex items-start gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
                currentMode === "centralized_warehouse"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`p-2.5 rounded-lg ${currentMode === "centralized_warehouse" ? "bg-primary/10" : "bg-muted"}`}>
                <Package className={`h-5 w-5 ${currentMode === "centralized_warehouse" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${currentMode === "centralized_warehouse" ? "text-primary" : ""}`}>
                    {t("eventSettings.centralizedWarehouse")}
                  </span>
                  {currentMode === "centralized_warehouse" && <Badge variant="default">{t("common.active")}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("eventSettings.centralizedWarehouseDesc")}</p>
              </div>
            </button>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
            <span>{t("eventSettings.inventoryModeWarning")}</span>
          </div>
        </CardContent>
      </Card>}

      {nfcBraceletsEnabled && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("eventSettings.securitySettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t("eventSettings.hmacKeyDescription")}</p>

          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{t("eventSettings.signingKey")}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {event?.hasHmacSecret ? "••••••••••••••••••••••••••••••••" : t("eventSettings.noKeySet")}
                </p>
              </div>
              {event?.hasHmacSecret ? (
                <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />{t("eventSettings.keySet")}</Badge>
              ) : (
                <Badge variant="secondary">{t("eventSettings.noKeySet")}</Badge>
              )}
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setConfirmType("rotate_key")}
              disabled={isRotating}
            >
              {isRotating ? t("common.loading") : t("eventSettings.rotateSigningKey")}
            </Button>
          </div>

          {event?.nfcChipType === "desfire_ev3" && (
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{t("eventSettings.desfireAesKeyLabel")}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {event?.hasDesfireKey ? "••••••••••••••••••••••••••••••••" : t("eventSettings.noKeySet")}
                  </p>
                </div>
                {event?.hasDesfireKey ? (
                  <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />{t("eventSettings.keySet")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("eventSettings.noKeySet")}</Badge>
                )}
              </div>
              <Button
                variant={event?.hasDesfireKey ? "destructive" : "default"}
                className="w-full"
                onClick={() => setConfirmType("generate_desfire_key")}
                disabled={isGeneratingDesfire}
              >
                {isGeneratingDesfire
                  ? t("common.loading")
                  : event?.hasDesfireKey
                    ? t("eventSettings.regenerateDesfireKey")
                    : t("eventSettings.generateDesfireKey")}
              </Button>
            </div>
          )}

          {(event?.nfcChipType === "mifare_ultralight_c" || currentAllowedTypes.includes("mifare_ultralight_c")) && (
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{t("eventSettings.ultralightCDesKeyLabel")}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {event?.hasUltralightCKey ? "••••••••••••••••••••••••••••••••" : t("eventSettings.noKeySet")}
                  </p>
                </div>
                {event?.hasUltralightCKey ? (
                  <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />{t("eventSettings.keySet")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("eventSettings.noKeySet")}</Badge>
                )}
              </div>
              <Button
                variant={event?.hasUltralightCKey ? "destructive" : "default"}
                className="w-full"
                onClick={() => setConfirmType("generate_ultralight_c_key")}
                disabled={isGeneratingUltralight}
              >
                {isGeneratingUltralight
                  ? t("common.loading")
                  : event?.hasUltralightCKey
                    ? t("eventSettings.regenerateUltralightCKey")
                    : t("eventSettings.generateUltralightCKey")}
              </Button>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm">
            <AlertOctagon className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <span>{t("eventSettings.rotateKeyWarning")}</span>
          </div>
        </CardContent>
      </Card>}

      {nfcBraceletsEnabled && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("eventSettings.offlineLimits")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("eventSettings.offlineLimitsDescription")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("eventSettings.offlineSyncLimit")}</Label>
              <p className="text-xs text-muted-foreground">{t("eventSettings.offlineSyncLimitHint")}</p>
              <CurrencyInput
                value={offlineSyncLimit}
                onValueChange={setOfflineSyncLimit}
                placeholder="500000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("eventSettings.maxOfflineSpendPerBracelet")}</Label>
              <p className="text-xs text-muted-foreground">{t("eventSettings.maxOfflineSpendHint")}</p>
              <CurrencyInput
                value={maxOfflineSpend}
                onValueChange={setMaxOfflineSpend}
                placeholder="200000"
              />
            </div>
          </div>
          <Button onClick={handleSaveLimits} disabled={isSavingLimits}>
            {isSavingLimits ? t("common.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>}

      {nfcBraceletsEnabled && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            {t("eventSettings.nfcChipSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("eventSettings.nfcChipSettingsDescription")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { type: "ntag_21x" as NfcChipType, icon: Wifi, label: t("eventSettings.ntag21x"), desc: t("eventSettings.ntag21xDesc") },
              { type: "mifare_classic" as NfcChipType, icon: Cpu, label: t("eventSettings.mifareClassic"), desc: t("eventSettings.mifareClassicDesc") },
              { type: "desfire_ev3" as NfcChipType, icon: Shield, label: t("eventSettings.desfireEv3"), desc: t("eventSettings.desfireEv3Desc") },
              { type: "mifare_ultralight_c" as NfcChipType, icon: Lock, label: t("eventSettings.mifareUltralightC"), desc: t("eventSettings.mifareUltralightCDesc") },
            ]).map(({ type, icon: Icon, label, desc }) => (
              <button
                key={type}
                onClick={() => handleSelectChipType(type)}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-colors text-left ${
                  selectedChipType === type
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selectedChipType === type ? "border-primary" : "border-muted-foreground"}`}>
                  {selectedChipType === type && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${selectedChipType === type ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-medium text-sm">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              </button>
            ))}
          </div>
          {selectedChipType === "mifare_classic" && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <span>{t("eventSettings.mifareClassicWarning")}</span>
            </div>
          )}
          <Button onClick={handleSaveChipTypes} disabled={!allowedTypesChanged || isSavingChipTypes}>
            {isSavingChipTypes ? t("common.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>}

      {(nfcBraceletsEnabled || ticketingEnabled) && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Métodos de Pago
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {nfcBraceletsEnabled && (
            <>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Banco — Recargas</h4>
                {[
                  { value: "cash", label: "Efectivo" },
                  { value: "card_external", label: "Tarjeta (Datafono)" },
                  { value: "nequi_transfer", label: "Nequi" },
                  { value: "bancolombia_transfer", label: "Transferencia" },
                  { value: "other", label: "Otro" },
                ].map((m) => (
                  <div key={m.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`bank-${m.value}`}
                      checked={selectedBankMethods.includes(m.value)}
                      onCheckedChange={(checked) =>
                        setSelectedBankMethods((prev) =>
                          checked
                            ? [...prev, m.value]
                            : prev.length > 1 ? prev.filter((x) => x !== m.value) : prev
                        )
                      }
                    />
                    <Label htmlFor={`bank-${m.value}`}>{m.label}</Label>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankMinTopup">Monto mínimo de recarga (COP)</Label>
                <p className="text-xs text-muted-foreground">0 = sin mínimo adicional (usa el mínimo base de $1.000)</p>
                <CurrencyInput
                  id="bankMinTopup"
                  value={bankMinTopupText}
                  onValueChange={setBankMinTopupText}
                  placeholder="0"
                  className="max-w-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="activationFee">Fee de activación del brazalete (COP)</Label>
                <p className="text-xs text-muted-foreground">Se descuenta de la primera recarga. 0 = sin fee. Por defecto: 3.000</p>
                <CurrencyInput
                  id="activationFee"
                  value={activationFeeText}
                  onValueChange={setActivationFeeText}
                  placeholder="3000"
                  className="max-w-xs"
                />
              </div>
            </>
          )}

          {ticketingEnabled && <div className="space-y-3">
            <h4 className="text-sm font-semibold">Boletería — Venta en puerta</h4>
            {[
              { value: "gate_cash", label: "Efectivo" },
              { value: "gate_transfer", label: "Transferencia" },
              { value: "gate_card", label: "Tarjeta (Datafono)" },
              { value: "gate_nequi", label: "Nequi" },
            ].map((m) => (
              <div key={m.value} className="flex items-center gap-2">
                <Checkbox
                  id={`bo-${m.value}`}
                  checked={selectedBoxOfficeMethods.includes(m.value)}
                  onCheckedChange={(checked) =>
                    setSelectedBoxOfficeMethods((prev) =>
                      checked
                        ? [...prev, m.value]
                        : prev.length > 1 ? prev.filter((x) => x !== m.value) : prev
                    )
                  }
                />
                <Label htmlFor={`bo-${m.value}`}>{m.label}</Label>
              </div>
            ))}
          </div>}

          <Button onClick={handleSavePaymentConfig} disabled={isSavingPaymentConfig}>
            {isSavingPaymentConfig ? t("common.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>}

      <Card className="border-red-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            {t("eventSettings.closeEventSection")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("eventSettings.closeEventDescription")}</p>
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm">
            <AlertOctagon className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <span>{t("eventSettings.closeEventWarning")}</span>
          </div>
          <Button
            variant="destructive"
            onClick={handleCloseEventPress}
            disabled={event?.active === false || isClosingEvent || isCheckingRefunds}
          >
            {isClosingEvent || isCheckingRefunds ? t("common.loading") : t("eventSettings.closeEvent")}
          </Button>
          {event?.active === false && (
            <p className="text-sm text-muted-foreground italic">{t("eventSettings.eventAlreadyClosed")}</p>
          )}
        </CardContent>
      </Card>

      {nfcBraceletsEnabled && <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              {t("eventSettings.flaggedBracelets")}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchFlagged()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{t("eventSettings.flaggedBraceletsDescription")}</p>
          {flaggedBracelets.length === 0 ? (
            <div className="flex items-center gap-2 p-4 rounded-md bg-green-500/10 border border-green-500/30 text-sm">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              <span>{t("eventSettings.noFlaggedBracelets")}</span>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("eventSettings.colUid")}</TableHead>
                    <TableHead>{t("eventSettings.colBalance")}</TableHead>
                    <TableHead>{t("eventSettings.colReason")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedBracelets.map((b) => (
                    <TableRow key={b.nfcUid}>
                      <TableCell className="font-mono font-medium">{b.nfcUid}</TableCell>
                      <TableCell>{b.lastKnownBalance != null ? formatCurrency(b.lastKnownBalance, event?.currencyCode ?? "COP") : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{b.flagReason || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleUnflag(b.nfcUid)} disabled={unflagBracelet.isPending}>
                          {t("eventSettings.unflag")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>}

      <AlertDialog open={confirmType !== null} onOpenChange={(open) => { if (!open) { setConfirmType(null); setPendingMode(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle()}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription()}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmType === "inventory" && pendingMode && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/30 text-sm">
              <span className="font-medium">
                {pendingMode === "location_based" ? t("eventSettings.locationBased") : t("eventSettings.centralizedWarehouse")}
              </span>
            </div>
          )}
          {confirmType === "close_event" && pendingRefundCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <span>{t("eventSettings.closeEventPendingWarning", { count: pendingRefundCount })}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirmLoading}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={isConfirmLoading}
              className={confirmType === "rotate_key" || confirmType === "close_event" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isConfirmLoading
                ? t("common.loading")
                : confirmType === "close_event" && pendingRefundCount > 0
                  ? t("eventSettings.forceCloseEvent")
                  : t("common.yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
