import { useEffect, useState } from 'react'
import { X, Save, MessageSquare, User, Calendar, Phone, Bot, BotOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead, Conversation } from '../types/database'
import { formatDate, formatTime } from '../lib/utils'
import { Button } from './ui/Button'
import { Field, Input, Textarea } from './ui/Input'
import { Card } from './ui/Card'
import { useToast } from './ui/Toast'
import { cn } from '../lib/utils'

const PAUSE_REASON_LABEL: Record<string, string> = {
  visita_agendada: 'visita agendada',
  escalado_humano: 'lead pediu atendente humano',
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [botPaused, setBotPaused] = useState(lead.bot_paused ?? false)
  const [togglingBot, setTogglingBot] = useState(false)
  const pauseReasonLabel = lead.bot_paused_reason
    ? PAUSE_REASON_LABEL[lead.bot_paused_reason] ?? lead.bot_paused_reason
    : null

  useEffect(() => {
    supabase
      .from('conversations')
      .select('*')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: true })
      .then(({ data }) => {
        setConversations(data ?? [])
        setLoadingConv(false)
      })
  }, [lead.id])

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

  const initials = (form.name || form.phone).slice(0, 2).toUpperCase()

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
          </Card>
        </div>
      </aside>
    </div>
  )
}
