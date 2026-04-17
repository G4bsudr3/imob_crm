import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Calendar, Home, Bot, Settings as SettingsIcon, LayoutDashboard, Plus, UserCircle2, MapPin, CornerDownLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { cn, formatCurrency, STATUS_LEAD_LABELS } from '../lib/utils'
import type { Lead, Property, Appointment } from '../types/database'

type Item = {
  id: string
  kind: 'action' | 'lead' | 'property' | 'appointment'
  icon: typeof Search
  title: string
  subtitle?: string
  hint?: string
  onSelect: () => void
}

export function CommandPalette() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])

  // Open shortcut (Cmd/Ctrl+K) + custom event
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    function onOpenEvent() { setOpen(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('imob:open-command-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('imob:open-command-palette', onOpenEvent)
    }
  }, [open])

  // Load minimal data on open (cached in state for subsequent opens)
  useEffect(() => {
    if (!open || !orgId) return
    if (leads.length > 0 || properties.length > 0) return
    ;(async () => {
      const [lRes, pRes, aRes] = await Promise.all([
        supabase.from('leads').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50),
        supabase.from('properties').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50),
        supabase.from('appointments').select('*').eq('organization_id', orgId).order('scheduled_at', { ascending: true }).limit(30),
      ])
      setLeads((lRes.data as Lead[]) ?? [])
      setProperties((pRes.data as Property[]) ?? [])
      setAppointments((aRes.data as Appointment[]) ?? [])
    })()
  }, [open, orgId, leads.length, properties.length])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()

    const actions: Item[] = [
      { id: 'go-dashboard', kind: 'action', icon: LayoutDashboard, title: 'Ir para Dashboard', hint: 'Navegação', onSelect: () => navigate('/') },
      { id: 'go-leads', kind: 'action', icon: Users, title: 'Ir para Leads', hint: 'Navegação', onSelect: () => navigate('/leads') },
      { id: 'go-appts', kind: 'action', icon: Calendar, title: 'Ir para Agendamentos', hint: 'Navegação', onSelect: () => navigate('/agendamentos') },
      { id: 'go-props', kind: 'action', icon: Home, title: 'Ir para Imóveis', hint: 'Navegação', onSelect: () => navigate('/imoveis') },
      { id: 'go-bot', kind: 'action', icon: Bot, title: 'Configurar Bot', hint: 'Navegação', onSelect: () => navigate('/bot') },
      { id: 'go-settings', kind: 'action', icon: SettingsIcon, title: 'Configurações', hint: 'Navegação', onSelect: () => navigate('/settings') },
      { id: 'new-lead', kind: 'action', icon: Plus, title: 'Criar novo lead', hint: 'Ação', onSelect: () => navigate('/leads?new=1') },
      { id: 'new-appt', kind: 'action', icon: Plus, title: 'Criar novo agendamento', hint: 'Ação', onSelect: () => navigate('/agendamentos') },
      { id: 'new-prop', kind: 'action', icon: Plus, title: 'Criar novo imóvel', hint: 'Ação', onSelect: () => navigate('/imoveis') },
    ]

    const leadItems: Item[] = leads.map((l) => ({
      id: `lead-${l.id}`,
      kind: 'lead',
      icon: UserCircle2,
      title: l.name ?? 'Sem nome',
      subtitle: `${l.phone} · ${STATUS_LEAD_LABELS[l.status] ?? l.status}`,
      hint: 'Lead',
      onSelect: () => navigate('/leads'),
    }))

    const propItems: Item[] = properties.map((p) => ({
      id: `prop-${p.id}`,
      kind: 'property',
      icon: Home,
      title: p.title,
      subtitle: [p.neighborhood, p.price ? formatCurrency(Number(p.price)) : null].filter(Boolean).join(' · '),
      hint: 'Imóvel',
      onSelect: () => navigate('/imoveis'),
    }))

    const apptItems: Item[] = appointments.map((a) => ({
      id: `appt-${a.id}`,
      kind: 'appointment',
      icon: Calendar,
      title: new Date(a.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      subtitle: a.status,
      hint: 'Agendamento',
      onSelect: () => navigate('/agendamentos'),
    }))

    const all = [...actions, ...leadItems, ...propItems, ...apptItems]
    if (!q) return all.slice(0, 15)
    return all
      .filter((it) => {
        const hay = `${it.title} ${it.subtitle ?? ''} ${it.hint ?? ''}`.toLowerCase()
        return q.split(/\s+/).every((tok) => hay.includes(tok))
      })
      .slice(0, 20)
  }, [query, leads, properties, appointments, navigate])

  useEffect(() => {
    setActive(0)
  }, [query])

  function handleSelect(item: Item) {
    item.onSelect()
    setOpen(false)
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[active]
      if (it) handleSelect(it)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-foreground/30 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-float overflow-hidden animate-slide-in-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search size={15} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscar leads, imóveis, agendamentos ou ações..."
            className="flex-1 py-3.5 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{query}"
            </div>
          ) : (
            items.map((it, idx) => {
              const Icon = it.icon
              const isActive = idx === active
              return (
                <button
                  key={it.id}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => handleSelect(it)}
                  className={cn(
                    'w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                    isActive ? 'bg-subtle' : 'hover:bg-subtle/60',
                  )}
                >
                  <div className={cn(
                    'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                    it.kind === 'action' ? 'bg-primary-soft text-primary-soft-foreground' :
                    it.kind === 'lead' ? 'bg-info-soft text-info' :
                    it.kind === 'property' ? 'bg-success-soft text-success' :
                    'bg-warning-soft text-warning',
                  )}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{it.title}</p>
                    {it.subtitle && (
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        {it.kind === 'property' && <MapPin size={10} />}
                        {it.subtitle}
                      </p>
                    )}
                  </div>
                  {it.hint && (
                    <span className="hidden sm:inline-block text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      {it.hint}
                    </span>
                  )}
                  {isActive && (
                    <CornerDownLeft size={12} className="text-muted-foreground shrink-0" />
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-subtle/40 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono border border-border rounded px-1 py-px bg-background">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono border border-border rounded px-1 py-px bg-background">↵</kbd>
              selecionar
            </span>
          </div>
          <span>{items.length} resultado{items.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
