import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'

const shouldResetPwaCache = () => {
  if (typeof window === 'undefined') return false
  const { hostname } = window.location
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || hostname.startsWith('172.')
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && shouldResetPwaCache()) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister()
    })
  })

  if ('caches' in window) {
    void caches.keys().then((keys) => {
      keys.forEach((key) => {
        void caches.delete(key)
      })
    })
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    const reloadKey = 'nova-preload-reload-once'
    const shouldReload = sessionStorage.getItem(reloadKey) !== '1'

    if (shouldReload) {
      sessionStorage.setItem(reloadKey, '1')
      void navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister()
        })
      })
      if ('caches' in window) {
        void caches.keys().then((keys) => {
          keys.forEach((key) => {
            void caches.delete(key)
          })
        })
      }
      window.location.reload()
    }
  })

  window.addEventListener('error', (event) => {
    console.error('Global startup error:', event.error || event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
