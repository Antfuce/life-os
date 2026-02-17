import React, { useState } from 'react';

/**
 * VersionMarker - Displays deployment version information
 * Shows current commit SHA, build timestamp, and version
 * Helps verify that Base44 is running the correct deployed code
 */
export default function VersionMarker() {
  const [isExpanded, setIsExpanded] = useState(false);

  // These variables are injected at build time by Vite
  const commitSha = import.meta.env.VITE_GIT_COMMIT_SHA || 'unknown';
  const commitShortSha = import.meta.env.VITE_GIT_COMMIT_SHORT_SHA || 'unknown';
  const buildTime = import.meta.env.VITE_BUILD_TIMESTAMP || 'unknown';
  const appVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <div className="fixed bottom-2 right-2 z-50 select-none">
      {isExpanded ? (
        <div className="bg-neutral-800 text-white text-xs rounded-lg shadow-lg p-3 min-w-[280px] border border-neutral-700">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-neutral-300">Deployment Info</span>
            <button
              onClick={toggleExpanded}
              className="text-neutral-400 hover:text-white transition-colors"
              aria-label="Collapse version info"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-neutral-400">Version:</span>
              <span className="font-mono">{appVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Commit:</span>
              <span className="font-mono">{commitShortSha}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Full SHA:</span>
              <span className="font-mono text-[10px]">{commitSha}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Built:</span>
              <span className="font-mono text-[10px]">
                {buildTime !== 'unknown' ? new Date(buildTime).toLocaleString() : buildTime}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={toggleExpanded}
          className="bg-neutral-800 text-neutral-400 hover:text-white text-xs rounded-full px-3 py-1.5 shadow-lg border border-neutral-700 transition-colors font-mono"
          aria-label="Show version info"
        >
          v{appVersion} • {commitShortSha}
        </button>
      )}
    </div>
  );
}
