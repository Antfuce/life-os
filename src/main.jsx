import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
codex/assess-current-mvp-tasks-and-completion-status-zdz8sf
import { AuthProvider } from '@/lib/AuthContext'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
  </AuthProvider>
=======
import AppErrorBoundary from '@/components/system/AppErrorBoundary.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
  prod
)
