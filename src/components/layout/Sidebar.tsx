import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, Home, MessageSquare, LogOut, Settings as SettingsIcon, X, Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { ThemeToggle } from '../ui/ThemeToggle'

function openCommandPalette() {
  window.dispatchEvent(new Event('imob:open-command-palette'))
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent)
}

const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/agendamentos', icon: Calendar, label: 'Agendamentos' },
  { to: '/imoveis', icon: Home, label: 'Imóveis' },
]

const configNav = [
  { to: '/bot', icon: MessageSquare, label: 'Config. do bot' },
  { to: '/settings', icon: SettingsIcon, label: 'Configurações' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  user: 'Corretor',
}

type SidebarProps = {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const email = user?.email ?? ''
  const displayName = profile?.name?.trim() || email.split('@')[0] || 'Sem nome'
  const initials = (profile?.name?.trim() || email).slice(0, 2).toUpperCase()
  const roleLabel = ROLE_LABELS[profile?.role ?? 'user'] ?? 'Corretor'

  return (
    <>
      {/* Overlay mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 dark:bg-black/70 backdrop-blur-sm lg:hidden transition-opacity',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onMobileClose}
      />

      <aside
        className={cn(
          'bg-background border-r border-border flex flex-col',
          // desktop
          'lg:sticky lg:top-0 lg:w-60 lg:shrink-0 lg:translate-x-0 lg:h-screen',
          // mobile
          'fixed inset-y-0 left-0 z-50 w-[260px] h-dvh transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="px-5 h-16 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo-icon-256.png"
              alt="Imob CRM"
              className="h-9 w-9 rounded-lg shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight truncate">Imob CRM</p>
              <p className="text-[11px] text-muted-foreground -mt-0.5">Gestão de leads</p>
            </div>
          </div>
          <button
            onClick={onMobileClose}
            aria-label="Fechar menu"
            className="lg:hidden text-muted-foreground hover:text-foreground p-1.5 -mr-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => {
              onMobileClose()
              openCommandPalette()
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground bg-subtle/60 hover:bg-subtle border border-border transition-colors"
            title="Busca rápida (Ctrl+K)"
          >
            <Search size={13} className="shrink-0" />
            <span className="flex-1 text-left text-xs">Buscar...</span>
            <kbd className="text-[9px] font-mono border border-border rounded px-1 py-px bg-background">
              {isMac() ? '⌘' : 'Ctrl'} K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
          <NavGroup label="Operação" items={mainNav} onNavigate={onMobileClose} />
          <NavGroup label="Configuração" items={configNav} onNavigate={onMobileClose} />
        </nav>

        <div className="px-3 py-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tema</span>
            <ThemeToggle />
          </div>
          <div className="group flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-subtle/60 transition-colors">
            <div className="h-7 w-7 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate">{displayName}</p>
                <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-subtle text-muted-foreground border border-border shrink-0">
                  {roleLabel}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{email || 'Sem sessão'}</p>
            </div>
            <button
              onClick={() => signOut()}
              title="Sair"
              aria-label="Sair da conta"
              className="opacity-60 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string
  items: typeof mainNav
  onNavigate: () => void
}) {
  return (
    <div>
      <p className="px-2 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-subtle text-foreground'
                  : 'text-muted-foreground hover:bg-subtle/60 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={16}
                  className={cn(
                    'shrink-0 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}
