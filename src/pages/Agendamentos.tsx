import { useEffect, useState } from 'react'
import { Calendar, MapPin, User, Plus, FileText } from 'lucide-react'
import { useAppointments } from '../hooks/useAppointments'
import { supabase } from '../lib/supabase'
import type { Lead, Property } from '../types/database'
import { STATUS_APPT_LABELS, STATUS_APPT_VARIANTS, formatDate } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonCard } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'

const STATUS_OPTIONS = ['agendado', 'confirmado', 'cancelado', 'realizado']
const emptyForm = { lead_id: '', property_id: '', scheduled_at: '', notes: '' }

export function Agendamentos() {
  const { appointments, loading, updateStatus, createAppointment } = useAppointments()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Property[]>([])

  useEffect(() => {
    if (!showForm) return
    supabase.from('leads').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setLeads(data ?? []))
    supabase.from('properties').select('*').eq('available', true).order('created_at', { ascending: false })
      .then(({ data }) => setProperties(data ?? []))
  }, [showForm])

  const upcoming = appointments.filter((a) => a.status !== 'cancelado' && a.status !== 'realizado')
  const past = appointments.filter((a) => a.status === 'cancelado' || a.status === 'realizado')

  async function handleSave() {
    if (!form.lead_id || !form.scheduled_at) return
    setSaving(true)
    const error = await createAppointment({
      lead_id: form.lead_id,
      property_id: form.property_id || null,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) {
      toast.error('Erro ao agendar', error.message)
      return
    }
    toast.success('Visita agendada')
    setForm(emptyForm)
    setShowForm(false)
  }

  async function handleStatus(id: string, status: string) {
    const error = await updateStatus(id, status)
    if (error) toast.error('Erro ao atualizar status', error.message)
    else toast.success(`Status: ${STATUS_APPT_LABELS[status]}`)
  }

  function AppointmentCard({ appt }: { appt: typeof appointments[0] }) {
    return (
      <Card className="p-5 hover:border-border-strong transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
              <Calendar size={15} />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold tabular tracking-tight">{formatDate(appt.scheduled_at)}</p>
              <p className="text-sm text-foreground flex items-center gap-1.5 truncate">
                <User size={12} className="text-muted-foreground shrink-0" />
                <span className="truncate">{appt.leads?.name ?? 'Sem nome'}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground text-xs">{appt.leads?.phone ?? '—'}</span>
              </p>
              {appt.properties && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{appt.properties.title} — {appt.properties.location}</span>
                </p>
              )}
            </div>
          </div>
          <Badge variant={STATUS_APPT_VARIANTS[appt.status]} dot>
            {STATUS_APPT_LABELS[appt.status]}
          </Badge>
        </div>

        {appt.notes && (
          <div className="mt-3 pt-3 border-t border-border flex items-start gap-2">
            <FileText size={12} className="text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">{appt.notes}</p>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.filter((s) => s !== appt.status).map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => handleStatus(appt.id, s)}
            >
              {STATUS_APPT_LABELS[s]}
            </Button>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agendamentos"
        description={`${upcoming.length} visita${upcoming.length !== 1 ? 's' : ''} ativa${upcoming.length !== 1 ? 's' : ''}`}
        actions={
          <Button leftIcon={<Plus size={14} />} onClick={() => setShowForm(!showForm)}>
            Novo agendamento
          </Button>
        }
      />

      {showForm && (
        <Card className="overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <p className="text-sm font-semibold tracking-tight">Novo agendamento</p>
            <p className="text-xs text-muted-foreground mt-0.5">Registrar visita manualmente</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Lead *" className="sm:col-span-2">
                <Select value={form.lead_id} onChange={(e) => setForm((f) => ({ ...f, lead_id: e.target.value }))}>
                  <option value="">Selecione um lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {(l.name ?? 'Sem nome') + ' · ' + l.phone}
                    </option>
                  ))}
                </Select>
                {leads.length === 0 && (
                  <p className="text-[11px] text-warning mt-1">Nenhum lead cadastrado ainda.</p>
                )}
              </Field>
              <Field label="Imóvel" hint="Opcional">
                <Select value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}>
                  <option value="">Sem imóvel específico</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.title} — {p.location}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Data e hora *">
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                />
              </Field>
              <Field label="Observações" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Ex: cliente pediu para confirmar 1h antes"
                />
              </Field>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} loading={saving} disabled={!form.lead_id || !form.scheduled_at}>
                Agendar
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm) }}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Próximas visitas · {upcoming.length}
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Nenhuma visita agendada"
                description="Agendamentos criados aqui ou via bot aparecerão nesta lista."
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {upcoming.map((a) => <AppointmentCard key={a.id} appt={a} />)}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-3 pt-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Histórico · {past.length}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 opacity-70">
                {past.map((a) => <AppointmentCard key={a.id} appt={a} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
