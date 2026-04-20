import { useEffect, useState } from 'react'
import { Calendar, LayoutList, MapPin, User, Plus, FileText, CalendarDays } from 'lucide-react'
import { useAppointments } from '../hooks/useAppointments'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import type { Lead, Property } from '../types/database'
import { STATUS_APPT_LABELS, STATUS_APPT_VARIANTS, formatDate, cn } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonCard } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import { CalendarView } from '../components/CalendarView'

const STATUS_OPTIONS = ['agendado', 'confirmado', 'cancelado', 'realizado']
const emptyForm = { lead_id: '', property_id: '', scheduled_at: '', notes: '' }

type ViewMode = 'list' | 'month' | 'week'

type OrgProfile = { id: string; name: string | null; email: string | null }

export function Agendamentos() {
  const { appointments, loading, updateStatus, createAppointment } = useAppointments()
  const { profile } = useProfile()
  const toast = useToast()

  const [view, setView] = useState<ViewMode>('list')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [orgProfiles, setOrgProfiles] = useState<OrgProfile[]>([])
  const [agentFilter, setAgentFilter] = useState<string>('all')

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager'
  const isCorretor = profile?.role === 'corretor'

  // Fetch leads and properties when form is open
  useEffect(() => {
    if (!showForm) return
    supabase.from('leads').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setLeads(data ?? []))
    supabase.from('properties').select('*').eq('available', true).order('created_at', { ascending: false })
      .then(({ data }) => setProperties(data ?? []))
  }, [showForm])

  // Fetch org members for agent filter (admin/manager only)
  useEffect(() => {
    if (!isAdmin || !profile?.organization_id) return
    supabase
      .from('profiles')
      .select('id, name, email')
      .eq('organization_id', profile.organization_id)
      .order('name')
      .then(({ data }) => setOrgProfiles((data as OrgProfile[]) ?? []))
  }, [isAdmin, profile?.organization_id])

  // Filter appointments
  const filteredAppointments = appointments.filter((a) => {
    // Corretores only see their own
    if (isCorretor && a.leads?.assigned_to !== profile?.id) return false
    // Admin: agent filter
    if (isAdmin && agentFilter !== 'all' && a.leads?.assigned_to !== agentFilter) return false
    return true
  })

  const upcoming = filteredAppointments.filter((a) => a.status !== 'cancelado' && a.status !== 'realizado')
  const past = filteredAppointments.filter((a) => a.status === 'cancelado' || a.status === 'realizado')

  function openFormForDate(dateTimeStr: string) {
    setForm((f) => ({ ...f, scheduled_at: dateTimeStr }))
    setShowForm(true)
    // Scroll to form
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

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

  const viewButtons: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'list', icon: <LayoutList size={14} />, label: 'Lista' },
    { mode: 'month', icon: <Calendar size={14} />, label: 'Mês' },
    { mode: 'week', icon: <CalendarDays size={14} />, label: 'Semana' },
  ]

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
            <Button key={s} variant="outline" size="sm" onClick={() => handleStatus(appt.id, s)}>
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
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-subtle">
              {viewButtons.map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                    view === mode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <Button leftIcon={<Plus size={14} />} onClick={() => setShowForm(!showForm)}>
              Novo agendamento
            </Button>
          </div>
        }
      />

      {/* Agent filter (admin/manager only) */}
      {isAdmin && orgProfiles.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Corretor:</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setAgentFilter('all')}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                agentFilter === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              Todos
            </button>
            {orgProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setAgentFilter(agentFilter === p.id ? 'all' : p.id)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                  agentFilter === p.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {p.name ?? p.email ?? p.id.slice(0, 8)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* New appointment form */}
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
      ) : view !== 'list' ? (
        <CalendarView
          appointments={filteredAppointments}
          view={view}
          onDateClick={openFormForDate}
        />
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
