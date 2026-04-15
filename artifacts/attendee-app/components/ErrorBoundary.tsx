import React, { Component, ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Sentry from "@sentry/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

function ErrorFallback({ error, onRetry }: { error?: Error; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={styles.title}>Algo salió mal</Text>
      {__DEV__ && error && (
        <Text style={styles.errorText}>{error.message}</Text>
      )}
      <Pressable onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      console.error("ErrorBoundary caught:", error, info);
    }
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack?.split("\n").slice(0, 15).join("\n") },
      tags: { errorSource: "ErrorBoundary" },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => {
            import("expo")
              .then((m) => m.reloadAppAsync())
              .catch(() => this.setState({ hasError: false }));
          }}
        />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    color: "#a1a1aa",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#00f1ff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#000",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
