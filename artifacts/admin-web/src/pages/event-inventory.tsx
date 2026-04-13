import { fmtDate, fmtDateTime } from "@/lib/date";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useListWarehouses,
  useCreateWarehouse,
  useListStockMovements,
  useDispatchFromWarehouse,
  useTransferBetweenLocations,
  useListLocations,
  useListProducts,
  useGetInventoryReport,
  useListInventoryAudits,
  useListDamagedGoods,
  getListWarehousesQueryKey,
  getListStockMovementsQueryKey,
} from "@workspace/api-client-react";
import type { Warehouse, StockMovement } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowRightLeft, Truck, Package, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function EventInventory() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: auth } = useGetCurrentAuthUser();
  const eventId = auth?.user?.eventId ?? "";

  const { data: warehousesData, isLoading: whLoading } = useListWarehouses({ eventId: eventId || undefined });
  const warehouses = warehousesData?.warehouses ?? [];
  const { data: movementsData } = useListStockMovements();
  const movements = movementsData?.movements ?? [];
  const { data: locationsData } = useListLocations({ eventId: eventId || undefined });
  const locations = locationsData?.locations ?? [];
  const { data: productsData } = useListProducts();
  const products = productsData?.products ?? [];
  const { data: inventoryReport } = useGetInventoryReport({ eventId: eventId || undefined });
  const reportItems = inventoryReport?.items ?? [];
  const { data: auditsData } = useListInventoryAudits();
  const audits = auditsData?.audits ?? [];
  const { data: damagedData } = useListDamagedGoods();
  const damaged = damagedData?.entries ?? [];

  const [createWhOpen, setCreateWhOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [whForm, setWhForm] = useState({ name: "", notes: "" });
  const [dispatchForm, setDispatchForm] = useState({ warehouseId: "", locationId: "", productId: "", quantity: "" });
  const [transferForm, setTransferForm] = useState({ fromLocationId: "", toLocationId: "", productId: "", quantity: "" });

  const createWarehouse = useCreateWarehouse();
  const dispatch = useDispatchFromWarehouse();
  const transfer = useTransferBetweenLocations();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListWarehousesQueryKey({ eventId }) });
    queryClient.invalidateQueries({ queryKey: getListStockMovementsQueryKey() });
  };

  const handleCreateWarehouse = () => {
    if (!eventId) return;
    createWarehouse.mutate(
      { data: { name: whForm.name, eventId, notes: whForm.notes || undefined } },
      {
        onSuccess: () => { toast({ title: t("eventInventory.warehouseCreated") }); setCreateWhOpen(false); setWhForm({ name: "", notes: "" }); invalidateAll(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleDispatch = () => {
    dispatch.mutate(
      { data: { warehouseId: dispatchForm.warehouseId, locationId: dispatchForm.locationId, productId: dispatchForm.productId, quantity: parseInt(dispatchForm.quantity) } },
      {
        onSuccess: () => { toast({ title: t("eventInventory.dispatched") }); setDispatchOpen(false); setDispatchForm({ warehouseId: "", locationId: "", productId: "", quantity: "" }); invalidateAll(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const handleTransfer = () => {
    transfer.mutate(
      { data: { fromLocationId: transferForm.fromLocationId, toLocationId: transferForm.toLocationId, productId: transferForm.productId, quantity: parseInt(transferForm.quantity) } },
      {
        onSuccess: () => { toast({ title: t("eventInventory.transferred") }); setTransferOpen(false); setTransferForm({ fromLocationId: "", toLocationId: "", productId: "", quantity: "" }); invalidateAll(); },
        onError: (e: unknown) => toast({ title: t("common.error"), description: (e as { message?: string }).message, variant: "destructive" }),
      }
    );
  };

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  const lowStockCount = reportItems.filter((item) => item.isLowStock).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="w-7 h-7" /> {t("eventInventory.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("eventInventory.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-dispatch" onClick={() => setDispatchOpen(true)}>
            <Truck className="w-4 h-4 mr-2" /> {t("eventInventory.dispatch")}
          </Button>
          <Button variant="outline" data-testid="button-transfer" onClick={() => setTransferOpen(true)}>
            <ArrowRightLeft className="w-4 h-4 mr-2" /> {t("eventInventory.transfer")}
          </Button>
          <Button data-testid="button-create-warehouse" onClick={() => setCreateWhOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> {t("eventInventory.addWarehouse")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="warehouses">
        <TabsList>
          <TabsTrigger value="warehouses">{t("eventInventory.tabWarehouses")}</TabsTrigger>
          <TabsTrigger value="movements">{t("eventInventory.tabMovements")}</TabsTrigger>
          <TabsTrigger value="audits">{t("eventInventory.tabAudits")}</TabsTrigger>
          <TabsTrigger value="damaged">{t("eventInventory.tabDamaged")}</TabsTrigger>
          <TabsTrigger value="report">{t("eventInventory.tabReport")}</TabsTrigger>
        </TabsList>

        <TabsContent value="warehouses" className="mt-4">
          <div className="border border-border rounded-lg bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eventInventory.colWarehouse")}</TableHead>
                  <TableHead>{t("eventInventory.colNotes")}</TableHead>
                  <TableHead>{t("eventInventory.colCreated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {whLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
                ) : warehouses.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">{t("eventInventory.noWarehouses")}</TableCell></TableRow>
                ) : (
                  warehouses.map((wh: Warehouse) => (
                    <TableRow key={wh.id}>
                      <TableCell className="font-medium">{wh.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{wh.notes ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(wh.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <div className="border border-border rounded-lg bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eventInventory.colTime")}</TableHead>
                  <TableHead>{t("eventInventory.colType")}</TableHead>
                  <TableHead>{t("eventInventory.colProduct")}</TableHead>
                  <TableHead className="text-right">{t("eventInventory.colQuantity")}</TableHead>
                  <TableHead>{t("eventInventory.colFrom")}</TableHead>
                  <TableHead>{t("eventInventory.colTo")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("eventInventory.noMovements")}</TableCell></TableRow>
                ) : (
                  movements.map((mv: StockMovement) => (
                    <TableRow key={mv.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDateTime(mv.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{mv.movementType.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{productName(mv.productId)}</TableCell>
                      <TableCell className="text-right font-mono">{mv.quantity}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {mv.fromWarehouseId ? warehouseName(mv.fromWarehouseId) : mv.fromLocationId ? locationName(mv.fromLocationId) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {mv.toLocationId ? locationName(mv.toLocationId) : mv.toWarehouseId ? warehouseName(mv.toWarehouseId) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="audits" className="mt-4">
          <div className="border border-border rounded-lg bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eventInventory.colDate")}</TableHead>
                  <TableHead>{t("eventInventory.colLocationWarehouse")}</TableHead>
                  <TableHead>{t("eventInventory.colItemsCounted")}</TableHead>
                  <TableHead>{t("eventInventory.colNotes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("eventInventory.noAudits")}</TableCell></TableRow>
                ) : (
                  audits.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm text-muted-foreground">{fmtDateTime(a.createdAt)}</TableCell>
                      <TableCell className="text-sm">{a.locationId ? locationName(a.locationId) : a.warehouseId ? warehouseName(a.warehouseId) : "—"}</TableCell>
                      <TableCell className="font-mono">{a.items?.length ?? 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="damaged" className="mt-4">
          <div className="border border-border rounded-lg bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("eventInventory.colDate")}</TableHead>
                  <TableHead>{t("eventInventory.colProduct")}</TableHead>
                  <TableHead className="text-right">{t("eventInventory.colQuantity")}</TableHead>
                  <TableHead>{t("eventInventory.colReason")}</TableHead>
                  <TableHead>{t("eventInventory.colLocation")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {damaged.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("eventInventory.noDamaged")}</TableCell></TableRow>
                ) : (
                  damaged.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm text-muted-foreground">{fmtDateTime(d.createdAt)}</TableCell>
                      <TableCell className="text-sm">{productName(d.productId)}</TableCell>
                      <TableCell className="text-right font-mono">{d.quantity}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{(d.reason ?? "").replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.locationId ? locationName(d.locationId) : d.warehouseId ? warehouseName(d.warehouseId) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          {reportItems.length > 0 ? (
            <div className="space-y-4">
              {lowStockCount > 0 && (
                <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {t("eventInventory.lowStockAlerts", { count: lowStockCount })}
                </div>
              )}
              <div className="border border-border rounded-lg bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("eventInventory.colLocation")}</TableHead>
                      <TableHead>{t("eventInventory.colProduct")}</TableHead>
                      <TableHead className="text-right">{t("eventInventory.colOnHand")}</TableHead>
                      <TableHead className="text-right">{t("eventInventory.colRestockTrigger")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{item.locationName}</TableCell>
                        <TableCell className="text-sm">{item.productName}</TableCell>
                        <TableCell className="text-right font-mono">{item.quantityOnHand}</TableCell>
                        <TableCell className="text-right font-mono">{item.restockTrigger}</TableCell>
                        <TableCell>
                          <Badge variant={item.isLowStock ? "destructive" : "default"} className="text-xs">
                            {item.isLowStock ? t("eventInventory.lowStock") : "OK"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">{t("eventInventory.noInventory")}</p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createWhOpen} onOpenChange={setCreateWhOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("eventInventory.addWarehouseTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("eventInventory.warehouseName")}</Label>
              <Input data-testid="input-wh-name" value={whForm.name} onChange={(e) => setWhForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.notes")}</Label>
              <Input data-testid="input-wh-notes" value={whForm.notes} onChange={(e) => setWhForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateWhOpen(false)}>{t("common.cancel")}</Button>
            <Button data-testid="button-submit-warehouse" onClick={handleCreateWarehouse} disabled={createWarehouse.isPending || !whForm.name}>
              {createWarehouse.isPending ? t("eventInventory.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("eventInventory.dispatchTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("eventInventory.warehouse")}</Label>
              <Select value={dispatchForm.warehouseId} onValueChange={(v) => setDispatchForm((f) => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("eventInventory.selectWarehouse")} /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: Warehouse) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.destinationLocation")}</Label>
              <Select value={dispatchForm.locationId} onValueChange={(v) => setDispatchForm((f) => ({ ...f, locationId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("eventInventory.selectLocation")} /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.product")}</Label>
              <Select value={dispatchForm.productId} onValueChange={(v) => setDispatchForm((f) => ({ ...f, productId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("eventInventory.selectProduct")} /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.quantity")}</Label>
              <Input type="number" min="1" value={dispatchForm.quantity} onChange={(e) => setDispatchForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleDispatch} disabled={dispatch.isPending || !dispatchForm.warehouseId || !dispatchForm.locationId || !dispatchForm.productId || !dispatchForm.quantity}>
              {dispatch.isPending ? t("eventInventory.dispatching") : t("eventInventory.dispatch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("eventInventory.transferTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("eventInventory.fromLocation")}</Label>
              <Select value={transferForm.fromLocationId} onValueChange={(v) => setTransferForm((f) => ({ ...f, fromLocationId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("eventInventory.selectSource")} /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.toLocation")}</Label>
              <Select value={transferForm.toLocationId} onValueChange={(v) => setTransferForm((f) => ({ ...f, toLocationId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("eventInventory.selectDestination")} /></SelectTrigger>
                <SelectContent>
                  {locations.filter((l) => l.id !== transferForm.fromLocationId).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.product")}</Label>
              <Select value={transferForm.productId} onValueChange={(v) => setTransferForm((f) => ({ ...f, productId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("eventInventory.selectProduct")} /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("eventInventory.quantity")}</Label>
              <Input type="number" min="1" value={transferForm.quantity} onChange={(e) => setTransferForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleTransfer} disabled={transfer.isPending || !transferForm.fromLocationId || !transferForm.toLocationId || !transferForm.productId || !transferForm.quantity}>
              {transfer.isPending ? t("eventInventory.transferring") : t("eventInventory.transfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
