import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { BotConfig } from '../types/database'
import { useProfile } from '../hooks/useProfile'
import { useWhatsapp } from '../hooks/useWhatsapp'
import { useBotMetrics } from '../hooks/useBotMetrics'
import { useWhatsappGroup } from '../hooks/useWhatsappGroup'
import {
  MessageSquare, Save, Zap, Clock, Smartphone, QrCode, CheckCircle, AlertCircle,
  Info, RefreshCw, LogOut, Wifi, WifiOff, Loader2, Bell, ArrowRight,
  Users, Calendar, TrendingUp, DollarSign, UserCheck, Activity,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input, Textarea } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { Skeleton } from '../components/ui/Skeleton'
import { cn } from '../lib/utils'

type Tab = 'conexao' | 'persona' | 'horarios'

const TABS: { id: Tab; label: string; icon: typeof Zap }[] = [
  { id: 'conexao', label: 'Conexão', icon: Zap },
  { id: 'persona', label: 'Persona do bot', icon: MessageSquare },
  { id: 'horarios', label: 'Horários', icon: Clock },
]

const STYLE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'casual', label: 'Casual', desc: 'Descontraído, gírias leves, emojis com naturalidade' },
  { value: 'balanced', label: 'Equilibrado', desc: 'Amigável mas profissional — padrão recomendado' },
  { value: 'formal', label: 'Formal', desc: 'Profissional, respeitoso, sem gírias' },
]

function SubSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </Card>
  )
}

function Callout({ variant, icon: Icon, children }: { variant: 'info' | 'warning' | 'success'; icon: typeof Info; children: React.ReactNode }) {
  const styles = {
    info: 'bg-info-soft text-info border-info/20',
    warning: 'bg-warning-soft text-warning border-warning/20',
    success: 'bg-success-soft text-success border-success/20',
  }
  return (
    <div className={cn('flex items-start gap-2 text-xs rounded-lg p-3 border', styles[variant])}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <p className="leading-relaxed">{children}</p>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 border-t first:border-t-0 border-border">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1',
        checked ? 'bg-primary' : 'bg-border-strong',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

const DEFAULT_CONFIG: Partial<BotConfig> = {
  is_active: false,
  persona: '',
  welcome_message: '',
  triagem_localizacao: '',
  triagem_tipo: '',
  triagem_orcamento: '',
  triagem_quartos: '',
  mensagem_agendamento: '',
  no_properties_message: '',
  farewell_message: '',
  outside_hours_message: 'Nosso atendimento funciona das {inicio} às {fim}. Retornaremos em breve!',
  max_properties_shown: 3,
  business_hours_enabled: false,
  business_hours_start: '08:00',
  business_hours_end: '18:00',
  can_schedule: true,
  can_escalate: true,
  can_negotiate_price: false,
  show_listing_links: true,
  communication_style: 'balanced',
  company_differentials: '',
  service_areas: '',
  auto_assign: false,
}

export function BotConfig() {
  const toast = useToast()
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const canEdit = profile?.role === 'admin' || profile?.role === 'manager'
  const [config, setConfig] = useState<BotConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('conexao')

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }
    supabase
      .from('bot_config')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        setConfig(data ?? ({ ...DEFAULT_CONFIG, organization_id: orgId } as BotConfig))
        setLoading(false)
      })
  }, [orgId])

  async function handleSave(patch: Partial<BotConfig> = {}) {
    if (!config || !orgId) return
    setSaving(true)
    setError(null)
    // Merge current state with override patch (evita stale closure em saves disparados logo após setState)
    const c = { ...config, ...patch }
    const payload = {
      organization_id: orgId,
      is_active: c.is_active ?? false,
      persona: c.persona ?? '',
      welcome_message: c.welcome_message ?? '',
      triagem_localizacao: c.triagem_localizacao ?? '',
      triagem_tipo: c.triagem_tipo ?? '',
      triagem_orcamento: c.triagem_orcamento ?? '',
      triagem_quartos: c.triagem_quartos ?? '',
      mensagem_agendamento: c.mensagem_agendamento ?? '',
      farewell_message: c.farewell_message ?? '',
      no_properties_message: c.no_properties_message ?? '',
      outside_hours_message: c.outside_hours_message ?? DEFAULT_CONFIG.outside_hours_message!,
      max_properties_shown: c.max_properties_shown ?? 3,
      business_hours_enabled: c.business_hours_enabled ?? false,
      business_hours_start: c.business_hours_start ?? '08:00',
      business_hours_end: c.business_hours_end ?? '18:00',
      can_schedule: c.can_schedule ?? true,
      can_escalate: c.can_escalate ?? true,
      can_negotiate_price: c.can_negotiate_price ?? false,
      show_listing_links: c.show_listing_links ?? true,
      communication_style: c.communication_style ?? 'balanced',
      company_differentials: c.company_differentials ?? '',
      service_areas: c.service_areas ?? '',
      auto_assign: c.auto_assign ?? false,
    }
    const { data, error } = await supabase
      .from('bot_config')
      .upsert(payload, { onConflict: 'organization_id' })
      .select()
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      toast.error('Erro ao salvar config. do bot', error.message)
      return
    }
    setConfig(data)
    setSaved(true)
    toast.success('Configuração do bot salva')
    setTimeout(() => setSaved(false), 2500)
  }

  function update(field: Partial<BotConfig>) {
    setConfig((c) => c ? { ...c, ...field } : c)
  }

  if (loading) return <Card className="p-12 text-center text-sm text-muted-foreground">Carregando...</Card>
  if (!orgId) return <Card className="p-12 text-center text-sm text-muted-foreground">Configure a empresa primeiro em Configurações → Empresa.</Card>
  if (!config) return null

  const inputClass = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 bg-background text-foreground'
  const textareaClass = `${inputClass} resize-none`

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Configuração do bot"
        description="Conexão WhatsApp, comportamento e horários de atendimento"
        actions={
          <>
            <Badge variant={config.is_active ? 'success' : 'neutral'} dot>
              {config.is_active ? 'Bot ativo' : 'Bot inativo'}
            </Badge>
            {canEdit && activeTab !== 'conexao' && (
              <Button
                leftIcon={saved ? <CheckCircle size={14} /> : <Save size={14} />}
                onClick={() => handleSave()}
                loading={saving}
              >
                {saved ? 'Salvo' : 'Salvar'}
              </Button>
            )}
          </>
        }
      />

      {!canEdit && (
        <div className="flex items-start gap-2 text-xs text-info bg-info-soft border border-info/20 rounded-lg p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            <span className="font-medium">Modo somente leitura.</span>{' '}
            Apenas administradores podem alterar a configuração do bot.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 bg-subtle rounded-lg p-0.5 w-fit border border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ---------- CONEXÃO ---------- */}
      {activeTab === 'conexao' && <ConexaoTab canEdit={canEdit} />}

      {/* ---------- FLUXO / HORÁRIOS ---------- */}
      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
        {activeTab === 'persona' && (
          <div className="space-y-4">
            <Callout variant="info" icon={Info}>
              Configure o comportamento do bot abaixo. Não precisa escrever prompt — ative/desative capacidades e descreva sua imobiliária.
            </Callout>

            <SubSection title="Capacidades do bot" description="O que o bot pode fazer sozinho sem precisar chamar um corretor">
              <ToggleRow
                label="Agendar visitas automaticamente"
                description={config.can_schedule
                  ? 'Quando o lead confirmar data e hora, o bot cria o agendamento direto no sistema.'
                  : 'O bot só vai coletar a preferência de data/hora. Um corretor confirma depois.'}
                checked={config.can_schedule}
                onChange={(v) => update({ can_schedule: v })}
              />
              <ToggleRow
                label="Encaminhar para corretor humano quando necessário"
                description={config.can_escalate
                  ? 'O bot transfere pro time humano em negociações complexas, contrapropostas, reclamações ou a pedido.'
                  : 'Bot tenta resolver sozinho. Se não conseguir, avisa que o time retornará em horário comercial.'}
                checked={config.can_escalate}
                onChange={(v) => update({ can_escalate: v })}
              />
              <ToggleRow
                label="Discutir valores e negociar preços"
                description={config.can_negotiate_price
                  ? 'O bot pode propor descontos e receber contrapropostas (limitadas ao cadastro).'
                  : 'Se o lead pedir desconto, o bot diz que a equipe vai avaliar a proposta.'}
                checked={config.can_negotiate_price}
                onChange={(v) => update({ can_negotiate_price: v })}
              />
              <ToggleRow
                label="Incluir link do anúncio nas respostas"
                description={config.show_listing_links
                  ? 'Quando o imóvel tiver URL cadastrada, o bot envia o link junto da descrição.'
                  : 'O bot só descreve o imóvel em texto, sem URLs.'}
                checked={config.show_listing_links}
                onChange={(v) => update({ show_listing_links: v })}
              />
              <ToggleRow
                label="Distribuição automática de leads (round-robin)"
                description={config.auto_assign
                  ? 'Cada lead novo que entrar via WhatsApp será atribuído automaticamente ao próximo corretor da fila (rodízio).'
                  : 'Leads entram sem corretor atribuído. Distribua manualmente pela view de leads.'}
                checked={config.auto_assign ?? false}
                onChange={(v) => update({ auto_assign: v })}
              />
            </SubSection>

            <SubSection title="Estilo de comunicação" description="Tom que o bot usa com os leads">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {STYLE_OPTIONS.map((opt) => {
                  const active = config.communication_style === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ communication_style: opt.value })}
                      disabled={!canEdit}
                      className={cn(
                        'text-left p-3 rounded-lg border-2 transition-colors disabled:opacity-60',
                        active
                          ? 'border-primary bg-primary-soft/40'
                          : 'border-border hover:border-border-strong bg-background',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {active && <CheckCircle size={13} className="text-primary" />}
                        <p className="text-sm font-medium">{opt.label}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </SubSection>

            <SubSection title="Sobre sua imobiliária" description="Ajuda o bot a responder com autenticidade">
              <Field label="Diferenciais" hint="O que diferencia sua imobiliária? (opcional)">
                <Textarea
                  rows={3}
                  value={config.company_differentials ?? ''}
                  onChange={(e) => update({ company_differentials: e.target.value })}
                  placeholder="Ex: 30 anos de mercado, especialistas em imóveis de luxo, atendimento personalizado..."
                  className={textareaClass}
                />
              </Field>
              <Field label="Regiões / bairros de atuação" hint="Onde vocês operam principalmente (opcional)">
                <Textarea
                  rows={2}
                  value={config.service_areas ?? ''}
                  onChange={(e) => update({ service_areas: e.target.value })}
                  placeholder="Ex: Zona Sul de SP — Moema, Itaim, Vila Olímpia, Brooklin"
                  className={textareaClass}
                />
              </Field>
            </SubSection>

            <SubSection title="Limites de resposta">
              <Field label="Máximo de imóveis por resposta" hint="Quantos imóveis o bot apresenta de uma vez">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.max_properties_shown}
                  onChange={(e) => update({ max_properties_shown: parseInt(e.target.value) || 3 })}
                  className="w-24"
                />
              </Field>
            </SubSection>

            <details className="bg-card border border-border rounded-xl">
              <summary className="px-5 py-4 cursor-pointer text-sm font-medium flex items-center gap-2 select-none">
                <MessageSquare size={14} />
                Instruções avançadas (opcional)
              </summary>
              <div className="px-5 pb-5 space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Para usuários avançados: adicione instruções extras em Markdown que vão no final do prompt do bot.
                  A maioria das imobiliárias não precisa mexer aqui.
                </p>
                <Textarea
                  rows={8}
                  value={config.persona ?? ''}
                  onChange={(e) => update({ persona: e.target.value })}
                  placeholder="Instruções adicionais em markdown..."
                  className={`${textareaClass} font-mono text-xs`}
                />
              </div>
            </details>
          </div>
        )}

        {activeTab === 'horarios' && (
          <div className="space-y-4">
            <SubSection title="Controle de horário">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Restringir horário de atendimento</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Fora do horário, o bot responde com a mensagem configurada abaixo.</p>
                </div>
                <Toggle checked={config.business_hours_enabled} onChange={(v) => update({ business_hours_enabled: v })} />
              </div>

              {config.business_hours_enabled && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div className="flex gap-3">
                    <Field label="Abertura">
                      <Input type="time" value={config.business_hours_start} onChange={(e) => update({ business_hours_start: e.target.value })} className="w-36" />
                    </Field>
                    <Field label="Fechamento">
                      <Input type="time" value={config.business_hours_end} onChange={(e) => update({ business_hours_end: e.target.value })} className="w-36" />
                    </Field>
                  </div>
                  <Field label="Mensagem fora do horário" hint="Use {inicio} e {fim} para inserir os horários automaticamente">
                    <Textarea
                      rows={3}
                      value={config.outside_hours_message}
                      onChange={(e) => update({ outside_hours_message: e.target.value })}
                      className={textareaClass}
                    />
                  </Field>
                  <div className="text-xs text-muted-foreground bg-subtle rounded-lg p-3 border border-border">
                    <strong className="text-foreground font-medium">Preview:</strong>{' '}
                    {config.outside_hours_message
                      .replace('{inicio}', config.business_hours_start)
                      .replace('{fim}', config.business_hours_end)}
                  </div>
                </div>
              )}
            </SubSection>
          </div>
        )}
      </fieldset>

      {/* Ativação do bot — visível em qualquer aba */}
      <BotActivationSection
        config={config}
        canEdit={canEdit}
        onToggle={(v) => {
          update({ is_active: v })
          if (canEdit) handleSave({ is_active: v })
        }}
      />

      {/* Métricas do bot (últimos 7 dias) — visível em qualquer aba */}
      <BotMetricsCard />
    </div>
  )
}

// =====================================================================
// Métricas + gráfico temporal
// =====================================================================
function BotMetricsCard() {
  const [days, setDays] = useState(14)
  const { metrics, loading } = useBotMetrics(days)

  if (loading || !metrics) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
        <Skeleton className="h-40 mt-4" />
      </Card>
    )
  }

  const cards = [
    { label: 'Novos leads', value: metrics.leadsCaptured, icon: Users, tint: 'text-primary' },
    { label: 'Msgs recebidas', value: metrics.messagesIn, icon: MessageSquare, tint: 'text-info' },
    { label: 'Agendamentos', value: metrics.appointmentsCreated, icon: Calendar, tint: 'text-warning' },
    { label: 'Escalações', value: metrics.escalationsCount, icon: UserCheck, tint: 'text-muted-foreground' },
    {
      label: 'Custo AI',
      value: metrics.estimatedCostBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      icon: DollarSign,
      tint: 'text-success',
      raw: true,
    },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-border">
        <div>
          <p className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
            <TrendingUp size={13} /> Atividade do bot
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Últimos {days} dias · {(metrics.tokensUsed / 1000).toFixed(1)}k tokens
          </p>
        </div>
        <div className="flex gap-0.5 bg-subtle rounded-md p-0.5 border border-border">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded transition-colors',
                days === d ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-border border-b border-border">
        {cards.map(({ label, value, icon: Icon, tint, raw }) => (
          <div key={label} className="p-4 first:pl-5 last:pr-5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
              <Icon size={11} className={tint} />
              {label}
            </div>
            <p className={`text-lg font-semibold tracking-tight tabular ${raw ? '' : 'text-foreground'}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="p-5">
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Activity size={11} /> Mensagens por dia
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={metrics.daily} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
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
              labelFormatter={(l) => `Dia ${l}`}
              formatter={(v, name) => [v as number, name === 'msgsIn' ? 'Recebidas' : 'Enviadas']}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v: string) => v === 'msgsIn' ? 'Recebidas' : 'Enviadas'}
            />
            <Area type="monotone" dataKey="msgsIn" stroke="hsl(var(--info))" strokeWidth={2} fill="url(#gradIn)" />
            <Area type="monotone" dataKey="msgsOut" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradOut)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function BotActivationSection({
  config,
  canEdit,
  onToggle,
}: {
  config: BotConfig
  canEdit: boolean
  onToggle: (v: boolean) => void
}) {
  const { instance } = useWhatsapp()
  const isConnected = instance?.status === 'connected'
  const isActive = config.is_active

  return (
    <Card className="overflow-hidden">
      <div className="p-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold tracking-tight">Responder mensagens automaticamente</p>
            <Badge variant={isActive ? 'success' : 'neutral'} dot>
              {isActive ? 'Ativo' : 'Pausado'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {isActive
              ? 'Quando um lead mandar mensagem, o bot vai responder usando o contexto da imobiliária.'
              : 'O bot não está respondendo mensagens. Leads que chegarem não recebem resposta automática.'}
          </p>
        </div>
        <fieldset disabled={!canEdit} className="disabled:opacity-60 shrink-0">
          <Toggle checked={isActive} onChange={onToggle} />
        </fieldset>
      </div>

      {isActive && !isConnected && (
        <div className="px-5 pb-5">
          <Callout variant="warning" icon={AlertCircle}>
            WhatsApp não está conectado. Conecte em <strong>Conexão</strong> antes de ativar o bot — senão nenhuma mensagem será processada.
          </Callout>
        </div>
      )}
    </Card>
  )
}

// =====================================================================
// Tab Conexão — QR code embedado + status live
// =====================================================================
function ConexaoTab({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useProfile()
  const { instance, qrcode, loading, actionLoading, error, connect, disconnect, reset, cancelQr, rotateWebhookSecret } = useWhatsapp()

  const status = instance?.status ?? 'disconnected'
  const connectedNumber = instance?.connected_number ?? null
  const adminPhoneSet = !!profile?.phone?.trim()
  const webhookSecretMissing = status === 'connected' && !(instance as unknown as { webhook_secret?: string | null })?.webhook_secret
  const [rotating, setRotating] = useState(false)

  async function handleRotateSecret() {
    setRotating(true)
    const res = await rotateWebhookSecret()
    setRotating(false)
    if (res.ok) toast.success('Segurança ativada', 'Seu webhook agora valida cada mensagem com secret único.')
    else toast.error('Falha ao ativar', res.error || 'Tente desconectar e reconectar.')
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: 'Desconectar WhatsApp?',
      description: 'O bot para de responder mensagens. Você pode reconectar escaneando o QR novamente.',
      confirmLabel: 'Desconectar',
      variant: 'destructive',
    })
    if (!ok) return
    await disconnect()
    toast.info('WhatsApp desconectado')
  }

  async function handleReset() {
    const ok = await confirm({
      title: 'Resetar conexão?',
      description: 'A instância será removida completamente. Você precisará escanear um novo QR do zero.',
      confirmLabel: 'Resetar',
      variant: 'destructive',
    })
    if (!ok) return
    await reset()
    toast.info('Instância resetada')
  }

  if (loading) {
    return <Card className="p-10"><Skeleton className="h-40" /></Card>
  }

  // --- Enforcement: admin precisa ter telefone cadastrado antes de conectar ---
  if (canEdit && !adminPhoneSet && status !== 'connected') {
    return (
      <SubSection title="Configure seu telefone primeiro">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-warning-soft text-warning flex items-center justify-center shrink-0">
            <Smartphone size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Número de WhatsApp obrigatório</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
              Antes de conectar o WhatsApp da imobiliária, você precisa cadastrar seu número pessoal em Configurações → Perfil.
              Ele é usado pra te adicionar automaticamente ao grupo de alertas como administrador.
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              O grupo recebe notificações em tempo real sobre: novos leads, visitas agendadas, pedidos de atendente humano e desconexões do bot.
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <Link to="/settings">
            <Button leftIcon={<ArrowRight size={14} />} variant="primary">
              Ir pra Configurações → Perfil
            </Button>
          </Link>
        </div>
      </SubSection>
    )
  }

  // --- Estado: mostrando QR code ---
  if (qrcode) {
    return <QrCodeSection qrcode={qrcode} onCancel={cancelQr} onRefresh={connect} />
  }

  // --- Estado: conectado ---
  if (status === 'connected') {
    return (
      <div className="space-y-4">
        {webhookSecretMissing && canEdit && (
          <Callout variant="warning" icon={AlertCircle}>
            <div className="space-y-2">
              <p className="font-medium text-sm">Ative a validação de segurança do webhook</p>
              <p className="text-xs leading-relaxed">
                Sua conexão foi feita antes do rollout de webhook secret. Isso permite, em teoria, que mensagens forjadas sejam aceitas. Clique pra gerar um secret único e reconfigurar o webhook na Evolution API — sem desconectar o WhatsApp.
              </p>
              <Button size="sm" onClick={handleRotateSecret} loading={rotating} variant="primary">
                Ativar segurança
              </Button>
            </div>
          </Callout>
        )}

        <SubSection title="WhatsApp conectado">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-success-soft text-success flex items-center justify-center">
              <Wifi size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {connectedNumber
                  ? formatPhone(connectedNumber)
                  : 'Número desconhecido'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conectado desde {instance?.last_connection_at ? new Date(instance.last_connection_at).toLocaleString('pt-BR') : '—'}
              </p>
            </div>
          </div>

          {error && (
            <Callout variant="warning" icon={AlertCircle}>{error}</Callout>
          )}

          <fieldset disabled={!canEdit} className="disabled:opacity-60 flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" leftIcon={<LogOut size={13} />} onClick={handleDisconnect} loading={actionLoading === 'disconnect'}>
              Desconectar
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={13} />} onClick={handleReset} loading={actionLoading === 'reset'}>
              Resetar instância
            </Button>
          </fieldset>
        </SubSection>

        {canEdit && <AlertsGroupSection />}
      </div>
    )
  }

  // --- Estado: desconectado (inicial) ---
  return (
    <div className="space-y-4">
      <SubSection title="Conecte seu WhatsApp">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
            <WifiOff size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Não conectado</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em conectar para gerar um QR code e vincular seu WhatsApp.
            </p>
          </div>
        </div>

        <Callout variant="info" icon={Info}>
          Use um <strong>número dedicado</strong> da imobiliária. Se usar um pessoal, o WhatsApp vai se desconectar do seu celular enquanto o bot estiver ativo.
        </Callout>

        {error && (
          <Callout variant="warning" icon={AlertCircle}>{error}</Callout>
        )}

        <fieldset disabled={!canEdit} className="disabled:opacity-60">
          <Button
            leftIcon={<QrCode size={14} />}
            onClick={connect}
            loading={actionLoading === 'connect'}
          >
            Conectar WhatsApp
          </Button>
        </fieldset>
      </SubSection>

      <SubSection title="Como funciona">
        <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
          <li className="flex gap-2"><Smartphone size={12} className="mt-0.5 shrink-0" /> Você escaneia o QR code com o WhatsApp da imobiliária.</li>
          <li className="flex gap-2"><MessageSquare size={12} className="mt-0.5 shrink-0" /> Quando um lead manda mensagem, o bot responde com IA usando os dados da sua imobiliária e imóveis cadastrados.</li>
          <li className="flex gap-2"><Wifi size={12} className="mt-0.5 shrink-0" /> A conexão fica ativa 24/7 — não precisa deixar o celular aberto.</li>
        </ul>
      </SubSection>
    </div>
  )
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 13) {
    // +55 11 99999-9999
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`
  }
  return raw
}

// =====================================================================
// Secao 'Grupo de alertas' (admin/manager) — visivel apenas quando WhatsApp conectado
// =====================================================================
function AlertsGroupSection() {
  const { profile } = useProfile()
  const { info, loading, busy, createGroup } = useWhatsappGroup()
  const toast = useToast()

  if (loading) return null
  const hasGroup = !!info?.group_jid
  const hasPhone = !!profile?.phone?.trim()

  async function handleCreate() {
    if (!hasPhone) {
      toast.error('Configure seu telefone primeiro', 'Vai em Configurações → Perfil pessoal e adiciona seu número de WhatsApp.')
      return
    }
    const res = await createGroup()
    if (res.ok) toast.success('Grupo criado', 'Alertas vão chegar no seu WhatsApp automaticamente.')
    else toast.error('Não foi possível criar o grupo', res.error || 'Erro desconhecido')
  }

  if (hasGroup) {
    return (
      <SubSection title="Grupo de alertas">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-success-soft text-success flex items-center justify-center">
            <Bell size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{info?.group_name || 'Grupo de alertas'}</p>
              <Badge variant="success" dot>ativo</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Criado em {info?.group_created_at ? new Date(info.group_created_at).toLocaleString('pt-BR') : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed max-w-lg">
              O bot envia notificações automáticas pra este grupo quando: lead novo entra em contato, visita é agendada/remarcada/cancelada, lead pede atendente humano, bot desconecta.
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Pra adicionar sua equipe: cada corretor entra pelo botão em <span className="font-medium text-foreground">Configurações → Perfil pessoal</span>, depois de cadastrar o telefone dele.
            </p>
          </div>
        </div>
      </SubSection>
    )
  }

  return (
    <SubSection title="Grupo de alertas (opcional)">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
          <Bell size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Criar grupo de notificações no WhatsApp</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed max-w-lg">
            Cria um grupo no WhatsApp com você como administrador. O bot manda lá: novos leads, visitas agendadas, pedidos de atendente humano e desconexões. Sua equipe pode entrar depois.
          </p>
        </div>
      </div>

      {!hasPhone && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-3 flex items-start gap-2.5">
          <AlertCircle size={14} className="text-warning mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-warning">Configure seu telefone antes</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Você precisa cadastrar seu número de WhatsApp no perfil pra ser adicionado ao grupo como admin.
            </p>
            <Link to="/settings" className="text-[11px] text-primary font-medium inline-flex items-center gap-1 mt-1.5 hover:underline">
              Ir pra Configurações → Perfil <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <Button
          leftIcon={<Bell size={14} />}
          onClick={handleCreate}
          loading={busy}
          disabled={!hasPhone}
        >
          Criar grupo de alertas
        </Button>
      </div>
    </SubSection>
  )
}


// =====================================================================
// QR Code Section com countdown (60s) + auto-refresh
// =====================================================================
function QrCodeSection({ qrcode, onCancel, onRefresh }: { qrcode: string; onCancel: () => void; onRefresh: () => Promise<void> | void }) {
  const QR_TTL = 60
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    // Reset countdown whenever QR image changes
    setSecondsLeft(QR_TTL)
  }, [qrcode])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [secondsLeft])

  const expired = secondsLeft === 0

  async function handleManualRefresh() {
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  return (
    <SubSection title="Escaneie para conectar" description="Abra o WhatsApp no celular e escaneie o QR code">
      <div className="flex flex-col items-center gap-4">
        <div className={cn('bg-white p-4 rounded-xl border transition-all', expired ? 'border-destructive/40 opacity-40' : 'border-border')}>
          <img src={qrcode} alt="QR Code WhatsApp" className="w-64 h-64" />
        </div>

        {expired ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-destructive font-medium">QR code expirou</p>
            <Button variant="primary" size="sm" leftIcon={<RefreshCw size={12} />} onClick={handleManualRefresh} loading={refreshing}>
              Gerar novo QR
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            <span>
              Aguardando... QR expira em <span className="font-medium text-foreground tabular">{secondsLeft}s</span>
            </span>
          </div>
        )}

        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside max-w-md">
          <li>Abra o WhatsApp no celular</li>
          <li>Toque em <span className="font-medium text-foreground">Configurações → Aparelhos conectados</span></li>
          <li>Toque em <span className="font-medium text-foreground">Conectar um aparelho</span> e aponte pra tela</li>
        </ol>
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </SubSection>
  )
}
