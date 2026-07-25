import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: { componentStack?: string }) {
    console.error("App runtime error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-6 py-10 text-slate-900">
          <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-xl shadow-slate-200/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600 text-xl font-bold mb-4">
              !
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">
              A runtime error occurred. This usually happens when some saved data is in an unexpected shape.
            </p>

            <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs font-mono text-slate-700 overflow-auto max-h-32">
              {this.state.error?.message || "Unknown error"}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
              >
                Refresh page
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Clear saved app data? You will need to log in again.")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Clear saved data
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
