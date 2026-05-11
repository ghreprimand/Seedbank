/**
 * React error boundary for Seedbank.
 *
 * Catches render errors in child components and displays a
 * friendly fallback UI instead of a blank screen. Provides
 * a "Try again" button that resets the boundary and a
 * "Reload" button as a last resort.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional fallback to render instead of the default error UI */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Seedbank] Render error caught by ErrorBoundary:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[300px] flex items-center justify-center p-8 animate-fade-in">
          <div className="max-w-md w-full bg-paper border border-ink-100 rounded-card shadow-card p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
            </div>

            <h2 className="text-xl font-serif font-semibold text-ink-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-ink-400 leading-relaxed mb-1">
              An unexpected error occurred. Your data is safe in IndexedDB.
            </p>

            {this.state.error && (
              <p className="text-[11px] font-mono text-ink-300 bg-paper-warm border border-ink-100 rounded-badge px-3 py-2 mt-3 mb-5 break-all text-left">
                {this.state.error.message}
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium
                           bg-sage-600 hover:bg-sage-700 active:bg-sage-800 text-paper rounded-card
                           transition-all active:scale-[0.98] shadow-card"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-500
                           hover:bg-ink-50 rounded-card transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
