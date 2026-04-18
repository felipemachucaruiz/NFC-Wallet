import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, TextInput } from "react-native";
import { addBarcodeListener, isAvailable, startListening, stopListening } from "../modules/barcode-receiver/src";

/**
 * True when the native Android broadcast receiver is compiled into this build.
 * False on iOS, web, or any build that pre-dates build #8.
 * When false, the hook falls back to keyboard-wedge TextInput mode.
 */
export const BROADCAST_MODE = Platform.OS === "android" && isAvailable;

interface UseBarcodeOptions {
  onScan: (barcode: string) => void;
  /** Disable this scanner instance (e.g. when the screen section is not active). Default: true */
  enabled?: boolean;
  /**
   * Enable focus management for keyboard-wedge mode:
   * auto-focus, AppState listener, blur-to-refocus timers.
   * Only active when BROADCAST_MODE is false.
   */
  manageFocus?: boolean;
  /** Debounce keyboard input N ms before firing onScan (0 = submit-only, no debounce). */
  debounceMs?: number;
  /** Delay before auto-refocusing after a blur (keyboard-wedge only). Default: 4000 ms */
  refocusDelayMs?: number;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  manageFocus = false,
  debounceMs = 0,
  refocusDelayMs = 4000,
}: UseBarcodeOptions) {
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const pausedRef = useRef(false);
  const refocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always use the latest onScan without making it a dep of the broadcast listener.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });

  const fireOnScan = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || !enabled) return;
    setValue("");
    onScanRef.current(trimmed);
  }, [enabled]);

  // ── Android: broadcast listener ──────────────────────────────────────────
  useEffect(() => {
    if (!BROADCAST_MODE || !enabled) return;
    startListening();
    const sub = addBarcodeListener(fireOnScan);
    return () => {
      sub.remove();
      stopListening();
    };
  }, [enabled, fireOnScan]);

  // ── Keyboard-wedge: value + optional debounce ────────────────────────────
  const onChangeText = useCallback((text: string) => {
    setValue(text);
    if (debounceMs > 0 && text.length >= 4) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => fireOnScan(text), debounceMs);
    }
  }, [debounceMs, fireOnScan]);

  const onSubmitEditing = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    fireOnScan(value);
  }, [value, fireOnScan]);

  // ── Focus management (keyboard-wedge / iOS only) ─────────────────────────
  const scheduleRefocus = useCallback(() => {
    if (!manageFocus || BROADCAST_MODE) return;
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    refocusTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      if (enabled) inputRef.current?.focus();
    }, refocusDelayMs);
  }, [manageFocus, enabled, refocusDelayMs]);

  /** Blur the field and schedule an auto-refocus (for when user taps other UI). */
  const pauseFocus = useCallback(() => {
    if (!manageFocus || BROADCAST_MODE) return;
    pausedRef.current = true;
    inputRef.current?.blur();
    scheduleRefocus();
  }, [manageFocus, scheduleRefocus]);

  /** Immediately re-focus the field if it is not paused. */
  const resumeFocus = useCallback(() => {
    if (!manageFocus || BROADCAST_MODE) return;
    if (!pausedRef.current && enabled) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [manageFocus, enabled]);

  // AppState: re-focus on foreground (keyboard-wedge only)
  useEffect(() => {
    if (!manageFocus || BROADCAST_MODE || !enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !pausedRef.current) inputRef.current?.focus();
    });
    return () => sub.remove();
  }, [manageFocus, enabled]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (refocusTimerRef.current) clearTimeout(refocusTimerRef.current);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  const inputProps = {
    ref: inputRef,
    value,
    onChangeText,
    onSubmitEditing,
    onBlur: (manageFocus && !BROADCAST_MODE) ? resumeFocus : undefined,
    // autoFocus and focus tricks only make sense in keyboard-wedge mode
    autoFocus: manageFocus && !BROADCAST_MODE,
    showSoftInputOnFocus: false,
    blurOnSubmit: false,
    returnKeyType: "done" as const,
  };

  return { inputProps, inputRef, value, pauseFocus, resumeFocus };
}
