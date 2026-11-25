import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'
import '../styles.css'
import '../brand-overrides.css'
import { ThemeProvider } from '@/components/theme-provider'

export const metadata: Metadata = {
  title: 'AlphaProTrade | Market intelligence for traders',
  description: 'AlphaProTrade market intelligence and subscription workspace. Demo data only.',
  icons: { icon: '/brand/alphaprotrade_mark.svg' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
