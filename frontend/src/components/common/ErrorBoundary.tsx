"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ReClaw Error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <AlertTriangle size={40} className="text-amber-500 mx-auto mb-4" />
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                Something went wrong
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {this.state.error?.message || "An unexpected error occurred."}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-reclaw-600 text-white rounded-lg hover:bg-reclaw-700 text-sm"
              >
                <RefreshCw size={14} /> Try Again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
