import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed && parsed.error) {
          friendly = `Cloud sync encountered a ${parsed.operationType || 'database'} error${parsed.path ? ` (${parsed.path})` : ''}: ${parsed.error}`;
        }
      } catch {
        // Not JSON; render raw message cleanly
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
          <div className="card-surface max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-status-warning">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="font-display text-lg font-medium text-ink-primary">
                Something interrupted Quillit
              </h1>
            </div>
            <p className="text-xs leading-relaxed text-ink-secondary break-words">
              {friendly || 'An unexpected application error occurred.'}
            </p>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Resume Workspace</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-secondary px-3.5 py-2 text-xs font-medium"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
