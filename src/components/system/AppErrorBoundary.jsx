import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: String(error?.message || error || 'Unknown UI error'),
    };
  }

  componentDidCatch(error, errorInfo) {
    // Keep visible diagnostics in console for debugging production crashes.
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
        <div className="w-full max-w-xl border border-red-200 bg-red-50 rounded-xl p-5">
          <h1 className="text-lg font-semibold text-red-700">UI crashed</h1>
          <p className="mt-2 text-sm text-red-700">
            The app hit a runtime error instead of rendering. Please refresh once. If it repeats,
            send this message to support.
          </p>
          <pre className="mt-3 text-xs whitespace-pre-wrap break-words bg-white/70 border border-red-100 rounded p-3 text-red-800">
            {this.state.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-3 py-2 rounded bg-red-600 text-white text-sm"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
