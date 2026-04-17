import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { CommandPalette } from '../CommandPalette'

export function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-30 h-14 bg-background/90 backdrop-blur border-b border-border flex items-center justify-between px-4">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menu de navegação"
            className="h-9 w-9 -ml-1.5 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo-icon-256.png" alt="Imob CRM" className="h-8 w-8 rounded-lg object-contain" />
            <p className="text-sm font-semibold tracking-tight">Imob CRM</p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event('imob:open-command-palette'))}
            className="h-9 w-9 -mr-1.5 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            title="Busca rápida"
            aria-label="Abrir busca rápida"
          >
            <Search size={16} aria-hidden="true" />
          </button>
        </header>

        <main className="flex-1 min-w-0">
          <div
            key={location.pathname}
            className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8 animate-fade-in"
          >
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}
