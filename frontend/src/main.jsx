import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './assets/globals.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrandingProvider } from './context/BrandingContext.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <App />
      </BrandingProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)