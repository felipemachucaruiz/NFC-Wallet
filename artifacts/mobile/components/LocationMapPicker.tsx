import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "@/hooks/useColorScheme";
import Colors from "@/constants/colors";
import Constants from "expo-constants";

export type LocationResult = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  visible: boolean;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  onConfirm: (result: LocationResult) => void;
  onClose: () => void;
};

const DEFAULT_LAT = 4.711;
const DEFAULT_LNG = -74.0721;
const DELTA = 0.01;

const GOOGLE_MAPS_API_KEY: string =
  (Constants.expoConfig?.extra as { googleMapsApiKey?: string } | undefined)
    ?.googleMapsApiKey ?? "";

// Safely load native map modules — they require native code baked into the APK.
// If the current APK was built before these packages were added, the require
// will throw and we fall back to the manual coordinate form instead of crashing.
let MapView: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;
let GooglePlacesAutocomplete: React.ComponentType<any> | null = null;

try {
  const maps = require("react-native-maps") as {
    default: React.ComponentType<any>;
    Marker: React.ComponentType<any>;
  };
  MapView = maps.default;
  Marker = maps.Marker;
  const places = require("react-native-google-places-autocomplete") as {
    GooglePlacesAutocomplete: React.ComponentType<any>;
  };
  GooglePlacesAutocomplete = places.GooglePlacesAutocomplete;
} catch {
  // Native module not linked in this APK — will use manual fallback below
}

const mapsAvailable = !!MapView && !!Marker && !!GooglePlacesAutocomplete;

// ─── Manual coordinate fallback (shown when native maps not in APK) ──────────

function ManualFallback({ visible, initialLatitude, initialLongitude, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [lat, setLat] = useState(initialLatitude != null ? String(initialLatitude) : "");
  const [lng, setLng] = useState(initialLongitude != null ? String(initialLongitude) : "");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (visible) {
      setLat(initialLatitude != null ? String(initialLatitude) : "");
      setLng(initialLongitude != null ? String(initialLongitude) : "");
      setAddress("");
    }
  }, [visible, initialLatitude, initialLongitude]);

  const handleConfirm = () => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude)) return;
    onConfirm({ address, latitude, longitude });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.background, paddingTop: insets.top + 16 }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={C.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={[styles.updateBanner, { backgroundColor: C.card, borderColor: C.warning }]}>
          <Feather name="info" size={14} color={C.warning} />
          <Text style={[styles.updateText, { color: C.textSecondary }]}>
            {t("admin.updateAppForMaps", "Instala la nueva versión de la app para usar el mapa interactivo.")}
          </Text>
        </View>

        <View style={styles.content}>
          <Text style={[styles.hint, { color: C.textMuted }]}>
            {t("admin.pickLocationPrompt")}
          </Text>
          <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.venue")}</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={t("admin.venuePlaceholder")}
            placeholderTextColor={C.textMuted}
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
          />
          <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.latitude")} *</Text>
          <TextInput
            value={lat}
            onChangeText={setLat}
            placeholder="4.7110"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
          />
          <Text style={[styles.label, { color: C.textSecondary }]}>{t("admin.longitude")} *</Text>
          <TextInput
            value={lng}
            onChangeText={setLng}
            placeholder="-74.0721"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
          />
          <Pressable
            style={[styles.confirmBtn, { backgroundColor: C.primary }]}
            onPress={handleConfirm}
          >
            <Text style={styles.confirmText}>{t("admin.confirmLocation")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Full Google Maps picker (requires native APK with react-native-maps) ─────

function FullMapPicker({ visible, initialLatitude, initialLongitude, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const C = scheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const initLat = initialLatitude ?? DEFAULT_LAT;
  const initLng = initialLongitude ?? DEFAULT_LNG;

  const [region, setRegion] = useState({
    latitude: initLat,
    longitude: initLng,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  });
  const [pinCoord, setPinCoord] = useState({ latitude: initLat, longitude: initLng });
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      const lat = initialLatitude ?? DEFAULT_LAT;
      const lng = initialLongitude ?? DEFAULT_LNG;
      setRegion({ latitude: lat, longitude: lng, latitudeDelta: DELTA, longitudeDelta: DELTA });
      setPinCoord({ latitude: lat, longitude: lng });
      setAddress("");
      setError("");
    }
  }, [visible, initialLatitude, initialLongitude]);

  const animateTo = useCallback((lat: number, lng: number) => {
    const newRegion = { latitude: lat, longitude: lng, latitudeDelta: DELTA, longitudeDelta: DELTA };
    setRegion(newRegion);
    setPinCoord({ latitude: lat, longitude: lng });
    mapRef.current?.animateToRegion(newRegion, 400);
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocating(true);
    setError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(t("admin.locationPermissionDenied"));
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      animateTo(loc.coords.latitude, loc.coords.longitude);
      setAddress("");
    } catch {
      setError(t("admin.locationError"));
    }
    setLocating(false);
  }, [t, animateTo]);

  const handleConfirm = useCallback(() => {
    Keyboard.dismiss();
    onConfirm({
      address: address.trim() || `${pinCoord.latitude.toFixed(6)}, ${pinCoord.longitude.toFixed(6)}`,
      latitude: pinCoord.latitude,
      longitude: pinCoord.longitude,
    });
  }, [pinCoord, address, onConfirm]);

  const MV = MapView!;
  const Mk = Marker!;
  const GPA = GooglePlacesAutocomplete!;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[mapStyles.container, { backgroundColor: C.background }]}>

        <View style={[mapStyles.header, { backgroundColor: C.card, paddingTop: insets.top + 8, borderBottomColor: C.border }]}>
          <Pressable onPress={onClose} style={mapStyles.closeBtn} hitSlop={12}>
            <Feather name="x" size={22} color={C.textSecondary} />
          </Pressable>
          <Text style={[mapStyles.headerTitle, { color: C.text }]}>{t("admin.locationPickerTitle")}</Text>
          <View style={{ width: 34 }} />
        </View>

        <View style={[mapStyles.searchContainer, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <GPA
            placeholder={t("admin.searchVenuePlaceholder") || "Search for a venue or address…"}
            onPress={(data: any, details: any) => {
              if (!details?.geometry?.location) return;
              const { lat, lng } = details.geometry.location;
              animateTo(lat, lng);
              setAddress(data.description);
            }}
            query={{ key: GOOGLE_MAPS_API_KEY, language: "es" }}
            fetchDetails
            enablePoweredByContainer={false}
            keepResultsAfterBlur={false}
            keyboardShouldPersistTaps="handled"
            styles={{
              container: { flex: 0 },
              textInputContainer: { backgroundColor: "transparent", paddingHorizontal: 0 },
              textInput: {
                height: 44,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.inputBg,
                color: C.text,
                paddingHorizontal: 14,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                marginBottom: 0,
              },
              listView: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 4, zIndex: 9999 },
              row: { backgroundColor: C.card, padding: 12 },
              description: { color: C.text, fontSize: 13, fontFamily: "Inter_400Regular" },
              separator: { backgroundColor: C.border, height: StyleSheet.hairlineWidth },
            }}
          />
        </View>

        <MV
          ref={mapRef}
          style={mapStyles.map}
          provider="google"
          region={region}
          onRegionChangeComplete={setRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
        >
          <Mk
            coordinate={pinCoord}
            draggable
            onDragEnd={(e: any) => {
              const { latitude, longitude } = e.nativeEvent.coordinate;
              setPinCoord({ latitude, longitude });
              setRegion((r) => ({ ...r, latitude, longitude }));
            }}
            pinColor={C.primary}
          />
        </MV>

        <TouchableOpacity
          style={[mapStyles.gpsButton, { backgroundColor: C.card, borderColor: C.border }]}
          onPress={handleUseCurrentLocation}
          disabled={locating}
          activeOpacity={0.8}
        >
          {locating
            ? <ActivityIndicator size="small" color={C.primary} />
            : <Feather name="navigation" size={20} color={C.primary} />}
        </TouchableOpacity>

        <View style={[mapStyles.coordsBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          {!!error && (
            <View style={[mapStyles.errorRow, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
              <Feather name="alert-circle" size={13} color={C.danger} />
              <Text style={[mapStyles.errorText, { color: C.danger }]}>{error}</Text>
            </View>
          )}
          <View style={mapStyles.coordsRow}>
            <View style={mapStyles.coordItem}>
              <Text style={[mapStyles.coordLabel, { color: C.textMuted }]}>LAT</Text>
              <Text style={[mapStyles.coordValue, { color: C.text }]}>{pinCoord.latitude.toFixed(6)}</Text>
            </View>
            <View style={[mapStyles.coordDivider, { backgroundColor: C.border }]} />
            <View style={mapStyles.coordItem}>
              <Text style={[mapStyles.coordLabel, { color: C.textMuted }]}>LNG</Text>
              <Text style={[mapStyles.coordValue, { color: C.text }]}>{pinCoord.longitude.toFixed(6)}</Text>
            </View>
          </View>
        </View>

        <View style={[mapStyles.footer, { backgroundColor: C.card, paddingBottom: insets.bottom + 16, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[mapStyles.confirmBtn, { backgroundColor: C.primary }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <Feather name="check" size={18} color="#0a0a0a" />
            <Text style={mapStyles.confirmText}>{t("admin.confirmLocation")}</Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

// ─── Public export — auto-selects based on APK capabilities ──────────────────

export function LocationMapPicker(props: Props) {
  return mapsAvailable ? <FullMapPicker {...props} /> : <ManualFallback {...props} />;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 10 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  confirmBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  confirmText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0a0a0a" },
  updateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  updateText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
});

const mapStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  closeBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 100 },
  map: { flex: 1 },
  gpsButton: {
    position: "absolute",
    bottom: 180,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  coordsBar: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  coordsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  coordItem: { flex: 1, alignItems: "center", gap: 2 },
  coordLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  coordValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  coordDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  errorText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  confirmText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#0a0a0a" },
});
