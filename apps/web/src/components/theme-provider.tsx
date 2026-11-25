'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => undefined })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('alphaprotrade-theme')
    const initial: Theme = saved === 'light' ? 'light' : 'dark'
    setTheme(initial)
    document.documentElement.dataset.theme = initial
    document.documentElement.classList.toggle('dark', initial === 'dark')
    setInitialized(true)
  }, [])

  useEffect(() => {
    if (!initialized) return
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('alphaprotrade-theme', theme)
  }, [initialized, theme])

  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme((current) => current === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
