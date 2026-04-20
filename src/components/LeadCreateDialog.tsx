import { useEffect, useState } from 'react'
import { X, UserPlus, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { Button } from './ui/Button'
import { Field, Input, Select } from './ui/Input'
import { useToast } from './ui/Toast'
import { PROPERTY_TYPES, STATUS_LEAD_LABELS } from '../lib/utils'

const STATUS_OPTIONS = ['novo', 'em_contato', 'agendado', 'descartado', 'convertido']

type Props = {
  onClose: () => void
  onCreated?: () => void
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function LeadCreateDialog({ onClose, onCreated }: Props) {
  const { profile } = useProfile()
  const toast = useToast()
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    property_type: '',
    location_interest: '',
    bedrooms_needed: '',
    budget_max: '',
    status: 'novo',
    profile_notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [phoneExists, setPhoneExists] = useState<{ name: string | null } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length < 8) {
      setPhoneExists(null)
      return
    }
    const orgId = profile?.organization_id
    if (!orgId) return

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('leads')
        .select('name')
        .eq('organization_id', orgId)
        .eq('phone', digits.trim())
        .maybeSingle()
      if (data) {
        setPhoneExists({ name: (data as { name: string | null }).name })
      } else {
        setPhoneExists(null)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [form.phone, profile?.organization_id])

  async function handleSave() {
    const phoneDigits = form.phone.replace(/\D/g, '')
    if (!phoneDigits || phoneDigits.length < 10) {
      toast.error('Telefone inválido', 'Informe DDD + número (mín. 10 dígitos)')
      return
    }
    if (!profile?.organization_id) {
      toast.error('Sem organização', 'Recarregue a página e tente novamente')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('leads').insert({
      organization_id: profile.organization_id,
      phone: phoneDigits,
      name: form.name.trim() || null,
      email: form.email.trim() || null,
      property_type: form.property_type || null,
      location_interest: form.location_interest.trim() || null,
      bedrooms_needed: form.bedrooms_needed ? Number(form.bedrooms_needed) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
      status: form.status,
      profile_notes: form.profile_notes.trim() || null,
      source: 'manual',
      last_message_at: new Date().toISOString(),
    } as any)
    setSaving(false)
    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        toast.error('Lead já existe', 'Já existe um lead com esse telefone nessa organização')
      } else {
        toast.error('Erro ao criar lead', error.message)
      }
      return
    }
    toast.success('Lead criado')
    onCreated?.()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-float animate-slide-in-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
              <UserPlus size={15} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Novo lead</h2>
              <p className="text-xs text-muted-foreground">Cadastre manualmente um lead no funil</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X size={15} />
          </Button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Mariana Silva"
                autoFocus
              />
            </Field>
            <Field label="Telefone *" hint="Com DDD">
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
                placeholder="(11) 91234-5678"
                inputMode="numeric"
              />
              {phoneExists !== null && (
                <p className="text-[11px] text-warning flex items-center gap-1 mt-1">
                  <AlertTriangle size={10} />
                  Já existe um lead com esse telefone{phoneExists.name ? ': ' + phoneExists.name : ''}
                </p>
              )}
            </Field>
          </div>

          <Field label="Email" hint="Opcional — para convite no Google Calendar">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Ex: joao@email.com"
            />
          </Field>

          <Field label="Status inicial">
            <Select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LEAD_LABELS[s]}</option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de interesse">
              <Select
                value={form.property_type}
                onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))}
              >
                <option value="">Qualquer</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Quartos">
              <Input
                type="number"
                min={0}
                value={form.bedrooms_needed}
                onChange={(e) => setForm((f) => ({ ...f, bedrooms_needed: e.target.value }))}
                placeholder="Ex: 2"
              />
            </Field>
          </div>

          <Field label="Localização de interesse">
            <Input
              value={form.location_interest}
              onChange={(e) => setForm((f) => ({ ...f, location_interest: e.target.value }))}
              placeholder="Ex: Moema, Pinheiros"
            />
          </Field>

          <Field label="Orçamento máximo (R$)">
            <Input
              type="number"
              min={0}
              step={1000}
              value={form.budget_max}
              onChange={(e) => setForm((f) => ({ ...f, budget_max: e.target.value }))}
              placeholder="Ex: 1500000"
            />
          </Field>

          <Field label="Observações">
            <Input
              value={form.profile_notes}
              onChange={(e) => setForm((f) => ({ ...f, profile_notes: e.target.value }))}
              placeholder="Ex: conhece o edifício, visita em família"
            />
          </Field>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 bg-subtle/30 rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!form.phone.trim()}>
            Criar lead
          </Button>
        </div>
      </div>
    </div>
  )
}
