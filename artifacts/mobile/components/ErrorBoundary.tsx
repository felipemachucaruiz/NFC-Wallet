import React, { Component, ComponentType, PropsWithChildren } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";

const CRASH_LOG_KEY = "@tapee_crash_log";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null };

/**
 * This is a special case for for using the class components. Error boundaries must be class components because React only provides error boundary functionality through lifecycle methods (componentDidCatch and getDerivedStateFromError) which are not available in functional components.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static defaultProps: {
    FallbackComponent: ComponentType<ErrorFallbackProps>;
  } = {
    FallbackComponent: ErrorFallback,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info.componentStack);
    }
    const msg = error?.message ?? "unknown render error";
    const stack = (error?.stack ?? info.componentStack ?? "").split("\n").slice(0, 10).join("\n");
    const entry = JSON.stringify({
      message: msg,
      stack,
      isFatal: false,
      source: "ErrorBoundary",
      ts: new Date().toISOString(),
    });
    AsyncStorage.setItem(CRASH_LOG_KEY, entry).catch(() => {});
    Alert.alert("⚛️ RENDER CRASH", `${msg}\n\n${stack}`, [{ text: "OK" }]);
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { FallbackComponent } = this.props;

    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
      />
    ) : (
      this.props.children
    );
  }
}
