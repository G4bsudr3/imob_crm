import { useEffect, useState } from 'react'
import { X, Save, MessageSquare, User, Calendar, Phone, Bot, BotOff, MapPin, Trophy, Send, ChevronUp, Home } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead, Conversation } from '../types/database'
import { formatDate, formatTime, cn, STATUS_APPT_LABELS, STATUS_APPT_VARIANTS, formatCurrency } from '../lib/utils'
import { Button } from './ui/Button'
import { Field, Input, Textarea } from './ui/Input'
import { Badge } from './ui/Badge'
import { Card } from './ui/Card'
import { useToast } from './ui/Toast'

const PAUSE_REASON_LABEL: Record<string, string> = {
  visita_agendada: 'visita agendada',
  escalado_humano: 'lead pediu atendente humano',
}

type CompatProp = {
  id: string; title: string; type: string
  price: number|null; rent_price: number|null; bedrooms: number|null
  location: string|null; neighborhood: string|null; city: string|null
  score: number; scoreLabel: string; scoreColor: string
}

function scoreLeadPropMatch(
  lead: { property_type: string|null; budget_max: number|null; bedrooms_needed: number|null; location_interest: string|null },
  prop: { type: string|null; price: number|null; bedrooms: number|null; city: string|null; neighborhood: string|null }
): { score: number; label: string; color: string } {
  let score = 0
  if (!lead.property_type || lead.property_type === prop.type) score += 25
  const price = prop.price ?? 0
  if (!lead.budget_max || price === 0) score += 30
  else if (lead.budget_max >= price) score += 30
  else if (lead.budget_max >= price * 0.85) score += 20
  else if (lead.budget_max >= price * 0.70) score += 10
  const propBeds = prop.bedrooms ?? 0
  if (!lead.bedrooms_needed) score += 20
  else if (propBeds >= lead.bedrooms_needed) score += 20
  else if (propBeds === lead.bedrooms_needed - 1) score += 10
  if (!lead.location_interest) score += 25
  else {
    const interest = lead.location_interest.toLowerCase()
    if ((prop.city && interest.includes(prop.city.toLowerCase())) ||
        (prop.neighborhood && interest.includes(prop.neighborhood.toLowerCase()))) score += 25
  }
  const label = score >= 85 ? 'Excelente' : score >= 70 ? 'Ótimo' : score >= 50 ? 'Bom' : score >= 30 ? 'Regular' : 'Baixo'
  const color = score >= 70 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-muted-foreground'
  return { score, label, color }
}

type Props = {
  lead: Lead
  onClose: () => void
  onSaved: () => void
}

export function LeadDetail({ lead, onClose, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: lead.name ?? '',
    phone: lead.phone ?? '',
    location_interest: lead.location_interest ?? '',
    property_type: lead.property_type ?? '',
    bedrooms_needed: lead.bedrooms_needed?.toString() ?? '',
    budget_min: lead.budget_min?.toString() ?? '',
    budget_max: lead.budget_max?.toString() ?? '',
    profile_notes: lead.profile_notes ?? '',
  })
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConv, setLoadingConv] = useState(true)
  const [convOffset, setConvOffset] = useState(0)
  const [convTotal, setConvTotal] = useState<number | null>(null)
  const [loadingMoreConv, setLoadingMoreConv] = useState(false)
  const [leadAppointments, setLeadAppointments] = useState<Array<{ id: string; scheduled_at: string; status: string; notes: string | null; properties: { title: string; location: string } | null }>>([])
  const [loadingAppts, setLoadingAppts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [botPaused, setBotPaused] = useState(lead.bot_paused ?? false)
  const [togglingBot, setTogglingBot] = useState(false)
  const [manualMsg, setManualMsg] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [dealForm, setDealForm] = useState({
    deal_type: lead.deal_type ?? '',
    deal_value: lead.deal_value?.toString() ?? '',
    deal_closed_at: lead.deal_closed_at ?? new Date().toISOString().slice(0, 10),
    deal_property_id: lead.deal_property_id ?? '',
  })
  const [properties, setProperties] = useState<Array<{ id: string; title: string }>>([])
  const [savingDeal, setSavingDeal] = useState(false)
  const [compatProps, setCompatProps] = useState<CompatProp[]>([])
  const [loadingCompatProps, setLoadingCompatProps] = useState(false)
  const [compatOpen, setCompatOpen] = useState(true)

  // Sincroniza com updates do lead via realtime (pai reabre/rehidrata via useLeads).
  // Sem isso, se `lead.bot_paused` muda fora do Detail (ex: bot pausou automaticamente ao agendar),
  // o card ficaria com valor antigo.
  useEffect(() => { setBotPaused(lead.bot_paused ?? false) }, [lead.bot_paused])
  const pauseReasonLabel = lead.bot_paused_reason
    ? PAUSE_REASON_LABEL[lead.bot_paused_reason] ?? lead.bot_paused_reason
    : null

  useEffect(() => {
    supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: false })
      .range(0, 29)
      .then(({ data }) => {
        const batch = data ?? []
        setConversations([...batch].reverse())
        // If we got a full batch there may be more; flag with a sentinel so the
        // "load more" button appears without a separate count query on open.
        setConvTotal(batch.length === 30 ? Infinity : batch.length)
        setConvOffset(30)
        setLoadingConv(false)
      })
  }, [lead.id])

  async function handleLoadMoreConv() {
    setLoadingMoreConv(true)
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: false })
      .range(convOffset, convOffset + 29)
    const batch = data ?? []
    setConversations((prev) => [...[...batch].reverse(), ...prev])
    setConvOffset((o) => o + 30)
    if (batch.length < 30) {
      // We've now loaded everything; total is exactly what we have.
      setConvTotal(convOffset + batch.length)
    }
    setLoadingMoreConv(false)
  }

  useEffect(() => {
    supabase
      .from('appointments')
      .select('id, scheduled_at, status, notes, properties(title, location)')
      .eq('lead_id', lead.id)
      .order('scheduled_at', { ascending: false })
      .then(({ data }) => {
        setLeadAppointments((data as typeof leadAppointments) ?? [])
        setLoadingAppts(false)
      })
  }, [lead.id])

  useEffect(() => {
    if (lead.status !== 'convertido') return
    supabase
      .from('properties')
      .select('id, title')
      .eq('organization_id', lead.organization_id!)
      .order('title')
      .then(({ data }) => setProperties(data ?? []))
  }, [lead.status])

  async function handleToggleBot() {
    const next = !botPaused
    setTogglingBot(true)
    const patch = next
      ? { bot_paused: true, bot_paused_at: new Date().toISOString(), bot_paused_reason: 'manual' }
      : { bot_paused: false, bot_paused_at: null, bot_paused_reason: null }
    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id)
    setTogglingBot(false)
    if (error) {
      toast.error(next ? 'Erro ao pausar bot' : 'Erro ao reativar bot', error.message)
      return
    }
    setBotPaused(next)
    toast.success(next ? 'Bot pausado' : 'Bot reativado', next ? 'Lead agora sob atendimento humano.' : 'Bot volta a responder nas proximas mensagens.')
    onSaved()
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('leads').update({
      name: form.name || null,
      phone: form.phone,
      location_interest: form.location_interest || null,
      property_type: form.property_type || null,
      bedrooms_needed: form.bedrooms_needed ? parseInt(form.bedrooms_needed) : null,
      budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
      budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
      profile_notes: form.profile_notes || null,
    }).eq('id', lead.id)
    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar', error.message)
      return
    }
    setSaved(true)
    toast.success('Lead atualizado')
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  async function handleSendManual() {
    const text = manualMsg.trim()
    if (!text) return
    setSendingMsg(true)
    const { error } = await supabase.functions.invoke('evolution-proxy', {
      body: { action: 'sendText', phone: lead.phone, message: text },
    })
    setSendingMsg(false)
    if (error) {
      toast.error('Erro ao enviar', (error as Error).message)
      return
    }
    setConversations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), direction: 'out', message: text, sent_at: new Date().toISOString(), lead_id: lead.id } as Conversation,
    ])
    setManualMsg('')
    toast.success('Mensagem enviada')
  }

  async function handleSaveDeal() {
    setSavingDeal(true)
    const { error } = await supabase.from('leads').update({
      deal_type: dealForm.deal_type || null,
      deal_value: dealForm.deal_value ? parseFloat(dealForm.deal_value) : null,
      deal_closed_at: dealForm.deal_closed_at || null,
      deal_property_id: dealForm.deal_property_id || null,
    }).eq('id', lead.id)
    setSavingDeal(false)
    if (error) {
      toast.error('Erro ao salvar negócio', error.message)
      return
    }
    toast.success('Negócio salvo')
    onSaved()
  }

  useEffect(() => {
    if (!lead.organization_id) return
    const orgId = lead.organization_id
    const budget = form.budget_max ? parseFloat(form.budget_max) : null
    const beds = form.bedrooms_needed ? parseInt(form.bedrooms_needed) : null
    const timer = setTimeout(async () => {
      setLoadingCompatProps(true)
      const { data } = await supabase
        .from('properties')
        .select('id, title, type, price, rent_price, bedrooms, location, neighborhood, city')
        .eq('organization_id', orgId)
        .eq('listing_status', 'available')
        .limit(50)
      const scored = (data ?? []).map((p) => {
        const { score, label, color } = scoreLeadPropMatch(
          { property_type: form.property_type || null, budget_max: budget, bedrooms_needed: beds, location_interest: form.location_interest || null },
          { type: p.type, price: p.price, bedrooms: p.bedrooms, city: (p as any).city, neighborhood: p.neighborhood }
        )
        return { ...p, score, scoreLabel: label, scoreColor: color } as CompatProp
      }).sort((a, b) => b.score - a.score)
      const above50 = scored.filter((p) => p.score >= 50)
      setCompatProps(above50.length >= 3 ? above50.slice(0, 8) : scored.slice(0, 3))
      setLoadingCompatProps(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [form.property_type, form.budget_max, form.bedrooms_needed, form.location_interest, lead.organization_id])

  const initials = (form.name || form.phone).slice(0, 2).toUpperCase()
  const hasMoreConv = convTotal === Infinity || (convTotal !== null && convTotal > conversations.length)

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in">
      <div className="flex-1 bg-black/40 dark:bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full max-w-xl bg-canvas h-full overflow-y-auto shadow-float border-l border-border flex flex-col">
        {/* header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{form.name || 'Sem nome'}</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <Phone size={10} /> {form.phone}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="p-5 space-y-5">
          {/* bot status */}
          <Card
            className={cn(
              'overflow-hidden border',
              botPaused ? 'border-warning/40 bg-warning-soft' : 'border-border',
            )}
          >
            <div className="p-4 flex items-center gap-3">
              <div
                className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                  botPaused ? 'bg-warning/20 text-warning' : 'bg-success-soft text-success',
                )}
              >
                {botPaused ? <BotOff size={16} /> : <Bot size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold tracking-tight">
                  {botPaused ? 'Bot pausado (atendimento humano)' : 'Bot ativo'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {botPaused
                    ? pauseReasonLabel
                      ? `Motivo: ${pauseReasonLabel}. Voce responde pelo WhatsApp.`
                      : 'Voce responde pelo WhatsApp.'
                    : 'Bot responde automaticamente as mensagens do lead.'}
                </p>
              </div>
              <Button
                onClick={handleToggleBot}
                loading={togglingBot}
                size="sm"
                variant={botPaused ? 'primary' : 'ghost'}
                leftIcon={botPaused ? <Bot size={12} /> : <BotOff size={12} />}
              >
                {botPaused ? 'Reativar bot' : 'Pausar bot'}
              </Button>
            </div>
          </Card>

          {/* negócio fechado — só aparece quando convertido */}
          {lead.status === 'convertido' && (
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border flex items-center gap-2">
                <Trophy size={13} className="text-muted-foreground" />
                <p className="text-sm font-semibold tracking-tight">Negócio fechado</p>
              </div>
              <div className="p-5">
                {lead.deal_type ? (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Tipo:</span> {lead.deal_type === 'venda' ? 'Venda' : 'Aluguel'}</p>
                    {lead.deal_value != null && (
                      <p><span className="text-muted-foreground">Valor:</span> {formatCurrency(lead.deal_value)}</p>
                    )}
                    {lead.deal_closed_at && (
                      <p><span className="text-muted-foreground">Fechado em:</span> {formatDate(lead.deal_closed_at)}</p>
                    )}
                    {lead.deal_property_id && (
                      <p><span className="text-muted-foreground">Imóvel:</span> {properties.find((p) => p.id === lead.deal_property_id)?.title ?? lead.deal_property_id}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tipo de negócio">
                        <select
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={dealForm.deal_type}
                          onChange={(e) => setDealForm((f) => ({ ...f, deal_type: e.target.value }))}
                        >
                          <option value="">Tipo de negócio</option>
                          <option value="venda">Venda</option>
                          <option value="aluguel">Aluguel</option>
                        </select>
                      </Field>
                      <Field label="Valor (R$)">
                        <Input
                          type="number"
                          placeholder="Valor (R$)"
                          value={dealForm.deal_value}
                          onChange={(e) => setDealForm((f) => ({ ...f, deal_value: e.target.value }))}
                        />
                      </Field>
                      <Field label="Data de fechamento">
                        <Input
                          type="date"
                          value={dealForm.deal_closed_at}
                          onChange={(e) => setDealForm((f) => ({ ...f, deal_closed_at: e.target.value }))}
                        />
                      </Field>
                      <Field label="Imóvel (opcional)">
                        <select
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={dealForm.deal_property_id}
                          onChange={(e) => setDealForm((f) => ({ ...f, deal_property_id: e.target.value }))}
                        >
                          <option value="">Imóvel (opcional)</option>
                          {properties.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleSaveDeal}
                        loading={savingDeal}
                        disabled={!dealForm.deal_type}
                        leftIcon={<Save size={12} />}
                      >
                        Salvar negócio
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* agendamentos do lead */}
          {(loadingAppts || leadAppointments.length > 0) && (
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border flex items-center gap-2">
                <Calendar size={13} className="text-muted-foreground" />
                <p className="text-sm font-semibold tracking-tight">Visitas agendadas</p>
                <span className="text-[11px] text-muted-foreground ml-auto tabular">{leadAppointments.length}</span>
              </div>
              <div className="divide-y divide-border">
                {loadingAppts ? (
                  <p className="text-sm text-muted-foreground p-5">Carregando...</p>
                ) : (
                  leadAppointments.map((a) => (
                    <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-warning-soft text-warning flex items-center justify-center shrink-0 text-center mt-0.5">
                        <div>
                          <p className="text-[8px] leading-none font-semibold uppercase tracking-wider">{new Date(a.scheduled_at).toLocaleDateString('pt-BR', { month: 'short' })}</p>
                          <p className="text-xs leading-tight font-bold tabular">{new Date(a.scheduled_at).getDate()}</p>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{formatDate(a.scheduled_at)}</p>
                        {a.properties && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate mt-0.5">
                            <MapPin size={10} className="shrink-0" />
                            <span className="truncate">{a.properties.title}</span>
                          </p>
                        )}
                        {a.notes && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.notes}</p>}
                      </div>
                      <Badge variant={STATUS_APPT_VARIANTS[a.status] ?? 'neutral'} dot>
                        {STATUS_APPT_LABELS[a.status] ?? a.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* imóveis compatíveis */}
          <Card className="overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-subtle/50 transition-colors"
              onClick={() => setCompatOpen((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <Home size={14} className="text-muted-foreground" />
                <span>Imóveis compatíveis</span>
                {loadingCompatProps && <span className="text-xs text-muted-foreground font-normal">Buscando…</span>}
                {!loadingCompatProps && compatProps.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">({compatProps.length} encontrado{compatProps.length !== 1 ? 's' : ''})</span>
                )}
              </div>
              <ChevronUp size={14} className={cn('text-muted-foreground transition-transform', !compatOpen && 'rotate-180')} />
            </button>
            {compatOpen && (
              <div className="border-t border-border">
                {loadingCompatProps ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Buscando…</p>
                ) : compatProps.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Nenhum imóvel disponível compatível com o perfil deste lead.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {compatProps.map((p) => (
                      <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{[p.location, p.neighborhood].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="shrink-0 text-right space-y-0.5">
                          {p.price ? <p className="text-xs font-medium">{formatCurrency(p.price)}</p> : null}
                          {p.rent_price ? <p className="text-xs text-muted-foreground">{formatCurrency(p.rent_price)}/mês</p> : null}
                          {p.bedrooms ? <p className="text-[11px] text-muted-foreground">{p.bedrooms} qto{p.bedrooms !== 1 ? 's' : ''}</p> : null}
                          <p className={cn('text-[11px] font-semibold', p.scoreColor)}>{p.scoreLabel} · {p.score}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* dados do lead */}
          <Card className="overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-border flex items-center gap-2">
              <User size={13} className="text-muted-foreground" />
              <p className="text-sm font-semibold tracking-tight">Dados do lead</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome">
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Telefone *">
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </Field>
                <Field label="Tipo de imóvel">
                  <Input value={form.property_type} onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))} placeholder="apartamento, casa..." />
                </Field>
                <Field label="Quartos">
                  <Input type="number" value={form.bedrooms_needed} onChange={(e) => setForm((f) => ({ ...f, bedrooms_needed: e.target.value }))} />
                </Field>
                <Field label="Localização de interesse" className="col-span-2">
                  <Input value={form.location_interest} onChange={(e) => setForm((f) => ({ ...f, location_interest: e.target.value }))} />
                </Field>
                <Field label="Orçamento mín. (R$)">
                  <Input type="number" value={form.budget_min} onChange={(e) => setForm((f) => ({ ...f, budget_min: e.target.value }))} />
                </Field>
                <Field label="Orçamento máx. (R$)">
                  <Input type="number" value={form.budget_max} onChange={(e) => setForm((f) => ({ ...f, budget_max: e.target.value }))} />
                </Field>
                <Field label="Notas" className="col-span-2">
                  <Textarea rows={2} value={form.profile_notes} onChange={(e) => setForm((f) => ({ ...f, profile_notes: e.target.value }))} />
                </Field>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar size={10} /> Entrou em {formatDate(lead.created_at)}
                </span>
                <Button
                  onClick={handleSave}
                  loading={saving}
                  disabled={!form.phone}
                  size="sm"
                  leftIcon={<Save size={12} />}
                >
                  {saved ? 'Salvo' : 'Salvar'}
                </Button>
              </div>
            </div>
          </Card>

          {/* conversations */}
          <Card className="overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-border flex items-center gap-2">
              <MessageSquare size={13} className="text-muted-foreground" />
              <p className="text-sm font-semibold tracking-tight">Conversas</p>
              <span className="text-[11px] text-muted-foreground ml-auto tabular">{conversations.length} mensagem{conversations.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-5">
              {loadingConv ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma mensagem registrada ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {hasMoreConv && (
                    <div className="flex justify-center pb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={loadingMoreConv}
                        onClick={handleLoadMoreConv}
                        leftIcon={<ChevronUp size={12} />}
                      >
                        Carregar mensagens anteriores
                      </Button>
                    </div>
                  )}
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                        c.direction === 'in'
                          ? 'bg-subtle text-foreground rounded-tl-sm'
                          : 'bg-primary text-primary-foreground ml-auto rounded-tr-sm',
                      )}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{c.message}</p>
                      <p className={cn(
                        'text-[10px] mt-1 tabular',
                        c.direction === 'in' ? 'text-muted-foreground' : 'text-primary-foreground/70',
                      )}>
                        {formatTime(c.sent_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {botPaused && (
              <div className="px-5 pb-5">
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground shrink-0">Responder como humano</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="flex gap-2 items-end">
                  <Textarea
                    rows={2}
                    className="flex-1 resize-none"
                    placeholder="Digite uma mensagem..."
                    value={manualMsg}
                    onChange={(e) => setManualMsg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendManual()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleSendManual}
                    loading={sendingMsg}
                    disabled={!manualMsg.trim()}
                    leftIcon={<Send size={12} />}
                  >
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </aside>
    </div>
  )
}
