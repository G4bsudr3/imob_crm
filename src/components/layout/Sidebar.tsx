import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, Users, Calendar, Home, MessageSquare, LogOut, Settings as SettingsIcon, X, Search, ChevronUp, UserCog, TrendingUp } from 'lucide-react'
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
  { to: '/negocios', icon: TrendingUp, label: 'Negócios' },
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

        <div className="px-3 py-3 border-t border-border">
          <UserMenu
            initials={initials}
            displayName={displayName}
            email={email}
            roleLabel={roleLabel}
            onSignOut={signOut}
            onNavigate={onMobileClose}
          />
        </div>
      </aside>
    </>
  )
}

function UserMenu({
  initials,
  displayName,
  email,
  roleLabel,
  onSignOut,
  onNavigate,
}: {
  initials: string
  displayName: string
  email: string
  roleLabel: string
  onSignOut: () => void
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick)
      document.addEventListener('keydown', onKey)
      return () => {
        document.removeEventListener('mousedown', onDocClick)
        document.removeEventListener('keydown', onKey)
      }
    }
  }, [open])

  function goProfile() {
    setOpen(false)
    onNavigate()
    navigate('/settings')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          open ? 'bg-subtle' : 'hover:bg-subtle/60',
        )}
      >
        <div className="h-7 w-7 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-[11px] font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium truncate">{displayName}</p>
            <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-subtle text-muted-foreground border border-border shrink-0">
              {roleLabel}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{email || 'Sem sessão'}</p>
        </div>
        <ChevronUp
          size={13}
          className={cn('shrink-0 text-muted-foreground transition-transform', open ? '' : 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+6px)] left-0 right-0 bg-card border border-border rounded-lg shadow-float py-1.5 animate-fade-in z-50"
        >
          <button
            onClick={goProfile}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-subtle transition-colors"
            role="menuitem"
          >
            <UserCog size={13} className="text-muted-foreground" />
            Meu perfil
          </button>
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-destructive hover:bg-destructive-soft transition-colors"
            role="menuitem"
          >
            <LogOut size={13} />
            Sair
          </button>
        </div>
      )}
    </div>
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
