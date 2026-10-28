import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--color-ink-800)',
            border: '1px solid var(--color-line-strong)',
            color: 'var(--color-fg)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)
