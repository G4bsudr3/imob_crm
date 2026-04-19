import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Trash2, Eye, Users, LayoutGrid, Rows3, Radio, Plus, Download, Upload } from 'lucide-react'
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

type ParsedRow = {
  name: string
  phone: string
  property_type: string
  location_interest: string
  bedrooms_needed: string
  budget_max: string
  source_detail: string
  duplicate: boolean
}

function LeadImportDialog({ onClose, onImported, orgId }: { onClose: () => void; onImported: () => void; orgId: string }) {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleFile(f: File) {
    setFile(f)
    setError(null)
    try {
      const text = await f.text()
      const cleaned = text.replace(/^\uFEFF/, '')
      const lines = cleaned.split(/\r?\n/).filter((l) => l.trim() !== '')
      if (lines.length < 2) {
        setError('O arquivo CSV não tem linhas suficientes.')
        return
      }
      const headerLine = lines[0]
      const commaCount = (headerLine.match(/,/g) || []).length
      const semicolonCount = (headerLine.match(/;/g) || []).length
      const delimiter = semicolonCount > commaCount ? ';' : ','

      const parseRow = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (ch === delimiter && !inQuotes) {
            result.push(current)
            current = ''
          } else {
            current += ch
          }
        }
        result.push(current)
        return result
      }

      const headers = parseRow(lines[0]).map((h) => h.trim().toLowerCase())
      const colMap: Record<string, number> = {}
      headers.forEach((h, i) => {
        colMap[h] = i
      })

      const get = (row: string[], key: string) => (row[colMap[key]] ?? '').trim()

      const parsed: Omit<ParsedRow, 'duplicate'>[] = []
      for (let i = 1; i < lines.length; i++) {
        const row = parseRow(lines[i])
        const phone = get(row, 'telefone').replace(/\D/g, '')
        if (!phone) continue
        parsed.push({
          name: get(row, 'nome'),
          phone,
          property_type: get(row, 'tipo'),
          location_interest: get(row, 'localizacao'),
          bedrooms_needed: get(row, 'quartos'),
          budget_max: get(row, 'orcamento_max'),
          source_detail: get(row, 'origem_detalhe'),
        })
      }

      const { data: existingData } = await supabase
        .from('leads')
        .select('phone')
        .eq('organization_id', orgId)
      const existingPhones = new Set((existingData ?? []).map((r: { phone: string }) => r.phone))

      const withDuplicates: ParsedRow[] = parsed.map((r) => ({
        ...r,
        duplicate: existingPhones.has(r.phone),
      }))

      setRows(withDuplicates)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao ler o arquivo.')
    }
  }

  async function handleImport() {
    const toInsert = ignoreDuplicates ? rows.filter((r) => !r.duplicate) : rows
    if (toInsert.length === 0) {
      toast.error('Nada para importar', 'Todos os leads são duplicados ou o arquivo está vazio.')
      return
    }
    setImporting(true)
    const batchSize = 50
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize).map((r) => ({
        organization_id: orgId,
        name: r.name || null,
        phone: r.phone,
        property_type: r.property_type || null,
        location_interest: r.location_interest || null,
        bedrooms_needed: r.bedrooms_needed ? parseInt(r.bedrooms_needed, 10) || null : null,
        budget_max: r.budget_max ? parseFloat(r.budget_max) || null : null,
        source_detail: r.source_detail || null,
        source: 'import',
        status: 'novo',
      }))
      const { error: insertError } = await supabase.from('leads').insert(batch as any)
      if (insertError) {
        setError(insertError.message)
        setImporting(false)
        return
      }
    }
    setImporting(false)
    toast.success('Importação concluída', `${toInsert.length} lead${toInsert.length !== 1 ? 's' : ''} importado${toInsert.length !== 1 ? 's' : ''}`)
    onImported()
    onClose()
  }

  const duplicateCount = rows.filter((r) => r.duplicate).length
  const preview = rows.slice(0, 5)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-float animate-slide-in-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
              <Upload size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Importar leads</h2>
              <p className="text-xs text-muted-foreground">Importe leads a partir de um arquivo CSV</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-subtle transition-colors"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!file ? (
            <label className="block cursor-pointer">
              <div className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary hover:bg-primary-soft/10 transition-colors">
                <Upload size={28} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground mb-1">Clique para selecionar um arquivo CSV</p>
                <p className="text-xs text-muted-foreground">Colunas esperadas: nome, telefone, tipo, localizacao, quartos, orcamento_max, origem_detalhe</p>
              </div>
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{rows.length} lead{rows.length !== 1 ? 's' : ''} encontrado{rows.length !== 1 ? 's' : ''}</span>
                  {duplicateCount > 0 && <span className="ml-1">, {duplicateCount} duplicado{duplicateCount !== 1 ? 's' : ''}</span>}
                </p>
                <label className="text-xs text-primary cursor-pointer hover:underline">
                  Trocar arquivo
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                    }}
                  />
                </label>
              </div>

              {rows.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-subtle/60 border-b border-border">
                      <tr>
                        {['Nome', 'Telefone', 'Tipo', 'Origem', 'Status'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.map((row, i) => (
                        <tr key={i} className={cn(row.duplicate && 'bg-warning/5')}>
                          <td className="px-3 py-2 truncate max-w-[120px]">{row.name || <span className="text-muted-foreground italic">sem nome</span>}</td>
                          <td className="px-3 py-2 tabular">{row.phone}</td>
                          <td className="px-3 py-2 truncate max-w-[80px]">{row.property_type || '—'}</td>
                          <td className="px-3 py-2 truncate max-w-[100px]">{row.source_detail || '—'}</td>
                          <td className="px-3 py-2">
                            {row.duplicate ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning/20 text-warning-foreground border border-warning/30">
                                Já existe
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-success/20 text-success border border-success/30">
                                Novo
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 5 && (
                    <div className="px-3 py-2 bg-subtle/30 border-t border-border text-[11px] text-muted-foreground">
                      Mostrando 5 de {rows.length} linhas
                    </div>
                  )}
                </div>
              )}

              {duplicateCount > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ignoreDuplicates}
                    onChange={(e) => setIgnoreDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">Ignorar duplicados</span>
                  <span className="text-xs text-muted-foreground">({duplicateCount} {duplicateCount !== 1 ? 'serão pulados' : 'será pulado'})</span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 bg-subtle/30 rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={importing}>Cancelar</Button>
          {file && rows.length > 0 && (
            <Button onClick={handleImport} loading={importing} disabled={importing}>
              Importar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Leads() {
  const { leads, loading, updateLeadStatus, deleteLead, refetch } = useLeads()
  const { profile } = useProfile()
  const confirm = useConfirm()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [agents, setAgents] = useState<Array<{id: string; name: string | null; email: string | null}>>([])
  const [selected, setSelected] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [view, setView] = useState<View>(() => {
    return (localStorage.getItem('leads.view') as View) || 'kanban'
  })
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const effectiveView: View = isMobile ? 'table' : view
  const mountedAt = useRef(Date.now())
  const [searchParams, setSearchParams] = useSearchParams()

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

  useEffect(() => {
    const orgId = profile?.organization_id
    if (!orgId) return
    const channel = supabase
      .channel(`leads-toast-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads', filter: `organization_id=eq.${orgId}` },
        (payload) => {
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

  useEffect(() => {
    if (!profile?.organization_id) return
    supabase
      .from('profiles')
      .select('id, name, email')
      .eq('organization_id', profile.organization_id)
      .then(({ data }) => setAgents(data ?? []))
  }, [profile?.organization_id])

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
    const matchAgent = !filterAgent || l.assigned_to === filterAgent
    return matchSearch && matchStatus && matchAgent
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
              leftIcon={<Upload size={14} />}
              onClick={() => setImporting(true)}
              title="Importar leads de CSV"
            >
              Importar
            </Button>
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
        {agents.length > 0 && (
          <Select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="w-48"
          >
            <option value="">Todos os corretores</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name ?? a.email ?? a.id}</option>
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
                  <tr key={lead.id} className="hover:bg-subtle/80 border-l-2 border-l-transparent hover:border-l-primary transition-colors group">
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
      {importing && profile?.organization_id && (
        <LeadImportDialog
          onClose={() => setImporting(false)}
          onImported={() => { refetch(); setImporting(false) }}
          orgId={profile.organization_id}
        />
      )}
    </div>
  )
}
