import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPayouts,
  useCreatePayout,
  useGetPayoutTransactions,
  useListEvents,
  useListMerchants,
  getListPayoutsQueryKey,
  getGetPayoutTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { MerchantPayout } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Payouts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListPayouts();
  const payouts = data?.payouts ?? [];
  const { data: eventsData } = useListEvents();
  const events = eventsData?.events ?? [];
  const { data: merchantsData } = useListMerchants();
  const merchants = merchantsData?.merchants ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<MerchantPayout | null>(null);
  const [form, setForm] = useState({ merchantId: "", eventId: "", periodFrom: "", periodTo: "", paidAt: "", paymentMethod: "cash" as string, referenceNote: "" });

  const createPayout = useCreatePayout();
  const { data: txData } = useGetPayoutTransactions(selectedPayout?.id ?? "", {
    query: { enabled: !!selectedPayout && detailOpen, queryKey: getGetPayoutTransactionsQueryKey(selectedPayout?.id ?? "") }
  });

  const handleCreate = () => {
    createPayout.mutate(
      {
        data: {
          merchantId: form.merchantId,
          eventId: form.eventId,
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
          setForm({ merchantId: "", eventId: "", periodFrom: "", periodTo: "", paidAt: "", paymentMethod: "cash", referenceNote: "" });
          queryClient.invalidateQueries({ queryKey: getListPayoutsQueryKey() });
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
          <p className="text-muted-foreground mt-1">{t("payouts.subtitle")}</p>
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
              <TableHead>{t("payouts.colEvent")}</TableHead>
              <TableHead>{t("payouts.colPeriod")}</TableHead>
              <TableHead className="text-right">{t("payouts.colGross")}</TableHead>
              <TableHead className="text-right">{t("payouts.colNet")}</TableHead>
              <TableHead>{t("payouts.colMethod")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
            ) : payouts.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("payouts.noPayouts")}</TableCell></TableRow>
            ) : (
              payouts.map((payout) => (
                <TableRow key={payout.id} data-testid={`row-payout-${payout.id}`}>
                  <TableCell className="font-medium">{merchants.find((m) => m.id === payout.merchantId)?.name ?? payout.merchantId.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{events.find((e) => e.id === payout.eventId)?.name ?? payout.eventId.slice(0, 8)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(payout.periodFrom).toLocaleDateString()} – {new Date(payout.periodTo).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-mono">{payout.grossSales.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{payout.netPayout.toLocaleString()}</TableCell>
                  <TableCell className="text-sm capitalize">{payout.paymentMethod}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" data-testid={`button-payout-detail-${payout.id}`} onClick={() => { setSelectedPayout(payout); setDetailOpen(true); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
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
            <div className="space-y-1">
              <Label>{t("payouts.event")}</Label>
              <Select value={form.eventId} onValueChange={(v) => setForm((f) => ({ ...f, eventId: v }))}>
                <SelectTrigger data-testid="select-payout-event"><SelectValue placeholder={t("payouts.selectEvent")} /></SelectTrigger>
                <SelectContent>
                  {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("payouts.periodFrom")}</Label>
                <Input data-testid="input-period-from" type="date" value={form.periodFrom} onChange={(e) => setForm((f) => ({ ...f, periodFrom: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("payouts.periodTo")}</Label>
                <Input data-testid="input-period-to" type="date" value={form.periodTo} onChange={(e) => setForm((f) => ({ ...f, periodTo: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("payouts.paidAt")}</Label>
              <Input data-testid="input-paid-at" type="date" value={form.paidAt} onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))} />
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
              disabled={createPayout.isPending || !form.merchantId || !form.eventId || !form.periodFrom || !form.periodTo || !form.paidAt}
            >
              {createPayout.isPending ? t("payouts.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("payouts.transactionsTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {!txData?.transactions?.length ? (
              <p className="text-muted-foreground text-sm text-center py-4">{t("payouts.noTransactions")}</p>
            ) : (
              txData.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                  <span className="text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</span>
                  <span className="font-mono">{(tx.grossAmount ?? 0).toLocaleString()} {events.find((e) => e.id === selectedPayout?.eventId)?.currencyCode ?? "COP"}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setDetailOpen(false)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
