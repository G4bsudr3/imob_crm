import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Trash2, Eye, Users, LayoutGrid, Rows3, Radio, Plus, Download } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { STATUS_LEAD_LABELS, STATUS_LEAD_VARIANTS, formatDateShort, formatCurrency, cn } from '../lib/utils'
import { LeadDetail } from '../components/LeadDetail'
import { LeadsKanban } from '../components/LeadsKanban'
import { LeadCreateDialog } from '../components/LeadCreateDialog'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonTableRow } from '../components/ui/Skeleton'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import type { Lead } from '../types/database'

const STATUS_OPTIONS = ['novo', 'em_contato', 'agendado', 'descartado', 'convertido']

type View = 'table' | 'kanban'

export function Leads() {
  const { leads, loading, updateLeadStatus, deleteLead, refetch } = useLeads()
  const { profile } = useProfile()
  const confirm = useConfirm()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<View>(() => {
    return (localStorage.getItem('leads.view') as View) || 'kanban'
  })
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Em mobile, força tabela (Kanban com drag-and-drop não funciona bem em touch em tela estreita)
  const effectiveView: View = isMobile ? 'table' : view
  const mountedAt = useRef(Date.now())
  const [searchParams, setSearchParams] = useSearchParams()

  // Abre o dialog se vier de /leads?new=1 (usado pelo Command Palette)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true)
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  function setViewPersisted(v: View) {
    setView(v)
    localStorage.setItem('leads.view', v)
  }

  // Atalho de teclado: N pra novo lead (quando nao ha modal aberto e nao esta em input)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (selected || creating) return
      e.preventDefault()
      setCreating(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, creating])

  // Toast em tempo real quando um NOVO lead chega (ignora o snapshot inicial)
  useEffect(() => {
    const orgId = profile?.organization_id
    if (!orgId) return
    const channel = supabase
      .channel(`leads-toast-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads', filter: `organization_id=eq.${orgId}` },
        (payload) => {
          // Ignora eventos que chegam logo na montagem (hydratation)
          if (Date.now() - mountedAt.current < 2500) return
          const lead = payload.new as Lead
          const origem = lead.source === 'whatsapp' ? 'via WhatsApp' : 'manualmente'
          toast.success('Novo lead', `${lead.name ?? lead.phone} entrou ${origem}`)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.organization_id, toast])

  async function handleDelete(lead: Lead) {
    const ok = await confirm({
      title: 'Remover lead?',
      description: `${lead.name ?? lead.phone} será removido permanentemente. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      variant: 'destructive',
    })
    if (!ok) return
    const error = await deleteLead(lead.id)
    if (error) toast.error('Erro ao remover', error.message)
    else toast.success('Lead removido')
  }

  async function handleStatusChange(lead: Lead, status: string) {
    if (lead.status === status) return
    const error = await updateLeadStatus(lead.id, status)
    if (error) toast.error('Erro ao atualizar status', error.message)
    else if (view === 'kanban') {
      toast.success(`Movido para ${STATUS_LEAD_LABELS[status]}`)
    }
  }

  const filtered = leads.filter((l) => {
    const matchSearch =
      !search ||
      l.phone.includes(search) ||
      (l.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || l.status === filterStatus
    return matchSearch && matchStatus
  })

  function handleExportCsv() {
    if (filtered.length === 0) return
    const headers = ['Nome', 'Telefone', 'Status', 'Tipo', 'Localização', 'Quartos', 'Orçamento', 'Origem', 'Entrou em']
    const rows = filtered.map((l) => [
      l.name ?? '',
      l.phone,
      STATUS_LEAD_LABELS[l.status] ?? l.status,
      l.property_type ?? '',
      l.location_interest ?? '',
      l.bedrooms_needed?.toString() ?? '',
      l.budget_max?.toString() ?? '',
      l.source ?? '',
      new Date(l.created_at).toISOString(),
    ])
    const escape = (cell: string) => {
      const needsQuote = /[",\n;]/.test(cell)
      const cleaned = cell.replace(/"/g, '""')
      return needsQuote ? `"${cleaned}"` : cleaned
    }
    const csv = [headers, ...rows].map((r) => r.map((c) => escape(String(c))).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Exportado', `${filtered.length} lead${filtered.length !== 1 ? 's' : ''} em CSV`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`${leads.length} lead${leads.length !== 1 ? 's' : ''} · ${filtered.length} exibido${filtered.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <span
              className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground"
              title="Atualização em tempo real ativa"
            >
              <Radio size={11} className="text-success animate-pulse" />
              Tempo real
            </span>
            <Button
              variant="outline"
              size="md"
              leftIcon={<Download size={14} />}
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              title="Exportar em CSV"
            >
              Exportar
            </Button>
            <Button
              variant="primary"
              size="md"
              leftIcon={<Plus size={14} />}
              onClick={() => setCreating(true)}
              title="Novo lead (atalho: N)"
            >
              Novo lead
            </Button>
            <div className={cn('inline-flex items-center rounded-lg border border-border bg-card p-0.5 shadow-xs', isMobile && 'hidden')}>
              <button
                onClick={() => setViewPersisted('kanban')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  view === 'kanban'
                    ? 'bg-foreground text-background shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="Visualização em Kanban"
              >
                <LayoutGrid size={13} /> Kanban
              </button>
              <button
                onClick={() => setViewPersisted('table')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  view === 'table'
                    ? 'bg-foreground text-background shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="Visualização em tabela"
              >
                <Rows3 size={13} /> Tabela
              </button>
            </div>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px]">
          <Input
            leftIcon={<Search size={14} />}
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {effectiveView === 'table' && (
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-48"
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LEAD_LABELS[s]}</option>
            ))}
          </Select>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        effectiveView === 'table' ? (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-subtle/60 border-b border-border">
                <tr>
                  {['Lead', 'Interesse', 'Orçamento', 'Status', 'Entrou', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} cols={6} />)}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {STATUS_OPTIONS.map((s) => (
              <div key={s} className="w-[280px] shrink-0 h-80 rounded-xl border border-border bg-subtle/40 animate-pulse" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={leads.length === 0 ? 'Nenhum lead ainda' : 'Nenhum lead corresponde ao filtro'}
          description={leads.length === 0 ? 'Leads entram automaticamente via bot WhatsApp ou podem ser adicionados manualmente.' : 'Ajuste a busca ou o status para ver mais resultados.'}
          action={leads.length === 0 ? (
            <Button variant="primary" leftIcon={<Plus size={14} />} onClick={() => setCreating(true)}>
              Novo lead
            </Button>
          ) : undefined}
        />
      ) : effectiveView === 'kanban' ? (
        <LeadsKanban
          leads={filtered}
          onStatusChange={handleStatusChange}
          onOpen={setSelected}
          onDelete={handleDelete}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle/60 border-b border-border">
                <tr className="text-left">
                  <th className="px-5 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Lead</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Interesse</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Orçamento</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Entrou</th>
                  <th className="px-5 py-3 w-0" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="hover:bg-subtle/40 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                          {(lead.name ?? lead.phone).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{lead.name ?? 'Sem nome'}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{lead.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-foreground capitalize">{lead.property_type ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{lead.location_interest ?? ''}</p>
                    </td>
                    <td className="px-5 py-3 text-foreground tabular">
                      {lead.budget_max ? formatCurrency(lead.budget_max) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead, e.target.value)}
                        className="h-7 py-0 text-xs w-36"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{STATUS_LEAD_LABELS[s]}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs tabular">{formatDateShort(lead.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelected(lead)}
                          className="h-8 w-8"
                          title="Ver detalhes"
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(lead)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-subtle/30 border-t border-border">
                <tr>
                  <td colSpan={6} className="px-5 py-2.5 text-[11px] text-muted-foreground">
                    Mostrando {filtered.length} de {leads.length} lead{leads.length !== 1 ? 's' : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Legenda só na tabela (no Kanban as colunas já são a legenda) */}
      {effectiveView === 'table' && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Legenda:</span>
          {STATUS_OPTIONS.map((s) => (
            <Badge key={s} variant={STATUS_LEAD_VARIANTS[s]} dot>
              {STATUS_LEAD_LABELS[s]}
            </Badge>
          ))}
        </div>
      )}

      {selected && (
        <LeadDetail lead={selected} onClose={() => setSelected(null)} onSaved={refetch} />
      )}
      {creating && (
        <LeadCreateDialog onClose={() => setCreating(false)} onCreated={refetch} />
      )}
    </div>
  )
}
