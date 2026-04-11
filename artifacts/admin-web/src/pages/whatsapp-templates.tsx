import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListEvents } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, MessageCircle, Zap, X, RefreshCw, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  apiFetchWhatsAppTemplates,
  apiCreateWhatsAppTemplate,
  apiUpdateWhatsAppTemplate,
  apiDeleteWhatsAppTemplate,
  apiFetchWhatsAppTriggerMappings,
  apiCreateWhatsAppTriggerMapping,
  apiUpdateWhatsAppTriggerMapping,
  apiDeleteWhatsAppTriggerMapping,
  apiFetchGupshupTemplates,
  type WhatsAppTemplate,
  type WhatsAppTriggerMapping,
  type GupshupTemplate,
} from "@/lib/api";

const TRIGGER_TYPES = ["ticket_purchased", "otp_verification", "event_reminder", "ticket_refund", "welcome_message", "custom"] as const;
const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const;
const STATUSES = ["active", "inactive", "pending_approval"] as const;

export default function WhatsAppTemplates() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("templates");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [editingMapping, setEditingMapping] = useState<WhatsAppTriggerMapping | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "template" | "mapping"; id: string } | null>(null);
  const [selectedGupshupId, setSelectedGupshupId] = useState("");

  const [tplForm, setTplForm] = useState({
    name: "",
    gupshupTemplateId: "",
    description: "",
    language: "es",
    category: "UTILITY" as string,
    status: "active" as string,
    bodyPreview: "",
    parameters: [] as Array<{ name: string; description: string; example: string }>,
  });

  const [mapForm, setMapForm] = useState({
    triggerType: "",
    templateId: "",
    eventId: "",
    active: true,
    priority: 0,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: apiFetchWhatsAppTemplates,
  });

  const { data: mappings = [], isLoading: mappingsLoading } = useQuery({
    queryKey: ["whatsapp-trigger-mappings"],
    queryFn: apiFetchWhatsAppTriggerMappings,
  });

  const { data: gupshupTemplates = [], isLoading: gupshupLoading, refetch: refetchGupshup } = useQuery({
    queryKey: ["gupshup-templates"],
    queryFn: apiFetchGupshupTemplates,
    enabled: false,
  });

  const { data: eventsData } = useListEvents();
  const events = (eventsData as any)?.events ?? (Array.isArray(eventsData) ? eventsData : []);

  const createTemplateMut = useMutation({
    mutationFn: apiCreateWhatsAppTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: t("whatsapp.templateCreated") });
      closeTemplateDialog();
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const updateTemplateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiUpdateWhatsAppTemplate(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: t("whatsapp.templateUpdated") });
      closeTemplateDialog();
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: apiDeleteWhatsAppTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-trigger-mappings"] });
      toast({ title: t("whatsapp.templateDeleted") });
      setDeleteConfirm(null);
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const createMappingMut = useMutation({
    mutationFn: apiCreateWhatsAppTriggerMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-trigger-mappings"] });
      toast({ title: t("whatsapp.mappingCreated") });
      closeMappingDialog();
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const updateMappingMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiUpdateWhatsAppTriggerMapping(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-trigger-mappings"] });
      toast({ title: t("whatsapp.mappingUpdated") });
      closeMappingDialog();
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const deleteMappingMut = useMutation({
    mutationFn: apiDeleteWhatsAppTriggerMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-trigger-mappings"] });
      toast({ title: t("whatsapp.mappingDeleted") });
      setDeleteConfirm(null);
    },
    onError: (err: Error) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  function openNewTemplate() {
    setEditingTemplate(null);
    setTplForm({ name: "", gupshupTemplateId: "", description: "", language: "es", category: "UTILITY", status: "active", bodyPreview: "", parameters: [] });
    setShowTemplateDialog(true);
  }

  function openImportDialog() {
    setSelectedGupshupId("");
    setShowImportDialog(true);
    refetchGupshup();
  }

  function extractTemplateParams(bodyText: string): Array<{ name: string; description: string; example: string }> {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    const unique = [...new Set(matches)];
    return unique.map((m) => {
      const num = m.replace(/[{}]/g, "");
      return { name: `param_${num}`, description: `Parameter {{${num}}}`, example: "" };
    });
  }

  function handleImportTemplate() {
    const selected = gupshupTemplates.find((g) => g.id === selectedGupshupId);
    if (!selected) return;

    const alreadyImported = templates.find((t) => t.gupshupTemplateId === selected.id);
    if (alreadyImported) {
      toast({ title: "Template already imported", description: `"${alreadyImported.name}" already uses this Gupshup template.`, variant: "destructive" });
      return;
    }

    const bodyText = selected.data || "";
    const params = extractTemplateParams(bodyText);
    const categoryMap: Record<string, string> = { UTILITY: "UTILITY", MARKETING: "MARKETING", AUTHENTICATION: "AUTHENTICATION" };

    setTplForm({
      name: selected.elementName,
      gupshupTemplateId: selected.id,
      description: "",
      language: selected.languageCode || "es",
      category: categoryMap[selected.category?.toUpperCase()] || "UTILITY",
      status: selected.status === "APPROVED" ? "active" : "pending_approval",
      bodyPreview: bodyText,
      parameters: params,
    });

    setShowImportDialog(false);
    setShowTemplateDialog(true);
  }

  function openEditTemplate(tpl: WhatsAppTemplate) {
    setEditingTemplate(tpl);
    setTplForm({
      name: tpl.name,
      gupshupTemplateId: tpl.gupshupTemplateId,
      description: tpl.description || "",
      language: tpl.language,
      category: tpl.category,
      status: tpl.status,
      bodyPreview: tpl.bodyPreview || "",
      parameters: tpl.parameters.map(p => ({ name: p.name, description: p.description, example: p.example || "" })),
    });
    setShowTemplateDialog(true);
  }

  function closeTemplateDialog() {
    setShowTemplateDialog(false);
    setEditingTemplate(null);
  }

  function openNewMapping() {
    setEditingMapping(null);
    setMapForm({ triggerType: "", templateId: "", eventId: "", active: true, priority: 0 });
    setShowMappingDialog(true);
  }

  function openEditMapping(m: WhatsAppTriggerMapping) {
    setEditingMapping(m);
    setMapForm({
      triggerType: m.mapping.triggerType,
      templateId: m.mapping.templateId,
      eventId: m.mapping.eventId || "",
      active: m.mapping.active,
      priority: m.mapping.priority,
    });
    setShowMappingDialog(true);
  }

  function closeMappingDialog() {
    setShowMappingDialog(false);
    setEditingMapping(null);
  }

  function handleSaveTemplate() {
    const payload = {
      name: tplForm.name,
      gupshupTemplateId: tplForm.gupshupTemplateId,
      description: tplForm.description || null,
      language: tplForm.language,
      category: tplForm.category,
      status: tplForm.status,
      bodyPreview: tplForm.bodyPreview || null,
      parameters: tplForm.parameters.filter(p => p.name.trim()),
    };

    if (editingTemplate) {
      updateTemplateMut.mutate({ id: editingTemplate.id, body: payload });
    } else {
      createTemplateMut.mutate(payload as any);
    }
  }

  function handleSaveMapping() {
    const payload = {
      triggerType: mapForm.triggerType,
      templateId: mapForm.templateId,
      eventId: mapForm.eventId || null,
      active: mapForm.active,
      priority: mapForm.priority,
    };

    if (editingMapping) {
      updateMappingMut.mutate({ id: editingMapping.mapping.id, body: payload });
    } else {
      createMappingMut.mutate(payload);
    }
  }

  function addParam() {
    setTplForm(f => ({ ...f, parameters: [...f.parameters, { name: "", description: "", example: "" }] }));
  }

  function removeParam(idx: number) {
    setTplForm(f => ({ ...f, parameters: f.parameters.filter((_, i) => i !== idx) }));
  }

  function updateParam(idx: number, field: string, value: string) {
    setTplForm(f => ({
      ...f,
      parameters: f.parameters.map((p, i) => i === idx ? { ...p, [field]: value } : p),
    }));
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "default";
      case "inactive": return "secondary";
      case "pending_approval": return "outline";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageCircle className="h-8 w-8 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold">{t("whatsapp.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("whatsapp.description")}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">
            <MessageCircle className="h-4 w-4 mr-2" />
            {t("whatsapp.templatesTab")}
          </TabsTrigger>
          <TabsTrigger value="triggers">
            <Zap className="h-4 w-4 mr-2" />
            {t("whatsapp.triggersTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{t("whatsapp.templatesTab")}</h2>
                <div className="flex gap-2">
                  <Button onClick={openImportDialog} size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    {t("whatsapp.importFromGupshup", "Importar de Gupshup")}
                  </Button>
                  <Button onClick={openNewTemplate} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("whatsapp.addTemplate")}
                  </Button>
                </div>
              </div>

              {templatesLoading ? (
                <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>
              ) : templates.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{t("whatsapp.noTemplates")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("whatsapp.templateName")}</TableHead>
                      <TableHead>{t("whatsapp.gupshupId")}</TableHead>
                      <TableHead>{t("whatsapp.language")}</TableHead>
                      <TableHead>{t("whatsapp.category")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("whatsapp.parameters")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map(tpl => (
                      <TableRow key={tpl.id}>
                        <TableCell className="font-medium">{tpl.name}</TableCell>
                        <TableCell className="font-mono text-xs">{tpl.gupshupTemplateId}</TableCell>
                        <TableCell>{tpl.language.toUpperCase()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t(`whatsapp.categories.${tpl.category}`)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColor(tpl.status) as any}>{t(`whatsapp.statuses.${tpl.status}`)}</Badge>
                        </TableCell>
                        <TableCell>{tpl.parameters.length}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditTemplate(tpl)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ type: "template", id: tpl.id })}>
                              <Trash2 className="h-4 w-4 text-destructive" />
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
        </TabsContent>

        <TabsContent value="triggers" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{t("whatsapp.triggersTab")}</h2>
                <Button onClick={openNewMapping} size="sm" disabled={templates.length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("whatsapp.addMapping")}
                </Button>
              </div>

              {mappingsLoading ? (
                <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>
              ) : mappings.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{t("whatsapp.noMappings")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("whatsapp.triggerType")}</TableHead>
                      <TableHead>{t("whatsapp.template")}</TableHead>
                      <TableHead>{t("whatsapp.eventOverride")}</TableHead>
                      <TableHead>{t("whatsapp.priority")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map(m => {
                      const eventName = m.mapping.eventId
                        ? events.find((e: any) => e.id === m.mapping.eventId)?.name || m.mapping.eventId
                        : t("whatsapp.global");
                      return (
                        <TableRow key={m.mapping.id}>
                          <TableCell>
                            <Badge variant="outline">{t(`whatsapp.triggerTypes.${m.mapping.triggerType}`)}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{m.templateName || "—"}</TableCell>
                          <TableCell>{eventName}</TableCell>
                          <TableCell>{m.mapping.priority}</TableCell>
                          <TableCell>
                            <Badge variant={m.mapping.active ? "default" : "secondary"}>
                              {m.mapping.active ? t("common.active") : t("common.inactive")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditMapping(m)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm({ type: "mapping", id: m.mapping.id })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showTemplateDialog} onOpenChange={(open) => { if (!open) closeTemplateDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? t("whatsapp.editTemplate") : t("whatsapp.addTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("whatsapp.templateName")}</Label>
                <Input
                  value={tplForm.name}
                  onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t("whatsapp.templateNamePlaceholder")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t("whatsapp.gupshupId")}</Label>
                <Input
                  value={tplForm.gupshupTemplateId}
                  onChange={e => setTplForm(f => ({ ...f, gupshupTemplateId: e.target.value }))}
                  placeholder={t("whatsapp.gupshupIdPlaceholder")}
                  className="mt-1 font-mono"
                />
              </div>
            </div>

            <div>
              <Label>{t("common.description")}</Label>
              <Input
                value={tplForm.description}
                onChange={e => setTplForm(f => ({ ...f, description: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t("whatsapp.language")}</Label>
                <Select value={tplForm.language} onValueChange={v => setTplForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("whatsapp.category")}</Label>
                <Select value={tplForm.category} onValueChange={v => setTplForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{t(`whatsapp.categories.${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("common.status")}</Label>
                <Select value={tplForm.status} onValueChange={v => setTplForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{t(`whatsapp.statuses.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t("whatsapp.bodyPreview")}</Label>
              <Textarea
                value={tplForm.bodyPreview}
                onChange={e => setTplForm(f => ({ ...f, bodyPreview: e.target.value }))}
                placeholder={t("whatsapp.bodyPreviewPlaceholder")}
                rows={3}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t("whatsapp.parameters")}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addParam}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t("whatsapp.addParam")}
                </Button>
              </div>
              {tplForm.parameters.length > 0 && (
                <div className="space-y-2">
                  {tplForm.parameters.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <Input
                        placeholder={t("whatsapp.paramName")}
                        value={p.name}
                        onChange={e => updateParam(idx, "name", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder={t("whatsapp.paramDescription")}
                        value={p.description}
                        onChange={e => updateParam(idx, "description", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder={t("whatsapp.paramExample")}
                        value={p.example}
                        onChange={e => updateParam(idx, "example", e.target.value)}
                        className="flex-1"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeParam(idx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeTemplateDialog}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!tplForm.name || !tplForm.gupshupTemplateId || createTemplateMut.isPending || updateTemplateMut.isPending}
            >
              {(createTemplateMut.isPending || updateTemplateMut.isPending) ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMappingDialog} onOpenChange={(open) => { if (!open) closeMappingDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMapping ? t("whatsapp.editMapping") : t("whatsapp.addMapping")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("whatsapp.triggerType")}</Label>
              <Select value={mapForm.triggerType} onValueChange={v => setMapForm(f => ({ ...f, triggerType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("whatsapp.selectTrigger")} /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(tt => (
                    <SelectItem key={tt} value={tt}>{t(`whatsapp.triggerTypes.${tt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("whatsapp.template")}</Label>
              <Select value={mapForm.templateId} onValueChange={v => setMapForm(f => ({ ...f, templateId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("whatsapp.selectTemplate")} /></SelectTrigger>
                <SelectContent>
                  {templates.filter(t => t.status === "active").map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}>{tpl.name} ({tpl.gupshupTemplateId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("whatsapp.eventOverride")}</Label>
              <Select value={mapForm.eventId || "__global__"} onValueChange={v => setMapForm(f => ({ ...f, eventId: v === "__global__" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">{t("whatsapp.selectEvent")}</SelectItem>
                  {events.map((ev: any) => (
                    <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t("whatsapp.eventOverrideHelp")}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("whatsapp.priority")}</Label>
                <Input
                  type="number"
                  value={mapForm.priority}
                  onChange={e => setMapForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={mapForm.active} onCheckedChange={v => setMapForm(f => ({ ...f, active: v }))} />
                <Label>{t("common.active")}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeMappingDialog}>{t("common.cancel")}</Button>
            <Button
              onClick={handleSaveMapping}
              disabled={!mapForm.triggerType || !mapForm.templateId || createMappingMut.isPending || updateMappingMut.isPending}
            >
              {(createMappingMut.isPending || updateMappingMut.isPending) ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={(open) => { if (!open) setShowImportDialog(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("whatsapp.importFromGupshup", "Importar de Gupshup")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("whatsapp.importDescription", "Selecciona una plantilla aprobada de tu cuenta Gupshup para importarla.")}
            </p>

            {gupshupLoading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">{t("whatsapp.fetchingTemplates", "Cargando plantillas de Gupshup...")}</span>
              </div>
            ) : gupshupTemplates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">{t("whatsapp.noGupshupTemplates", "No se encontraron plantillas en Gupshup")}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetchGupshup()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t("common.retry", "Reintentar")}
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <Label>{t("whatsapp.selectGupshupTemplate", "Plantilla Gupshup")}</Label>
                  <Select value={selectedGupshupId} onValueChange={setSelectedGupshupId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("whatsapp.selectTemplatePlaceholder", "Selecciona una plantilla...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {gupshupTemplates
                        .filter((g) => g.status === "APPROVED")
                        .map((g) => {
                          const alreadyExists = templates.some((t) => t.gupshupTemplateId === g.id);
                          return (
                            <SelectItem key={g.id} value={g.id} disabled={alreadyExists}>
                              {g.elementName} ({g.languageCode}) {alreadyExists ? " — ya importada" : ""}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>

                {selectedGupshupId && (() => {
                  const sel = gupshupTemplates.find((g) => g.id === selectedGupshupId);
                  if (!sel) return null;
                  return (
                    <div className="bg-muted/30 rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{sel.category}</Badge>
                        <Badge variant={sel.status === "APPROVED" ? "default" : "secondary"}>{sel.status}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{sel.languageCode?.toUpperCase()}</span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground">ID: {sel.id}</p>
                      {sel.data && (
                        <div>
                          <p className="text-xs font-medium mb-1">{t("whatsapp.bodyPreview", "Vista previa")}:</p>
                          <p className="text-sm bg-background p-2 rounded border whitespace-pre-wrap">{sel.data}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {gupshupTemplates.filter((g) => g.status !== "APPROVED").length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("whatsapp.pendingTemplatesNote", `${gupshupTemplates.filter(g => g.status !== "APPROVED").length} plantilla(s) pendientes de aprobación no se muestran`)}
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleImportTemplate} disabled={!selectedGupshupId}>
              <Download className="h-4 w-4 mr-2" />
              {t("whatsapp.importTemplate", "Importar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteConfirm?.type === "template" ? t("whatsapp.deleteTemplate") : t("whatsapp.deleteMapping")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteConfirm?.type === "template" ? t("whatsapp.deleteTemplateConfirm") : t("whatsapp.deleteMappingConfirm")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.type === "template") deleteTemplateMut.mutate(deleteConfirm.id);
                else if (deleteConfirm) deleteMappingMut.mutate(deleteConfirm.id);
              }}
              disabled={deleteTemplateMut.isPending || deleteMappingMut.isPending}
            >
              {(deleteTemplateMut.isPending || deleteMappingMut.isPending) ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
