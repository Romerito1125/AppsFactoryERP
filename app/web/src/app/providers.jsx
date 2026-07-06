import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthProvider } from '@/auth/auth-context'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          },
        },
      }),
  )

  return (
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider delayDuration={120}>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster richColors position="top-right" closeButton />
          </QueryClientProvider>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
