import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
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
  active: boolean;
};

type FormState = {
  name: string;
  category: string;
  priceCop: string;
  costCop: string;
};

const emptyForm: FormState = { name: "", category: "", priceCop: "", costCop: "" };

export default function MerchantProductsScreen() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user } = useAuth();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

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
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { Alert.alert(t("common.error"), t("merchant_admin.nameRequired")); return; }
    if (!form.priceCop.trim()) { Alert.alert(t("common.error"), t("merchant_admin.priceRequired")); return; }
    const price = parseInt(form.priceCop, 10);
    const cost = parseInt(form.costCop || "0", 10);
    if (isNaN(price) || price < 0) { Alert.alert(t("common.error"), t("merchant_admin.priceRequired")); return; }
    try {
      await createProduct.mutateAsync({
        data: {
          merchantId,
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          priceCop: price,
          costCop: isNaN(cost) ? 0 : cost,
        },
      });
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
    try {
      await updateProduct.mutateAsync({
        productId: editingProduct.id,
        data: {
          name: form.name.trim(),
          category: form.category.trim() || undefined,
          priceCop: isNaN(price) ? editingProduct.priceCop : price,
          costCop: isNaN(cost) ? 0 : cost,
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
    setForm({
      name: product.name,
      category: product.category ?? "",
      priceCop: String(product.priceCop),
      costCop: product.costCop ? String(product.costCop) : "",
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
            onPress={() => { setShowAddForm(true); setForm(emptyForm); }}
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
              loading={createProduct.isPending || updateProduct.isPending}
            />
          </View>
        </View>
      )}

      {isLoading ? (
        <Loading />
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
});
