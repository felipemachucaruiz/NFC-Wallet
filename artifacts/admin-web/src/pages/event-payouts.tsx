import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListPayouts,
  useCreatePayout,
  useListMerchants,
  getListPayoutsQueryKey,
} from "@workspace/api-client-react";
import type { MerchantPayout } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function EventPayouts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const { data, isLoading } = useListPayouts({ eventId: eventId || undefined });
  const payouts = data?.payouts ?? [];
  const { data: merchantsData } = useListMerchants({ eventId: eventId || undefined });
  const merchants = merchantsData?.merchants ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ merchantId: "", periodFrom: "", periodTo: "", paidAt: "", paymentMethod: "cash" as string, referenceNote: "" });

  const createPayout = useCreatePayout();

  const handleCreate = () => {
    if (!eventId) return;
    createPayout.mutate(
      {
        data: {
          merchantId: form.merchantId,
          eventId,
          periodFrom: form.periodFrom,
          periodTo: form.periodTo,
          paidAt: form.paidAt,
          paymentMethod: form.paymentMethod as "transfer" | "nequi" | "cash",
          referenceNote: form.referenceNote || undefined,
        }
      },
      {
        onSuccess: () => {
          toast({ title: t("payouts.created") });
          setCreateOpen(false);
          setForm({ merchantId: "", periodFrom: "", periodTo: "", paidAt: "", paymentMethod: "cash", referenceNote: "" });
          queryClient.invalidateQueries({ queryKey: getListPayoutsQueryKey({ eventId }) });
        },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("payouts.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("payouts.subtitleEvent")}</p>
        </div>
        <Button data-testid="button-create-payout" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> {t("payouts.createPayout")}
        </Button>
      </div>

      <div className="border border-border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("payouts.colMerchant")}</TableHead>
              <TableHead>{t("payouts.colPeriod")}</TableHead>
              <TableHead className="text-right">{t("payouts.colGross")}</TableHead>
              <TableHead className="text-right">{t("payouts.colNet")}</TableHead>
              <TableHead>{t("payouts.colMethod")}</TableHead>
              <TableHead>{t("payouts.colPaidAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : payouts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("payouts.noPayouts")}</TableCell></TableRow>
            ) : (
              payouts.map((payout: MerchantPayout) => (
                <TableRow key={payout.id} data-testid={`row-payout-${payout.id}`}>
                  <TableCell className="font-medium">{merchants.find((m) => m.id === payout.merchantId)?.name ?? payout.merchantId.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(payout.periodFrom).toLocaleDateString()} – {new Date(payout.periodTo).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-mono">{payout.grossSales.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{payout.netPayout.toLocaleString()}</TableCell>
                  <TableCell className="text-sm capitalize">{payout.paymentMethod}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(payout.paidAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("payouts.createPayoutTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("payouts.merchant")}</Label>
              <Select value={form.merchantId} onValueChange={(v) => setForm((f) => ({ ...f, merchantId: v }))}>
                <SelectTrigger data-testid="select-payout-merchant"><SelectValue placeholder={t("payouts.selectMerchant")} /></SelectTrigger>
                <SelectContent>
                  {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("payouts.periodFrom")}</Label>
                <DatePicker data-testid="input-period-from" value={form.periodFrom} onChange={(v) => setForm((f) => ({ ...f, periodFrom: v }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("payouts.periodTo")}</Label>
                <DatePicker data-testid="input-period-to" value={form.periodTo} onChange={(v) => setForm((f) => ({ ...f, periodTo: v }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("payouts.paidAt")}</Label>
              <DatePicker data-testid="input-paid-at" value={form.paidAt} onChange={(v) => setForm((f) => ({ ...f, paidAt: v }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("payouts.paymentMethod")}</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("payouts.methodCash")}</SelectItem>
                  <SelectItem value="transfer">{t("payouts.methodTransfer")}</SelectItem>
                  <SelectItem value="nequi">{t("payouts.methodNequi")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("payouts.referenceNote")}</Label>
              <Input data-testid="input-reference-note" value={form.referenceNote} onChange={(e) => setForm((f) => ({ ...f, referenceNote: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              data-testid="button-submit-payout"
              onClick={handleCreate}
              disabled={createPayout.isPending || !form.merchantId || !form.periodFrom || !form.periodTo || !form.paidAt}
            >
              {createPayout.isPending ? t("payouts.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
