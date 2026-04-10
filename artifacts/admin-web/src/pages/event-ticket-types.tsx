import { useState } from "react";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";

type TicketType = {
  id: string;
  name: string;
  sectionId: string;
  sectionName: string;
  price: number;
  serviceFee: number;
  quantity: number;
  sold: number;
  saleStart: string;
  saleEnd: string;
  active: boolean;
  dayMode: "single" | "full_pass" | "custom";
  selectedDays: string[];
};

type TicketForm = {
  name: string;
  sectionId: string;
  price: string;
  serviceFee: string;
  quantity: string;
  saleStart: string;
  saleEnd: string;
  active: boolean;
  dayMode: "single" | "full_pass" | "custom";
  selectedDays: string[];
};

const emptyForm: TicketForm = {
  name: "",
  sectionId: "",
  price: "",
  serviceFee: "",
  quantity: "",
  saleStart: "",
  saleEnd: "",
  active: true,
  dayMode: "full_pass",
  selectedDays: [],
};

const MOCK_SECTIONS = [
  { id: "sec-1", name: "VIP" },
  { id: "sec-2", name: "General" },
  { id: "sec-3", name: "Palco" },
];

const MOCK_DAYS = [
  { id: "day-1", label: "Day 1 - Friday" },
  { id: "day-2", label: "Day 2 - Saturday" },
  { id: "day-3", label: "Day 3 - Sunday" },
];

export default function EventTicketTypes() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();

  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketType | null>(null);
  const [form, setForm] = useState<TicketForm>(emptyForm);

  const openCreate = () => {
    setEditingTicket(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (ticket: TicketType) => {
    setEditingTicket(ticket);
    setForm({
      name: ticket.name,
      sectionId: ticket.sectionId,
      price: String(ticket.price),
      serviceFee: String(ticket.serviceFee),
      quantity: String(ticket.quantity),
      saleStart: ticket.saleStart,
      saleEnd: ticket.saleEnd,
      active: ticket.active,
      dayMode: ticket.dayMode,
      selectedDays: ticket.selectedDays,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.price || !form.quantity) {
      toast({ title: t("common.error"), description: t("ticketTypes.requiredFields"), variant: "destructive" });
      return;
    }

    const section = MOCK_SECTIONS.find((s) => s.id === form.sectionId);

    if (editingTicket) {
      setTickets((prev) =>
        prev.map((tt) =>
          tt.id === editingTicket.id
            ? {
                ...tt,
                name: form.name,
                sectionId: form.sectionId,
                sectionName: section?.name ?? "",
                price: parseFloat(form.price),
                serviceFee: parseFloat(form.serviceFee) || 0,
                quantity: parseInt(form.quantity),
                saleStart: form.saleStart,
                saleEnd: form.saleEnd,
                active: form.active,
                dayMode: form.dayMode,
                selectedDays: form.selectedDays,
              }
            : tt
        )
      );
      toast({ title: t("ticketTypes.updated") });
    } else {
      const newTicket: TicketType = {
        id: `ticket-${Date.now()}`,
        name: form.name,
        sectionId: form.sectionId,
        sectionName: section?.name ?? "",
        price: parseFloat(form.price),
        serviceFee: parseFloat(form.serviceFee) || 0,
        quantity: parseInt(form.quantity),
        sold: 0,
        saleStart: form.saleStart,
        saleEnd: form.saleEnd,
        active: form.active,
        dayMode: form.dayMode,
        selectedDays: form.selectedDays,
      };
      setTickets((prev) => [...prev, newTicket]);
      toast({ title: t("ticketTypes.created") });
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setTickets((prev) => prev.filter((tt) => tt.id !== id));
    toast({ title: t("ticketTypes.deleted") });
  };

  const toggleDaySelection = (dayId: string) => {
    setForm((f) => ({
      ...f,
      selectedDays: f.selectedDays.includes(dayId)
        ? f.selectedDays.filter((d) => d !== dayId)
        : [...f.selectedDays, dayId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("ticketTypes.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("ticketTypes.subtitle")}</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-ticket-type">
          <Plus className="w-4 h-4 mr-2" /> {t("ticketTypes.addTicketType")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t("ticketTypes.noTicketTypes")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ticketTypes.colName")}</TableHead>
                  <TableHead>{t("ticketTypes.colSection")}</TableHead>
                  <TableHead>{t("ticketTypes.colPrice")}</TableHead>
                  <TableHead>{t("ticketTypes.colServiceFee")}</TableHead>
                  <TableHead>{t("ticketTypes.colAvailable")}</TableHead>
                  <TableHead>{t("ticketTypes.colSold")}</TableHead>
                  <TableHead>{t("ticketTypes.colDays")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-24">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                    <TableCell className="font-medium">{ticket.name}</TableCell>
                    <TableCell>{ticket.sectionName || "—"}</TableCell>
                    <TableCell className="font-mono">${ticket.price.toLocaleString()}</TableCell>
                    <TableCell className="font-mono">${ticket.serviceFee.toLocaleString()}</TableCell>
                    <TableCell>{ticket.quantity.toLocaleString()}</TableCell>
                    <TableCell>{ticket.sold.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ticket.dayMode === "full_pass"
                          ? t("ticketTypes.fullPass")
                          : ticket.dayMode === "single"
                          ? t("ticketTypes.singleDay")
                          : t("ticketTypes.customDays")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticket.active ? "default" : "secondary"}>
                        {ticket.active ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ticket)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(ticket.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {tickets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("ticketTypes.serviceFeesSummary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ticket.name} ({ticket.quantity.toLocaleString()} × ${ticket.serviceFee.toLocaleString()})</span>
                  <span className="font-mono">${(ticket.quantity * ticket.serviceFee).toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex items-center justify-between font-semibold">
                <span>{t("ticketTypes.totalServiceFee")}</span>
                <span className="font-mono text-primary">${tickets.reduce((sum, tt) => sum + tt.quantity * tt.serviceFee, 0).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTicket ? t("ticketTypes.editTicketType") : t("ticketTypes.addTicketType")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>{t("ticketTypes.ticketName")} *</Label>
              <Input
                data-testid="input-ticket-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("ticketTypes.ticketNamePlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("ticketTypes.colSection")}</Label>
              <Select value={form.sectionId} onValueChange={(v) => setForm((f) => ({ ...f, sectionId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("ticketTypes.selectSection")} /></SelectTrigger>
                <SelectContent>
                  {MOCK_SECTIONS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t("ticketTypes.colPrice")} *</Label>
                <Input
                  data-testid="input-ticket-price"
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.colServiceFee")}</Label>
                <Input
                  data-testid="input-ticket-service-fee"
                  type="number"
                  min="0"
                  value={form.serviceFee}
                  onChange={(e) => setForm((f) => ({ ...f, serviceFee: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.quantity")} *</Label>
                <Input
                  data-testid="input-ticket-quantity"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("ticketTypes.saleStart")}</Label>
                <Input
                  type="datetime-local"
                  value={form.saleStart}
                  onChange={(e) => setForm((f) => ({ ...f, saleStart: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("ticketTypes.saleEnd")}</Label>
                <Input
                  type="datetime-local"
                  value={form.saleEnd}
                  onChange={(e) => setForm((f) => ({ ...f, saleEnd: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("ticketTypes.validDays")}</Label>
              <Select value={form.dayMode} onValueChange={(v) => setForm((f) => ({ ...f, dayMode: v as TicketForm["dayMode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_pass">{t("ticketTypes.fullPass")}</SelectItem>
                  <SelectItem value="single">{t("ticketTypes.singleDay")}</SelectItem>
                  <SelectItem value="custom">{t("ticketTypes.customDays")}</SelectItem>
                </SelectContent>
              </Select>
              {form.dayMode === "custom" && (
                <div className="space-y-1 pl-1">
                  {MOCK_DAYS.map((day) => (
                    <label key={day.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.selectedDays.includes(day.id)}
                        onChange={() => toggleDaySelection(day.id)}
                        className="rounded"
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label>{t("common.status")}</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
