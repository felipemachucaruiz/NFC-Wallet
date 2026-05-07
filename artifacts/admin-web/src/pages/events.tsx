import { fmtDate } from "@/lib/date";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useListPromoterCompanies,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import type { Event } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, MapPin, ChevronDown, ChevronsUpDown, Check, Building2, Upload, Ticket, X, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { LocationMapPicker } from "@/components/LocationMapPicker";
import { apiUploadEventImage } from "@/lib/api";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useEventContext } from "@/contexts/event-context";

const ADMIN_API_BASE = `${import.meta.env.BASE_URL}_srv`;
function resolveAdminUrl(url: string): string {
  if (!url) return url;
  return url.startsWith("/") ? `${ADMIN_API_BASE}${url}` : url;
}

function toLocalDatetimeInput(utcString: string): string {
  const d = new Date(utcString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type EventAdminForm = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

type EventForm = {
  name: string;
  description: string;
  descriptionEn: string;
  category: string;
  cityId: string;
  venueAddress: string;
  capacity: string;
  startsAt: string;
  endsAt: string;
  refundDeadline: string;
  latitude: number | null;
  longitude: number | null;
  commissionRate: string;
  promoterCompanyId: string;
  pulepId: string;
  nfcChipType: string;
  currencyCode: string;
  minAge: string;
  ticketingEnabled: boolean;
  nfcBraceletsEnabled: boolean;
  coverImageUrl: string;
  flyerImageUrl: string;
  floatingGraphics: Array<{ url: string; opacity: number }>;
  vimeoUrl: string;
  eventAdmin: EventAdminForm;
};

const emptyAdmin: EventAdminForm = { email: "", password: "", firstName: "", lastName: "" };

const emptyForm: EventForm = {
  name: "",
  description: "",
  descriptionEn: "",
  category: "",
  cityId: "",
  venueAddress: "",
  capacity: "",
  startsAt: "",
  endsAt: "",
  refundDeadline: "",
  latitude: null,
  longitude: null,
  commissionRate: "",
  promoterCompanyId: "",
  pulepId: "",
  nfcChipType: "ntag_21x",
  currencyCode: "COP",
  minAge: "",
  ticketingEnabled: false,
  nfcBraceletsEnabled: true,
  coverImageUrl: "",
  flyerImageUrl: "",
  floatingGraphics: [],
  vimeoUrl: "",
  eventAdmin: { ...emptyAdmin },
};

const CURRENCY_OPTIONS = [
  { value: "COP", label: "COP — Peso colombiano" },
  { value: "MXN", label: "MXN — Peso mexicano" },
  { value: "CLP", label: "CLP — Peso chileno" },
  { value: "ARS", label: "ARS — Peso argentino" },
  { value: "PEN", label: "PEN — Sol peruano" },
  { value: "UYU", label: "UYU — Peso uruguayo" },
  { value: "BOB", label: "BOB — Boliviano" },
  { value: "BRL", label: "BRL — Real brasileño" },
  { value: "USD", label: "USD — US Dollar" },
];

const NFC_CHIP_OPTIONS = [
  { value: "ntag_21x", label: "NTAG 21x" },
  { value: "mifare_classic", label: "Mifare Classic" },
  { value: "desfire_ev3", label: "DESFire EV3" },
  { value: "mifare_ultralight_c", label: "Mifare Ultralight C" },
];

const EVENT_CATEGORY_OPTIONS = [
  { value: "concert", labelKey: "events.categoryConcert" },
  { value: "festival", labelKey: "events.categoryFestival" },
  { value: "sports", labelKey: "events.categorySports" },
  { value: "theater", labelKey: "events.categoryTheater" },
  { value: "conference", labelKey: "events.categoryConference" },
  { value: "party", labelKey: "events.categoryParty" },
  { value: "other", labelKey: "events.categoryOther" },
];

type RawEvent = Event & {
  promoterCompanyName?: string | null;
  promoterCompanyId?: string | null;
  capacity?: number | null;
  latitude?: string | null;
  longitude?: string | null;
  platformCommissionRate?: string | null;
  pulepId?: string | null;
  nfcChipType?: string | null;
  currencyCode?: string | null;
  refundDeadline?: string | null;
  minAge?: number | null;
  ticketingEnabled?: boolean;
  nfcBraceletsEnabled?: boolean;
  coverImageUrl?: string | null;
  flyerImageUrl?: string | null;
  descriptionEn?: string | null;
  floatingGraphics?: Array<{ url: string; opacity: number }> | null;
  floatingGraphicUrl?: string | null;
  vimeoUrl?: string | null;
};

type FormFieldsProps = {
  isCreate: boolean;
  form: EventForm;
  setForm: React.Dispatch<React.SetStateAction<EventForm>>;
  promoterCompanies: { id: string; companyName: string }[];
  cities: { id: string; name: string }[];
  mapPickerOpen: boolean;
  setMapPickerOpen: (open: boolean) => void;
  adminOpen: boolean;
  setAdminOpen: (open: boolean) => void;
  eventId?: string;
  pendingImages?: { cover: File | null; flyer: File | null };
  setPendingImages?: React.Dispatch<React.SetStateAction<{ cover: File | null; flyer: File | null }>>;
  pendingGraphics?: Array<{ file: File; opacity: number; previewUrl: string }>;
  setPendingGraphics?: React.Dispatch<React.SetStateAction<Array<{ file: File; opacity: number; previewUrl: string }>>>;
};

function ImageUploadField({
  label,
  hint,
  currentUrl,
  eventId,
  imageType,
  isCreate,
  pendingFile,
  onPendingFileChange,
  onUploaded,
}: {
  label: string;
  hint?: string;
  currentUrl: string;
  eventId?: string;
  imageType: "cover" | "flyer" | "floating_graphic";
  isCreate: boolean;
  pendingFile?: File | null;
  onPendingFileChange?: (f: File | null) => void;
  onUploaded?: (url: string) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setRemoved(false);

    if (isCreate) {
      onPendingFileChange?.(file);
      return;
    }

    if (!eventId) return;
    setUploading(true);
    try {
      const { imageUrl } = await apiUploadEventImage(eventId, imageType, file);
      onUploaded?.(imageUrl);
      toast({ title: t("events.imageUploaded") });
    } catch (err: unknown) {
      toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewUrl(null);
    setRemoved(true);
    onUploaded?.("");
    if (isCreate) {
      onPendingFileChange?.(null);
    }
  };

  const rawDisplayUrl = removed ? null : (previewUrl || currentUrl || null);
  const displayUrl = rawDisplayUrl && rawDisplayUrl.length > 1 ? rawDisplayUrl : null;
  const resolvedSrc = displayUrl?.startsWith("http") || displayUrl?.startsWith("blob:") ? displayUrl : displayUrl ? `${import.meta.env.BASE_URL}_srv${displayUrl}` : "";
  const isCover = imageType === "cover";
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {hint && (
          <span className="text-[10px] text-muted-foreground">({hint})</span>
        )}
      </div>
      <div className="relative">
        <label className={cn(
          "flex flex-col items-center justify-center border-2 border-dashed rounded-md cursor-pointer hover:border-primary/50 transition-colors",
          isCover ? "h-24" : "h-24 w-24",
          uploading && "opacity-60 pointer-events-none"
        )}>
          {resolvedSrc && !imgError ? (
            <img
              src={resolvedSrc}
              alt={label}
              className={cn("rounded-md object-cover", isCover ? "h-full w-full" : "h-full w-full")}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs p-2">
              <Upload className="w-5 h-5" />
              <span>{uploading ? t("events.uploading") : t("events.clickToUpload")}</span>
            </div>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} disabled={uploading} />
        </label>
        {resolvedSrc && imgLoaded && !imgError && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-destructive/80 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {pendingFile && isCreate && (
        <p className="text-xs text-muted-foreground">{pendingFile.name}</p>
      )}
    </div>
  );
}

function FormFields({
  isCreate,
  form,
  setForm,
  promoterCompanies,
  cities,
  mapPickerOpen,
  setMapPickerOpen,
  adminOpen,
  setAdminOpen,
  eventId,
  pendingImages,
  setPendingImages,
  pendingGraphics,
  setPendingGraphics,
}: FormFieldsProps) {
  const { t } = useTranslation();
  const [promoterOpen, setPromoterOpen] = useState(false);
  const [descTab, setDescTab] = useState<"es" | "en">("es");
  const selectedCompany = promoterCompanies.find((pc) => pc.id === form.promoterCompanyId);
  const atLeastOneModule = form.ticketingEnabled || form.nfcBraceletsEnabled;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>{t("events.eventName")}</Label>
        <Input data-testid="input-event-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>

      <div className="border rounded-md p-3 space-y-3">
        <Label className="text-sm font-semibold">{t("events.modulesSection")}</Label>
        <p className="text-xs text-muted-foreground">{t("events.modulesHint")}</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("events.ticketingModule")}</p>
            <p className="text-xs text-muted-foreground">{t("events.ticketingModuleDesc")}</p>
          </div>
          <Switch
            data-testid="toggle-ticketing"
            checked={form.ticketingEnabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, ticketingEnabled: v }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("events.nfcBraceletsModule")}</p>
            <p className="text-xs text-muted-foreground">{t("events.nfcBraceletsModuleDesc")}</p>
          </div>
          <Switch
            data-testid="toggle-nfc-bracelets"
            checked={form.nfcBraceletsEnabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, nfcBraceletsEnabled: v }))}
          />
        </div>
        {!atLeastOneModule && (
          <p className="text-xs text-destructive">{t("events.atLeastOneModule")}</p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>{t("events.description")}</Label>
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setDescTab("es")}
              className={cn("px-2.5 py-1 transition-colors", descTab === "es" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
            >
              Español
            </button>
            <button
              type="button"
              onClick={() => setDescTab("en")}
              className={cn("px-2.5 py-1 transition-colors border-l border-border", descTab === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
            >
              English
            </button>
          </div>
        </div>
        {descTab === "es" ? (
          <RichTextEditor
            key="desc-es"
            value={form.description}
            onChange={(html) => setForm((f) => ({ ...f, description: html }))}
          />
        ) : (
          <RichTextEditor
            key="desc-en"
            value={form.descriptionEn}
            onChange={(html) => setForm((f) => ({ ...f, descriptionEn: html }))}
            placeholder="English description..."
          />
        )}
      </div>

      <div className="space-y-1">
        <Label>{t("events.category")}</Label>
        <Select
          value={form.category || "__none__"}
          onValueChange={(v) => setForm((f) => ({ ...f, category: v === "__none__" ? "" : v }))}
        >
          <SelectTrigger data-testid="select-event-category">
            <SelectValue placeholder={t("events.categoryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("events.categoryPlaceholder")}</SelectItem>
            {EVENT_CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>{t("events.city", "Ciudad")}</Label>
        <Select
          value={form.cityId || "__none__"}
          onValueChange={(v) => setForm((f) => ({ ...f, cityId: v === "__none__" ? "" : v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("events.cityPlaceholder", "Sin ciudad asignada")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("events.cityPlaceholder", "Sin ciudad asignada")}</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ImageUploadField
          label={t("events.coverImage")}
          hint={t("events.coverImageHint")}
          currentUrl={form.coverImageUrl}
          eventId={eventId}
          imageType="cover"
          isCreate={isCreate}
          pendingFile={pendingImages?.cover}
          onPendingFileChange={(f) => setPendingImages?.((prev) => ({ ...prev, cover: f }))}
          onUploaded={(url) => setForm((f) => ({ ...f, coverImageUrl: url }))}
        />
        <ImageUploadField
          label={t("events.flyerImage")}
          hint={t("events.flyerImageHint")}
          currentUrl={form.flyerImageUrl}
          eventId={eventId}
          imageType="flyer"
          isCreate={isCreate}
          pendingFile={pendingImages?.flyer}
          onPendingFileChange={(f) => setPendingImages?.((prev) => ({ ...prev, flyer: f }))}
          onUploaded={(url) => setForm((f) => ({ ...f, flyerImageUrl: url }))}
        />
      </div>

      {/* Floating graphics manager */}
      <div className="space-y-2">
        <div>
          <Label>{t("events.floatingGraphics", "Gráficos flotantes")}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{t("events.floatingGraphicsHint", "PNG transparente recomendado — cada gráfico flota animado en la página del evento")}</p>
        </div>
        <div className="space-y-2">
          {/* Saved graphics (edit mode) */}
          {form.floatingGraphics.map((g, idx) => (
            <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-card/50">
              <img src={resolveAdminUrl(g.url)} alt="" className="w-10 h-10 object-contain rounded shrink-0 bg-white/5" />
              <div className="flex items-center gap-1.5 shrink-0">
                <Label className="text-xs whitespace-nowrap">{t("events.opacity", "Opacidad")}</Label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(g.opacity * 100)}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
                    setForm((f) => ({
                      ...f,
                      floatingGraphics: f.floatingGraphics.map((item, i) => i === idx ? { ...item, opacity: v / 100 } : item),
                    }));
                  }}
                  className="w-14 h-7 text-sm text-center rounded border border-input bg-transparent px-1"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, floatingGraphics: f.floatingGraphics.filter((_, i) => i !== idx) }))}
                className="ml-auto p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {/* Pending graphics (create mode) */}
          {isCreate && pendingGraphics?.map((pg, idx) => (
            <div key={`p-${idx}`} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-card/50">
              <img src={pg.previewUrl} alt="" className="w-10 h-10 object-contain rounded shrink-0 bg-white/5" />
              <div className="flex items-center gap-1.5 shrink-0">
                <Label className="text-xs whitespace-nowrap">{t("events.opacity", "Opacidad")}</Label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Math.round(pg.opacity * 100)}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
                    setPendingGraphics?.((prev) => prev.map((item, i) => i === idx ? { ...item, opacity: v / 100 } : item));
                  }}
                  className="w-14 h-7 text-sm text-center rounded border border-input bg-transparent px-1"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <button
                type="button"
                onClick={() => setPendingGraphics?.((prev) => prev.filter((_, i) => i !== idx))}
                className="ml-auto p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {/* Add graphic button */}
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";
              if (isCreate) {
                const previewUrl = URL.createObjectURL(file);
                setPendingGraphics?.((prev) => [...prev, { file, opacity: 0.4, previewUrl }]);
              } else if (eventId) {
                try {
                  const { imageUrl } = await apiUploadEventImage(eventId, "floating_graphic", file);
                  setForm((f) => ({ ...f, floatingGraphics: [...f.floatingGraphics, { url: imageUrl, opacity: 0.4 }] }));
                } catch {}
              }
            }}
          />
          <span className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
            <Upload className="w-4 h-4" />
            {t("events.addFloatingGraphic", "Agregar gráfico")}
          </span>
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Label>{t("events.vimeoUrl", "Video de Vimeo")}</Label>
          <span className="text-[10px] text-muted-foreground">(URL o ID del video)</span>
        </div>
        <Input
          value={form.vimeoUrl}
          onChange={(e) => setForm((f) => ({ ...f, vimeoUrl: e.target.value }))}
          placeholder="https://vimeo.com/123456789"
        />
      </div>

      <div className="space-y-1">
        <Label>{t("events.venueAddress")}</Label>
        <div className="flex gap-2">
          <Input
            data-testid="input-event-venue"
            value={form.venueAddress}
            onChange={(e) => setForm((f) => ({ ...f, venueAddress: e.target.value }))}
            className="flex-1"
            placeholder={t("locationPicker.addressPlaceholder")}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            title={t("locationPicker.pickOnMap")}
            onClick={() => setMapPickerOpen(true)}
          >
            <MapPin className="w-4 h-4 text-primary" />
          </Button>
        </div>
      </div>
      <LocationMapPicker
        open={mapPickerOpen}
        initialAddress={form.venueAddress}
        onConfirm={(addr, lat, lng) => setForm((f) => ({ ...f, venueAddress: addr, latitude: lat ?? null, longitude: lng ?? null }))}
        onClose={() => setMapPickerOpen(false)}
      />
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>{t("events.capacity")}</Label>
          <Input
            data-testid="input-event-capacity"
            type="number"
            min="1"
            value={form.capacity}
            onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            placeholder={t("events.capacityPlaceholder")}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("events.minAge")}</Label>
          <Input
            data-testid="input-event-min-age"
            type="number"
            min="0"
            max="99"
            value={form.minAge}
            onChange={(e) => setForm((f) => ({ ...f, minAge: e.target.value }))}
            placeholder={t("events.minAgePlaceholder")}
          />
        </div>
        <div className="space-y-1">
          <Label>{t("events.commissionRate")}</Label>
          <Input
            data-testid="input-event-commission"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.commissionRate}
            onChange={(e) => setForm((f) => ({ ...f, commissionRate: e.target.value }))}
            placeholder={t("events.commissionRatePlaceholder")}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{t("events.startsAt")}</Label>
          <DateTimePicker data-testid="input-event-starts" value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))} />
        </div>
        <div className="space-y-1">
          <Label>{t("events.endsAt")}</Label>
          <DateTimePicker data-testid="input-event-ends" value={form.endsAt} onChange={(newEndsAt) => {
            setForm((f) => {
              const updated = { ...f, endsAt: newEndsAt };
              if (newEndsAt && f.refundDeadline) {
                const minDeadline = new Date(new Date(newEndsAt).getTime() + 15 * 24 * 60 * 60 * 1000);
                if (new Date(f.refundDeadline) < minDeadline) {
                  updated.refundDeadline = minDeadline.toISOString().slice(0, 16);
                }
              }
              return updated;
            });
          }} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>{t("events.refundDeadline")}</Label>
        <DateTimePicker value={form.refundDeadline} onChange={(v) => setForm((f) => ({ ...f, refundDeadline: v }))} />
        <p className="text-xs text-muted-foreground">{t("events.refundDeadlineHint")}</p>
      </div>

      <div className="space-y-1">
        <Label>{t("events.currency")}</Label>
        <Select
          value={form.currencyCode}
          onValueChange={(v) => setForm((f) => ({ ...f, currencyCode: v }))}
        >
          <SelectTrigger data-testid="select-currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border-t pt-3 space-y-3">
        <div className="space-y-1">
          <Label>{t("events.promoterCompany")}</Label>
          <Popover open={promoterOpen} onOpenChange={setPromoterOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                data-testid="select-promoter-company"
                className="w-full justify-between font-normal"
              >
                {selectedCompany ? (
                  <span className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {selectedCompany.companyName}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("events.selectPromoterCompany")}</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder={t("events.searchPromoterCompany")} />
                <CommandList>
                  <CommandEmpty>{t("events.noPromoterFound")}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => { setForm((f) => ({ ...f, promoterCompanyId: "" })); setPromoterOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", !form.promoterCompanyId ? "opacity-100" : "opacity-0")} />
                      {t("events.noPromoterCompany")}
                    </CommandItem>
                    {promoterCompanies.map((pc) => (
                      <CommandItem
                        key={pc.id}
                        value={pc.companyName}
                        onSelect={() => { setForm((f) => ({ ...f, promoterCompanyId: pc.id })); setPromoterOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", form.promoterCompanyId === pc.id ? "opacity-100" : "opacity-0")} />
                        {pc.companyName}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label>{t("events.pulepId")}</Label>
          <Input
            data-testid="input-event-pulep"
            value={form.pulepId}
            onChange={(e) => setForm((f) => ({ ...f, pulepId: e.target.value }))}
            placeholder={t("events.pulepIdPlaceholder")}
          />
        </div>

        <div className="space-y-1">
          <Label>{t("events.nfcChipType")}</Label>
          <Select
            value={form.nfcChipType}
            onValueChange={(v) => setForm((f) => ({ ...f, nfcChipType: v }))}
          >
            <SelectTrigger data-testid="select-nfc-chip-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NFC_CHIP_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isCreate && (
        <Collapsible open={adminOpen} onOpenChange={setAdminOpen} className="border rounded-md">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full flex items-center justify-between px-3 py-2 h-auto"
              data-testid="toggle-organizer-section"
            >
              <span className="text-sm font-medium">{t("events.organizerSection")}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${adminOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 space-y-3">
            <p className="text-xs text-muted-foreground">{t("events.organizerHint")}</p>
            <div className="space-y-1">
              <Label>{t("events.adminEmail")}</Label>
              <Input
                data-testid="input-admin-email"
                type="email"
                value={form.eventAdmin.email}
                onChange={(e) => setForm((f) => ({ ...f, eventAdmin: { ...f.eventAdmin, email: e.target.value } }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("events.adminPassword")}</Label>
              <Input
                data-testid="input-admin-password"
                type="password"
                value={form.eventAdmin.password}
                onChange={(e) => setForm((f) => ({ ...f, eventAdmin: { ...f.eventAdmin, password: e.target.value } }))}
                placeholder={t("events.adminPasswordPlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("events.adminFirstName")}</Label>
                <Input
                  data-testid="input-admin-firstname"
                  value={form.eventAdmin.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, eventAdmin: { ...f.eventAdmin, firstName: e.target.value } }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("events.adminLastName")}</Label>
                <Input
                  data-testid="input-admin-lastname"
                  value={form.eventAdmin.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, eventAdmin: { ...f.eventAdmin, lastName: e.target.value } }))}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export default function Events() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { setEventId } = useEventContext();
  const { data, isLoading } = useListEvents();
  const events = (data?.events ?? []) as RawEvent[];
  const { data: promoterData } = useListPromoterCompanies();
  const promoterCompanies = promoterData?.companies ?? [];

  const { data: citiesData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["admin-cities"],
    queryFn: async () => {
      const token = localStorage.getItem("tapee_admin_token");
      const res = await fetch(`${import.meta.env.BASE_URL}_srv/api/cities`, {
        headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
      });
      const data = await res.json();
      return (data.cities ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const cities = citiesData ?? [];

  const handleManageTicketing = (event: RawEvent) => {
    setEventId(event.id);
    setLocation("/event-ticket-types");
  };

  const handleManageEvent = (event: RawEvent) => {
    setEventId(event.id);
    setLocation("/event-settings");
  };

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [pendingImages, setPendingImages] = useState<{ cover: File | null; flyer: File | null }>({ cover: null, flyer: null });
  const [pendingGraphics, setPendingGraphics] = useState<Array<{ file: File; opacity: number; previewUrl: string }>>([]);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });

  const filtered = events.filter((e) => {
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || (e.venueAddress ?? "").toLowerCase().includes(q);
  });

  const openCreate = () => {
    setForm({ ...emptyForm, eventAdmin: { ...emptyAdmin } });
    setPendingGraphics([]);
    setAdminOpen(false);
    setCreateOpen(true);
  };

  const openEdit = (event: RawEvent) => {
    setSelectedEvent(event);
    const raw = event;
    setForm({
      name: event.name,
      description: event.description ?? "",
      descriptionEn: (raw as any).descriptionEn ?? "",
      category: (raw as any).category ?? "",
      cityId: (raw as any).cityId ?? "",
      venueAddress: event.venueAddress ?? "",
      capacity: raw.capacity != null ? String(raw.capacity) : "",
      startsAt: event.startsAt ? toLocalDatetimeInput(event.startsAt) : "",
      endsAt: event.endsAt ? toLocalDatetimeInput(event.endsAt) : "",
      refundDeadline: event.refundDeadline ? toLocalDatetimeInput(event.refundDeadline) : "",
      latitude: raw.latitude ? parseFloat(raw.latitude) : null,
      longitude: raw.longitude ? parseFloat(raw.longitude) : null,
      commissionRate: raw.platformCommissionRate ?? "",
      promoterCompanyId: raw.promoterCompanyId ?? "",
      pulepId: raw.pulepId ?? "",
      nfcChipType: raw.nfcChipType ?? "ntag_21x",
      currencyCode: raw.currencyCode ?? "COP",
      minAge: raw.minAge != null ? String(raw.minAge) : "",
      ticketingEnabled: raw.ticketingEnabled ?? false,
      nfcBraceletsEnabled: raw.nfcBraceletsEnabled ?? true,
      coverImageUrl: raw.coverImageUrl ?? "",
      flyerImageUrl: raw.flyerImageUrl ?? "",
      floatingGraphics: raw.floatingGraphics?.length
        ? raw.floatingGraphics
        : (raw.floatingGraphicUrl ? [{ url: raw.floatingGraphicUrl, opacity: 0.4 }] : []),
      vimeoUrl: raw.vimeoUrl ?? "",
      eventAdmin: { ...emptyAdmin },
    });
    setEditOpen(true);
  };

  const adminPartiallyFilled = !!(form.eventAdmin.email || form.eventAdmin.password || form.eventAdmin.firstName || form.eventAdmin.lastName) && !(form.eventAdmin.email && form.eventAdmin.password);

  const handleCreate = () => {
    if (!form.ticketingEnabled && !form.nfcBraceletsEnabled) {
      toast({ title: t("common.error"), description: t("events.atLeastOneModule"), variant: "destructive" });
      return;
    }
    if (adminPartiallyFilled) {
      toast({ title: t("common.error"), description: t("events.adminIncomplete"), variant: "destructive" });
      return;
    }
    const capNum = form.capacity ? parseInt(form.capacity, 10) : undefined;
    const minAgeNum = form.minAge ? parseInt(form.minAge, 10) : undefined;
    const hasAdmin = form.eventAdmin.email && form.eventAdmin.password;
    const payload: any = {
      name: form.name,
      description: form.description || undefined,
      descriptionEn: form.descriptionEn || null,
      venueAddress: form.venueAddress || undefined,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      refundDeadline: form.refundDeadline ? new Date(form.refundDeadline).toISOString() : undefined,
      capacity: capNum && capNum > 0 ? capNum : undefined,
      minAge: minAgeNum != null && minAgeNum >= 0 ? minAgeNum : undefined,
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
      platformCommissionRate: form.commissionRate || undefined,
      promoterCompanyId: form.promoterCompanyId || undefined,
      pulepId: form.pulepId || undefined,
      nfcChipType: form.nfcChipType || undefined,
      currencyCode: form.currencyCode || "COP",
      category: form.category || undefined,
      cityId: form.cityId || undefined,
      ticketingEnabled: form.ticketingEnabled,
      nfcBraceletsEnabled: form.nfcBraceletsEnabled,
      ...(hasAdmin ? {
        eventAdmin: {
          email: form.eventAdmin.email,
          password: form.eventAdmin.password,
          firstName: form.eventAdmin.firstName || undefined,
          lastName: form.eventAdmin.lastName || undefined,
        },
      } : {}),
    };
    createEvent.mutate(
      { data: payload },
      {
        onSuccess: async (data: any) => {
          const newEventId = data?.event?.id;
          if (newEventId) {
            const uploads: Promise<unknown>[] = [];
            if (pendingImages.cover) uploads.push(apiUploadEventImage(newEventId, "cover", pendingImages.cover).catch(() => {}));
            if (pendingImages.flyer) uploads.push(apiUploadEventImage(newEventId, "flyer", pendingImages.flyer).catch(() => {}));
            if (uploads.length) await Promise.all(uploads);
            if (pendingGraphics.length) {
              const graphicResults = await Promise.allSettled(
                pendingGraphics.map((pg) => apiUploadEventImage(newEventId, "floating_graphic", pg.file))
              );
              const floatingGraphics = graphicResults
                .map((r, i) => r.status === "fulfilled" ? { url: r.value.imageUrl, opacity: pendingGraphics[i].opacity } : null)
                .filter(Boolean) as Array<{ url: string; opacity: number }>;
              if (floatingGraphics.length) {
                await apiUpdateEvent(newEventId, { floatingGraphics }).catch(() => {});
              }
            }
          }
          setPendingImages({ cover: null, flyer: null });
          setPendingGraphics([]);
          toast({ title: t("events.created") });
          setCreateOpen(false);
          invalidate();
        },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleUpdate = () => {
    if (!selectedEvent) return;
    if (!form.ticketingEnabled && !form.nfcBraceletsEnabled) {
      toast({ title: t("common.error"), description: t("events.atLeastOneModule"), variant: "destructive" });
      return;
    }
    const capNum = form.capacity ? parseInt(form.capacity, 10) : undefined;
    const minAgeNum = form.minAge ? parseInt(form.minAge, 10) : null;
    const payload: any = {
      name: form.name,
      description: form.description || undefined,
      descriptionEn: form.descriptionEn || null,
      venueAddress: form.venueAddress || undefined,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      refundDeadline: form.refundDeadline ? new Date(form.refundDeadline).toISOString() : null,
      capacity: capNum && capNum > 0 ? capNum : null,
      minAge: minAgeNum != null && minAgeNum >= 0 ? minAgeNum : null,
      latitude: form.latitude ?? undefined,
      longitude: form.longitude ?? undefined,
      platformCommissionRate: form.commissionRate || undefined,
      promoterCompanyId: form.promoterCompanyId || null,
      pulepId: form.pulepId || null,
      nfcChipType: form.nfcChipType || undefined,
      currencyCode: form.currencyCode || undefined,
      category: form.category || null,
      cityId: form.cityId || null,
      ticketingEnabled: form.ticketingEnabled,
      nfcBraceletsEnabled: form.nfcBraceletsEnabled,
      coverImageUrl: form.coverImageUrl || null,
      flyerImageUrl: form.flyerImageUrl || null,
      vimeoUrl: form.vimeoUrl || null,
      floatingGraphics: form.floatingGraphics.length ? form.floatingGraphics : null,
    };
    updateEvent.mutate(
      { eventId: selectedEvent.id, data: payload },
      {
        onSuccess: () => { toast({ title: t("events.updated") }); setEditOpen(false); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleToggleActive = (event: Event) => {
    updateEvent.mutate(
      { eventId: event.id, data: { active: !event.active } },
      {
        onSuccess: () => { toast({ title: event.active ? t("events.deactivated") : t("events.activated") }); invalidate(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("events.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("events.subtitle")}</p>
        </div>
        <Button data-testid="button-create-event" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> {t("events.newEvent")}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-event-search" placeholder={t("events.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("events.colName")}</TableHead>
              <TableHead>{t("events.colVenue")}</TableHead>
              <TableHead>{t("events.colPromoter")}</TableHead>
              <TableHead>{t("events.colStarts")}</TableHead>
              <TableHead>{t("events.colEnds")}</TableHead>
              <TableHead>{t("events.colStatus")}</TableHead>
              <TableHead className="w-24">{t("events.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("events.noEvents")}</TableCell></TableRow>
            ) : (
              filtered.map((event) => (
                <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{event.venueAddress ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {event.promoterCompanyName ? (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {event.promoterCompanyName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{event.startsAt ? fmtDate(event.startsAt) : "—"}</TableCell>
                  <TableCell className="text-sm">{event.endsAt ? fmtDate(event.endsAt) : "—"}</TableCell>
                  <TableCell>
                    {(() => {
                      const expired = event.endsAt && new Date(event.endsAt) < new Date();
                      const effectivelyActive = event.active && !expired;
                      return (
                        <div className="flex items-center gap-2">
                          <Switch
                            data-testid={`toggle-event-active-${event.id}`}
                            checked={event.active}
                            onCheckedChange={() => handleToggleActive(event)}
                          />
                          {expired && event.active ? (
                            <Badge variant="outline" className="text-xs border-orange-500/40 text-orange-500">
                              {t("events.autoEnded")}
                            </Badge>
                          ) : (
                            <Badge variant={effectivelyActive ? "default" : "secondary"} className="text-xs">
                              {effectivelyActive ? t("common.active") : t("common.inactive")}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="Gestionar evento" onClick={() => handleManageEvent(event)}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      {event.ticketingEnabled && (
                        <Button variant="ghost" size="icon" title={t("nav.manageTicketing")} onClick={() => handleManageTicketing(event)}>
                          <Ticket className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" data-testid={`button-edit-event-${event.id}`} onClick={() => openEdit(event)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("events.createEvent")}</DialogTitle></DialogHeader>
          <FormFields
            isCreate={true}
            form={form}
            setForm={setForm}
            promoterCompanies={promoterCompanies}
            cities={cities}
            mapPickerOpen={mapPickerOpen}
            setMapPickerOpen={setMapPickerOpen}
            adminOpen={adminOpen}
            setAdminOpen={setAdminOpen}
            pendingImages={pendingImages}
            setPendingImages={setPendingImages}
            pendingGraphics={pendingGraphics}
            setPendingGraphics={setPendingGraphics}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-event" onClick={handleCreate} disabled={createEvent.isPending || !form.name}>
              {createEvent.isPending ? t("events.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("events.editEvent")} — {selectedEvent?.name}</DialogTitle></DialogHeader>
          <FormFields
            isCreate={false}
            form={form}
            setForm={setForm}
            promoterCompanies={promoterCompanies}
            cities={cities}
            mapPickerOpen={mapPickerOpen}
            setMapPickerOpen={setMapPickerOpen}
            adminOpen={adminOpen}
            setAdminOpen={setAdminOpen}
            eventId={selectedEvent?.id}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-edit-event" onClick={handleUpdate} disabled={updateEvent.isPending || !form.name}>
              {updateEvent.isPending ? t("events.saving") : t("events.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
