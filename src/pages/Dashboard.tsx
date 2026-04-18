import {
  Users, Calendar, Home, TrendingUp, TrendingDown, ArrowRight, Plus, MapPin,
  type LucideIcon,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Link } from 'react-router-dom'
import { useDashboard } from '../hooks/useDashboard'
import { useProfile } from '../hooks/useProfile'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import {
  STATUS_LEAD_LABELS,
  STATUS_LEAD_VARIANTS,
  STATUS_APPT_LABELS,
  STATUS_APPT_VARIANTS,
  formatDateShort,
  formatTime,
  cn,
} from '../lib/utils'

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--destructive))',
  'hsl(var(--success))',
]

function greeting(name: string | null | undefined): string {
  const h = new Date().getHours()
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  if (!name) return g
  return `${g}, ${name.split(' ')[0]}`
}

export function Dashboard() {
  const { stats, loading } = useDashboard()
  const { profile } = useProfile()

  return (
    <div className="space-y-8">
      <PageHeader
        title={greeting(profile?.name)}
        description="Visão geral do funil e próximas ações"
        actions={
          <>
            <Link to="/agendamentos">
              <Button variant="outline" size="md" leftIcon={<Calendar size={14} />}>
                Agendar visita
              </Button>
            </Link>
            <Link to="/imoveis">
              <Button variant="primary" size="md" leftIcon={<Plus size={14} />}>
                Novo imóvel
              </Button>
            </Link>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total de leads"
          value={stats?.totalLeads ?? 0}
          icon={Users}
          tint="bg-primary-soft text-primary"
          loading={loading}
        />
        <KpiCard
          label="Leads (7 dias)"
          value={stats?.leadsNovosSemana ?? 0}
          icon={TrendingUp}
          tint="bg-info-soft text-info"
          loading={loading}
          trend={stats?.leadsTrend}
        />
        <KpiCard
          label="Visitas hoje"
          value={stats?.agendamentosHoje ?? 0}
          sublabel={stats?.agendamentosProximos7d != null ? `${stats.agendamentosProximos7d} nos próximos 7 dias` : undefined}
          icon={Calendar}
          tint="bg-warning-soft text-warning"
          loading={loading}
        />
        <KpiCard
          label="Imóveis disponíveis"
          value={stats?.imoveisDisponiveis ?? 0}
          icon={Home}
          tint="bg-success-soft text-success"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funil */}
        <Card className="lg:col-span-1 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <p className="text-sm font-semibold tracking-tight">Funil de leads</p>
            <p className="text-xs text-muted-foreground mt-0.5">Distribuição atual por status</p>
          </div>
          <div className="px-5 pb-5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-44 w-full rounded-xl" />
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-3" />)}
                </div>
              </div>
            ) : !stats || stats.leadsPorStatus.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Sem dados ainda</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={stats.leadsPorStatus}
                      dataKey="total"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {stats.leadsPorStatus.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        color: 'hsl(var(--foreground))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                        padding: '6px 10px',
                        boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.1)',
                      }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(v, name) => [v, STATUS_LEAD_LABELS[name as string] ?? name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {stats.leadsPorStatus.map((s, i) => (
                    <div key={s.status} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-muted-foreground">{STATUS_LEAD_LABELS[s.status] ?? s.status}</span>
                      </div>
                      <span className="font-medium tabular">{s.total}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Próximas visitas */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold tracking-tight">Próximas visitas</p>
              <p className="text-xs text-muted-foreground mt-0.5">Agendamentos ativos</p>
            </div>
            <Link to="/agendamentos" className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
          <div className="border-t border-border">
            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : !stats || stats.proximasVisitas.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Nenhuma visita agendada"
                description="Crie um agendamento manualmente ou deixe o bot capturar pelo WhatsApp."
                className="m-5 border-0 bg-transparent py-6"
              />
            ) : (
              <ul className="divide-y divide-border">
                {stats.proximasVisitas.map((a) => (
                  <li key={a.id} className="px-5 py-3 flex items-center gap-3 hover:bg-subtle/40 transition-colors">
                    <div className="h-9 w-9 rounded-lg bg-warning-soft text-warning flex items-center justify-center shrink-0 text-center">
                      <div>
                        <p className="text-[9px] leading-none font-semibold uppercase tracking-wider">{new Date(a.scheduled_at).toLocaleDateString('pt-BR', { month: 'short' })}</p>
                        <p className="text-sm leading-tight font-bold tabular">{new Date(a.scheduled_at).getDate()}</p>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.lead_name ?? a.lead_phone}</p>
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        {formatTime(a.scheduled_at)}
                        {a.property_title && (
                          <>
                            <span>·</span>
                            <MapPin size={10} />
                            <span className="truncate">{a.property_title}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <Badge variant={STATUS_APPT_VARIANTS[a.status] ?? 'neutral'} dot>
                      {STATUS_APPT_LABELS[a.status] ?? a.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Últimos leads */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight">Últimos leads</p>
            <p className="text-xs text-muted-foreground mt-0.5">Os 5 leads mais recentes</p>
          </div>
          <Link to="/leads" className="text-xs font-medium text-primary flex items-center gap-1 hover:underline">
            Ver todos <ArrowRight size={12} />
          </Link>
        </div>
        <div className="border-t border-border">
          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : !stats || stats.ultimosLeads.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum lead ainda"
              description="Leads entram automaticamente via bot WhatsApp."
              className="m-5 border-0 bg-transparent py-6"
            />
          ) : (
            <ul className="divide-y divide-border">
              {stats.ultimosLeads.map((lead) => (
                <li key={lead.id} className="px-5 py-3 flex items-center gap-3 hover:bg-subtle/40 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                    {(lead.name ?? lead.phone).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lead.name ?? 'Sem nome'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{lead.phone}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular shrink-0">{formatDateShort(lead.created_at)}</span>
                  <Badge variant={STATUS_LEAD_VARIANTS[lead.status] ?? 'neutral'} dot>
                    {STATUS_LEAD_LABELS[lead.status] ?? lead.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tint,
  loading,
  trend,
  sublabel,
}: {
  label: string
  value: number
  icon: LucideIcon
  tint: string
  loading: boolean
  trend?: number
  sublabel?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-16 mt-2" />
          ) : (
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-semibold tabular text-foreground tracking-tight">{value}</p>
              {trend != null && (
                <span
                  className={cn(
                    'text-[11px] font-medium flex items-center gap-0.5 tabular',
                    trend > 0 ? 'text-success' : trend < 0 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : null}
                  {trend > 0 ? '+' : ''}{trend}%
                </span>
              )}
            </div>
          )}
          {sublabel && !loading && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{sublabel}</p>
          )}
        </div>
        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ml-2', tint)}>
          <Icon size={16} />
        </div>
      </div>
    </Card>
  )
}
