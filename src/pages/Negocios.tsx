import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { formatCurrency, formatDate, STATUS_LEAD_LABELS, STATUS_LEAD_VARIANTS } from '../lib/utils'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton, SkeletonTableRow } from '../components/ui/Skeleton'

type DealLead = {
  id: string
  name: string | null
  phone: string | null
  status: string
  deal_value: number | null
  deal_type: string | null
  deal_closed_at: string | null
  deal_property_id: string | null
  assigned_to: string | null
  properties: { title: string } | null
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  venda: 'Venda',
  aluguel: 'Aluguel',
}

export function Negocios() {
  const { profile } = useProfile()
  const [leads, setLeads] = useState<DealLead[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'negociacao' | 'fechados'>('negociacao')

  const orgId = profile?.organization_id

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    supabase
      .from('leads')
      .select('id, name, phone, status, deal_value, deal_type, deal_closed_at, deal_property_id, assigned_to')
      .eq('organization_id', orgId)
      .not('deal_value', 'is', null)
      .order('deal_closed_at', { ascending: false, nullsFirst: false })
      .then(async ({ data: rawLeads }) => {
        const leadsData = (rawLeads ?? []) as Omit<DealLead, 'properties'>[]
        const propIds = [...new Set(leadsData.map((l) => l.deal_property_id).filter(Boolean))] as string[]
        let propMap: Record<string, string> = {}
        if (propIds.length > 0) {
          const { data: props } = await supabase.from('properties').select('id, title').in('id', propIds)
          propMap = Object.fromEntries((props ?? []).map((p) => [p.id, p.title]))
        }
        setLeads(
          leadsData.map((l) => ({
            ...l,
            properties: l.deal_property_id ? { title: propMap[l.deal_property_id] ?? '' } : null,
          })),
        )
        setLoading(false)
      })
  }, [orgId])

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const pipeline = leads.filter(
    (l) => l.deal_value != null && l.status !== 'convertido' && l.status !== 'descartado',
  )
  const pipelineTotal = pipeline.reduce((acc, l) => acc + (l.deal_value ?? 0), 0)

  const closedThisMonth = leads.filter((l) => {
    if (l.status !== 'convertido' || !l.deal_closed_at) return false
    const d = new Date(l.deal_closed_at)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const closedThisMonthTotal = closedThisMonth.reduce((acc, l) => acc + (l.deal_value ?? 0), 0)

  const inNegotiacao = leads.filter(
    (l) => l.status !== 'descartado' && l.status !== 'convertido',
  )
  const fechados = leads.filter((l) => l.status === 'convertido')

  const rows = tab === 'negociacao' ? inNegotiacao : fechados

  return (
    <div className="space-y-6">
      <PageHeader
        title="Negócios"
        description="Pipeline e histórico de negócios fechados"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 space-y-1">
          {loading ? (
            <>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32 mt-2" />
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pipeline total</p>
              <p className="text-2xl font-semibold tabular tracking-tight">{formatCurrency(pipelineTotal)}</p>
              <p className="text-xs text-muted-foreground">{inNegotiacao.length} negócio{inNegotiacao.length !== 1 ? 's' : ''} em aberto</p>
            </>
          )}
        </Card>

        <Card className="p-5 space-y-1">
          {loading ? (
            <>
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-7 w-32 mt-2" />
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fechados este mês</p>
              <p className="text-2xl font-semibold tabular tracking-tight">{formatCurrency(closedThisMonthTotal)}</p>
              <p className="text-xs text-muted-foreground">em receita convertida</p>
            </>
          )}
        </Card>

        <Card className="p-5 space-y-1">
          {loading ? (
            <>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-7 w-16 mt-2" />
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Negócios fechados este mês</p>
              <p className="text-2xl font-semibold tabular tracking-tight">{closedThisMonth.length}</p>
              <p className="text-xs text-muted-foreground">negócio{closedThisMonth.length !== 1 ? 's' : ''} convertido{closedThisMonth.length !== 1 ? 's' : ''}</p>
            </>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab('negociacao')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'negociacao'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Em negociação
            <span className="ml-1.5 text-xs text-muted-foreground">({inNegotiacao.length})</span>
          </button>
          <button
            onClick={() => setTab('fechados')}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === 'fechados'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Fechados
            <span className="ml-1.5 text-xs text-muted-foreground">({fechados.length})</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-subtle/40">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome / Telefone</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Imóvel</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data fechamento</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} cols={6} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Nenhum negócio encontrado nesta aba.
                  </td>
                </tr>
              ) : (
                rows.map((lead) => (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-subtle/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground truncate max-w-[160px]">{lead.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {lead.deal_type ? (DEAL_TYPE_LABELS[lead.deal_type] ?? lead.deal_type) : '—'}
                    </td>
                    <td className="px-5 py-3 font-medium tabular">
                      {formatCurrency(lead.deal_value)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={STATUS_LEAD_VARIANTS[lead.status] ?? 'neutral'} dot>
                        {STATUS_LEAD_LABELS[lead.status] ?? lead.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground truncate max-w-[160px]">
                      {lead.properties?.title ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {lead.deal_closed_at ? formatDate(lead.deal_closed_at) : (
                        <span className="text-xs italic">Em andamento</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
