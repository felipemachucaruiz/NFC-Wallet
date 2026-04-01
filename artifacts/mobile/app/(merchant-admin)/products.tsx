import { useColorScheme } from "@/hooks/useColorScheme";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { API_BASE_URL } from "@/constants/domain";
import { CopAmount } from "@/components/CopAmount";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { Empty } from "@/components/ui/Empty";

type Product = {
  id: string;
  merchantId: string;
  name: string;
  category?: string | null;
  priceCop: number;
  costCop: number;
  ivaRate: string;
  ivaExento: boolean;
  active: boolean;
  imageUrl?: string | null;
};

type FormState = {
  name: string;
  category: string;
  priceCop: string;
  costCop: string;
  ivaRate: string;
  ivaExento: boolean;
  imageUrl: string | null;
};

const emptyForm: FormState = { name: "", category: "", priceCop: "", costCop: "", ivaRate: "0", ivaExento: false, imageUrl: null };

export default function MerchantProductsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, token } = useAuth();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);

  const merchantId = user?.merchantId ?? "";

  const { data, isLoading, refetch } = useListProducts(
    { merchantId: merchantId || undefined },
    { query: { enabled: !!merchantId, queryKey: ["products", merchantId] } },
  );
  const products: Product[] = (data as { products?: Product[] } | undefined)?.products ?? [];

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const resetForm = () => {
    setForm(emptyForm);
    setShowAddForm(false);
    setEditingProduct(null);
    setPendingImageUri(null);
  };

  const pickImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(t("common.error"), t("merchant_admin.photoPermissionDenied"));
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
        base64: false,
        exif: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPendingImageUri(uri);
        setForm((f) => ({ ...f, imageUrl: uri }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t("common.error"), msg);
    }
  };

  const removeImage = () => {
    setPendingImageUri(null);
    setForm((f) => ({ ...f, imageUrl: null }));
  };

  const uploadImageForProduct = async (productId: string): Promise<string> => {
    if (!pendingImageUri) throw new Error("No image selected");

    setUploadingImage(true);
    try {
      const filename = pendingImageUri.split("/").pop() ?? "image.jpg";
      const formData = new FormData();
      formData.append("image", {
        uri: pendingImageUri,
        name: filename,
        type: "image/jpeg",
      } as unknown as Blob);

      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/api/products/${productId}/image`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Image upload failed");
      }
      const responseData = await response.json() as { imageUrl: string };
      return responseData.imageUrl;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { Alert.alert(t("common.error"), t("merchant_admin.nameRequired")); return; }
    if (!form.priceCop.trim()) { Alert.alert(t("common.error"), t("merchant_admin.priceRequired")); return; }
    const price = parseInt(form.priceCop, 10);
    const cost = parseInt(form.costCop || "0", 10);
    if (isNaN(price) || price < 0) { Alert.alert(t("common.error"), t("merchant_admin.priceRequired")); return; }
    const ivaRateVal = form.ivaExento ? "0" : (parseFloat(form.ivaRate || "0").toFixed(2));
    try {
      const created = await createProduct.mutateAsync({
        data: {
          merchantId,
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          priceCop: price,
          costCop: isNaN(cost) ? 0 : cost,
          ivaRate: ivaRateVal,
          ivaExento: form.ivaExento,
        },
      });
      const createdProduct = created as Product;
      if (pendingImageUri && createdProduct?.id) {
        try {
          await uploadImageForProduct(createdProduct.id);
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : t("common.unknownError");
          Alert.alert(t("common.error"), msg);
          refetch();
          return;
        }
      }
      Alert.alert(t("common.success"), t("merchant_admin.productCreated"));
      resetForm();
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const handleUpdate = async () => {
    if (!editingProduct) return;
    if (!form.name.trim()) { Alert.alert(t("common.error"), t("merchant_admin.nameRequired")); return; }
    const price = parseInt(form.priceCop, 10);
    const cost = parseInt(form.costCop || "0", 10);
    const ivaRateVal = form.ivaExento ? "0" : (parseFloat(form.ivaRate || "0").toFixed(2));
    try {
      if (pendingImageUri) {
        try {
          await uploadImageForProduct(editingProduct.id);
        } catch (imgErr) {
          const msg = imgErr instanceof Error ? imgErr.message : t("common.unknownError");
          Alert.alert(t("common.error"), msg);
          return;
        }
      } else if (form.imageUrl === null && editingProduct.imageUrl !== null) {
        await updateProduct.mutateAsync({
          productId: editingProduct.id,
          data: { imageUrl: null },
        });
      }
      await updateProduct.mutateAsync({
        productId: editingProduct.id,
        data: {
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          priceCop: isNaN(price) ? editingProduct.priceCop : price,
          costCop: isNaN(cost) ? 0 : cost,
          ivaRate: ivaRateVal,
          ivaExento: form.ivaExento,
        },
      });
      Alert.alert(t("common.success"), t("merchant_admin.productUpdated"));
      resetForm();
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const handleDelete = (product: Product) => {
    Alert.alert(
      t("merchant_admin.deleteProduct"),
      t("merchant_admin.deleteProductConfirm", { name: product.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteProduct.mutateAsync({ productId: product.id });
              Alert.alert(t("common.success"), t("merchant_admin.productDeleted"));
              refetch();
            } catch {
              Alert.alert(t("common.error"), t("common.unknownError"));
            }
          },
        },
      ],
    );
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    setPendingImageUri(null);
    setForm({
      name: product.name,
      category: product.category ?? "",
      priceCop: String(product.priceCop),
      costCop: product.costCop ? String(product.costCop) : "",
      ivaRate: product.ivaRate ?? "0",
      ivaExento: product.ivaExento ?? false,
      imageUrl: product.imageUrl ?? null,
    });
    setShowAddForm(false);
  };

  const toggleActive = async (product: Product) => {
    try {
      await updateProduct.mutateAsync({
        productId: product.id,
        data: { active: !product.active },
      });
      refetch();
    } catch {
      Alert.alert(t("common.error"), t("common.unknownError"));
    }
  };

  const resolveImageUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith("/api/")) return `${API_BASE_URL}${url}`;
    return url;
  };

  const currentImageUri = pendingImageUri ?? resolveImageUrl(editingProduct ? form.imageUrl : null);

  if (!merchantId) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      contentContainerStyle={{
        paddingTop: isWeb ? 67 : insets.top + 16,
        paddingBottom: isWeb ? 34 : insets.bottom + 100,
        paddingHorizontal: 20,
        gap: 20,
      }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: C.text }]}>{t("merchant_admin.products")}</Text>
        {!showAddForm && !editingProduct && (
          <Pressable
            onPress={() => { setShowAddForm(true); setForm(emptyForm); setPendingImageUri(null); }}
            style={[styles.addBtn, { backgroundColor: C.primary }]}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>{t("merchant_admin.addProduct")}</Text>
          </Pressable>
        )}
      </View>

      {(showAddForm || editingProduct) && (
        <View style={[styles.formCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.formTitle, { color: C.text }]}>
            {editingProduct ? t("merchant_admin.editProduct") : t("merchant_admin.addProduct")}
          </Text>
          <View style={{ gap: 12 }}>
            <View style={styles.imagePickerRow}>
              <Pressable
                onPress={pickImage}
                style={[styles.imagePicker, { backgroundColor: C.inputBg, borderColor: C.border }]}
              >
                {currentImageUri ? (
                  <Image
                    source={{ uri: currentImageUri }}
                    style={styles.imagePreview}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Feather name="camera" size={22} color={C.textMuted} />
                    <Text style={[styles.imagePickerText, { color: C.textMuted }]}>{t("merchant_admin.addPhoto")}</Text>
                  </View>
                )}
              </Pressable>
              {currentImageUri && (
                <Pressable
                  onPress={removeImage}
                  style={[styles.removeImageBtn, { backgroundColor: "#fee2e2" }]}
                >
                  <Feather name="x" size={14} color="#ef4444" />
                </Pressable>
              )}
            </View>
            <Input
              label={t("merchant_admin.productName")}
              placeholder={t("merchant_admin.productNamePlaceholder")}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            />
            <Input
              label={t("merchant_admin.category")}
              placeholder={t("merchant_admin.categoryPlaceholder")}
              value={form.category}
              onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
            />
            <Input
              label={t("merchant_admin.priceCop")}
              placeholder="0"
              value={form.priceCop}
              onChangeText={(v) => setForm((f) => ({ ...f, priceCop: v }))}
              keyboardType="numeric"
            />
            <Input
              label={t("merchant_admin.costCop")}
              placeholder="0"
              value={form.costCop}
              onChangeText={(v) => setForm((f) => ({ ...f, costCop: v }))}
              keyboardType="numeric"
            />
            <View style={[styles.ivaExentoRow, { backgroundColor: C.inputBg, borderRadius: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ivaLabel, { color: C.text }]}>{t("merchant_admin.ivaExento")}</Text>
                <Text style={[styles.ivaHint, { color: C.textMuted }]}>{t("merchant_admin.ivaExentoHint")}</Text>
              </View>
              <Switch
                value={form.ivaExento}
                onValueChange={(v) => setForm((f) => ({ ...f, ivaExento: v, ivaRate: v ? "0" : f.ivaRate }))}
                trackColor={{ false: C.border, true: C.primary }}
              />
            </View>
            {!form.ivaExento && (
              <Input
                label={t("merchant_admin.ivaRate")}
                placeholder="19"
                value={form.ivaRate}
                onChangeText={(v) => setForm((f) => ({ ...f, ivaRate: v }))}
                keyboardType="decimal-pad"
              />
            )}
          </View>
          <View style={styles.formActions}>
            <Button
              title={t("common.cancel")}
              variant="secondary"
              onPress={resetForm}
            />
            <Button
              title={editingProduct ? t("common.save") : t("merchant_admin.addProduct")}
              onPress={editingProduct ? handleUpdate : handleCreate}
              loading={createProduct.isPending || updateProduct.isPending || uploadingImage}
            />
          </View>
        </View>
      )}

      {isLoading ? (
        <Loading full={false} />
      ) : products.length === 0 ? (
        <Empty
          title={t("merchant_admin.noProducts")}
          actionLabel={t("merchant_admin.addProduct")}
          onAction={() => { setShowAddForm(true); setForm(emptyForm); }}
        />
      ) : (
        products.map((product) => (
          <View key={product.id} style={[styles.productCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={styles.productRow}>
              {product.imageUrl && resolveImageUrl(product.imageUrl) ? (
                <Image
                  source={{ uri: resolveImageUrl(product.imageUrl)! }}
                  style={styles.productThumbnail}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.productThumbnailPlaceholder, { backgroundColor: C.inputBg }]}>
                  <Feather name="package" size={18} color={C.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.productNameRow}>
                  <Text style={[styles.productName, { color: C.text }]} numberOfLines={1}>
                    {product.name}
                  </Text>
                  {!product.active && (
                    <View style={[styles.badge, { backgroundColor: C.inputBg }]}>
                      <Text style={[styles.badgeText, { color: C.textMuted }]}>{t("merchant_admin.inactive")}</Text>
                    </View>
                  )}
                  {product.ivaExento ? (
                    <View style={[styles.ivaBadge, { backgroundColor: "#f0fdf4" }]}>
                      <Text style={[styles.ivaBadgeText, { color: "#16a34a" }]}>Exento</Text>
                    </View>
                  ) : parseFloat(product.ivaRate || "0") > 0 ? (
                    <View style={[styles.ivaBadge, { backgroundColor: "#eff6ff" }]}>
                      <Text style={[styles.ivaBadgeText, { color: "#2563eb" }]}>IVA {product.ivaRate}%</Text>
                    </View>
                  ) : null}
                </View>
                {product.category ? (
                  <Text style={[styles.productCategory, { color: C.textMuted }]}>{product.category}</Text>
                ) : null}
                <CopAmount amount={product.priceCop} size={14} style={{ color: C.primary }} />
              </View>
              <View style={styles.productActions}>
                <Pressable
                  onPress={() => startEdit(product)}
                  style={[styles.iconBtn, { backgroundColor: C.inputBg }]}
                >
                  <Feather name="edit-2" size={15} color={C.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => toggleActive(product)}
                  style={[styles.iconBtn, { backgroundColor: C.inputBg }]}
                >
                  <Feather name={product.active ? "eye-off" : "eye"} size={15} color={C.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(product)}
                  style={[styles.iconBtn, { backgroundColor: "#fee2e2" }]}
                >
                  <Feather name="trash-2" size={15} color="#ef4444" />
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  formCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  formTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  formActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  productCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  productRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  productNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  productName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  productCategory: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  productActions: { flexDirection: "row", gap: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  ivaExentoRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  ivaLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  ivaHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  ivaBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 3 },
  ivaBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  imagePickerRow: { position: "relative", alignSelf: "flex-start" },
  imagePicker: { width: 80, height: 80, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  imagePreview: { width: 80, height: 80 },
  imagePickerPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  imagePickerText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  removeImageBtn: { position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  productThumbnail: { width: 48, height: 48, borderRadius: 10 },
  productThumbnailPlaceholder: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
