"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional short label used in the default fallback (e.g. a node title). */
  label?: string;
  /** Optional side-effect hook for logging. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains render-time exceptions so a single throwing subtree (e.g. one
 * malformed node) does not unmount the whole React root. Renders an
 * unobtrusive fallback with a "Try again" affordance that re-mounts the
 * subtree, letting the rest of the workflow keep working.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    if (process.env.NODE_ENV !== "production") {
      console.error("ErrorBoundary caught an error:", error, info);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #ef4444",
            background: "#1f1214",
            color: "#fca5a5",
            fontSize: 12,
            lineHeight: 1.4,
            maxWidth: 260,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {this.props.label
              ? `${this.props.label} failed to render`
              : "Something went wrong"}
          </div>
          <div
            style={{
              opacity: 0.8,
              marginBottom: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message || "Unexpected render error"}
          </div>
          <button
            type="button"
            onClick={this.reset}
            style={{
              border: "1px solid #ef4444",
              background: "transparent",
              color: "#fca5a5",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
