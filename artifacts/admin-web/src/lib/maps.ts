export const GOOGLE_MAPS_API_KEY = "AIzaSyCyI7QJ3J5_Peqnr4bqFXAIqaeac1DuT_c";
export const MAPS_LIBRARIES: ("places")[] = ["places"];
export const DEFAULT_CENTER = { lat: 4.711, lng: -74.0721 };

export const TAPEE_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#7dd3fc" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111111" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0d1a0d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e1e2e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111111" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#252538" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#00f1ff", weight: 0.4 }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#111111" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#040d12" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#00f1ff", lightness: -60 }] },
];
