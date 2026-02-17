import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { execSync } from 'child_process'

// Get build-time version information
function getBuildInfo() {
  try {
    const commitSha = execSync('git rev-parse HEAD').toString().trim();
    const commitShortSha = execSync('git rev-parse --short HEAD').toString().trim();
    const buildTimestamp = new Date().toISOString();
    return { commitSha, commitShortSha, buildTimestamp };
  } catch (error) {
    console.warn('Could not retrieve git information:', error.message);
    return {
      commitSha: 'unknown',
      commitShortSha: 'unknown',
      buildTimestamp: new Date().toISOString()
    };
  }
}

// Cache build info to avoid redundant git command executions
const buildInfo = getBuildInfo();

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  define: {
    // Inject build-time environment variables
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(buildInfo.commitSha),
    'import.meta.env.VITE_GIT_COMMIT_SHORT_SHA': JSON.stringify(buildInfo.commitShortSha),
    'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(buildInfo.buildTimestamp),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '0.0.0'),
  },
  plugins: [
    base44({
      // Keep Base44 plugin for UI authoring, but do NOT rely on Base44 for brain/db runtime.
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      visualEditAgent: true
    }),
    react(),
  ],
  server: {
    proxy: {
      // Local engine API (Fastify)
      '/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});