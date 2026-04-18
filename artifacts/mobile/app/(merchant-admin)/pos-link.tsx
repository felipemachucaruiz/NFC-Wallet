// Placeholder — the tab bar button for this route overrides the press handler
// to push /(merchant-pos)/ instead of rendering this screen.
import { router } from "expo-router";
import { useEffect } from "react";

export default function PosLinkScreen() {
  useEffect(() => {
    router.replace("/(merchant-pos)/");
  }, []);
  return null;
}
