import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppErrorBoundary from '@/components/system/AppErrorBoundary.jsx'
import { AuthProvider } from '@/lib/AuthContext'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>
)
