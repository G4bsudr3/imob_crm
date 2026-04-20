import { useState, useEffect, useRef } from 'react'
import {
  Plus, Trash2, Home, MapPin, BedDouble, Bath, Ruler, Pencil, X, Car, Layers,
  Calendar as CalendarIcon, Sparkles, Search, ExternalLink, ImagePlus, Star, Users, ChevronLeft, ChevronRight, ZoomIn,
} from 'lucide-react'
import { useProperties, type PropertyInput } from '../hooks/useProperties'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import {
  formatCurrency,
  PROPERTY_TYPES,
  LISTING_PURPOSE_LABELS,
  LISTING_STATUS_LABELS,
  LISTING_STATUS_VARIANTS,
  FURNISHED_LABELS,
  AMENITIES,
  cn,
} from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonCard } from '../components/ui/Skeleton'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { useToast } from '../components/ui/Toast'
import { maskCEP, UFS, fetchCep } from '../lib/masks'
import type { Property } from '../types/database'

type FormState = {
  title: string
  type: string
  listing_purpose: string
  listing_status: string
  ref_code: string
  featured: boolean

  price: string
  rent_price: string
  condo_fee: string
  iptu: string
  accepts_financing: boolean
  accepts_fgts: boolean
  accepts_exchange: boolean

  address_zip: string
  location: string
  address_number: string
  address_complement: string
  neighborhood: string
  city: string
  address_state: string

  area_m2: string
  total_area_m2: string
  bedrooms: string
  suites: string
  bathrooms: string
  parking_spots: string
  floor: string
  year_built: string

  furnished: string
  amenities: string[]

  description: string
  video_url: string
  virtual_tour_url: string
  listing_url: string

  internal_notes: string
}

type PhotoRow = {
  id: string
  url: string
  storage_path: string
  is_cover: boolean
  display_order: number
}

const emptyForm: FormState = {
  title: '', type: 'apartamento', listing_purpose: 'sale', listing_status: 'available',
  ref_code: '', featured: false,

  price: '', rent_price: '', condo_fee: '', iptu: '',
  accepts_financing: false, accepts_fgts: false, accepts_exchange: false,

  address_zip: '', location: '', address_number: '', address_complement: '',
  neighborhood: '', city: 'São Paulo', address_state: 'SP',

  area_m2: '', total_area_m2: '', bedrooms: '', suites: '', bathrooms: '',
  parking_spots: '', floor: '', year_built: '',

  furnished: '', amenities: [],

  description: '', video_url: '', virtual_tour_url: '', listing_url: '',

  internal_notes: '',
}

function propertyToForm(p: Property): FormState {
  return {
    title: p.title,
    type: p.type,
    listing_purpose: p.listing_purpose ?? 'sale',
    listing_status: p.listing_status ?? 'available',
    ref_code: p.ref_code ?? '',
    featured: p.featured ?? false,

    price: p.price?.toString() ?? '',
    rent_price: p.rent_price?.toString() ?? '',
    condo_fee: p.condo_fee?.toString() ?? '',
    iptu: p.iptu?.toString() ?? '',
    accepts_financing: p.accepts_financing ?? false,
    accepts_fgts: p.accepts_fgts ?? false,
    accepts_exchange: p.accepts_exchange ?? false,

    address_zip: p.address_zip ?? '',
    location: p.location,
    address_number: p.address_number ?? '',
    address_complement: p.address_complement ?? '',
    neighborhood: p.neighborhood ?? '',
    city: p.city ?? 'São Paulo',
    address_state: p.address_state ?? 'SP',

    area_m2: p.area_m2?.toString() ?? '',
    total_area_m2: p.total_area_m2?.toString() ?? '',
    bedrooms: p.bedrooms?.toString() ?? '',
    suites: p.suites?.toString() ?? '',
    bathrooms: p.bathrooms?.toString() ?? '',
    parking_spots: p.parking_spots?.toString() ?? '',
    floor: p.floor?.toString() ?? '',
    year_built: p.year_built?.toString() ?? '',

    furnished: p.furnished ?? '',
    amenities: p.amenities ?? [],

    description: p.description ?? '',
    video_url: p.video_url ?? '',
    virtual_tour_url: p.virtual_tour_url ?? '',
    listing_url: p.listing_url ?? '',

    internal_notes: p.internal_notes ?? '',
  }
}

function formToInput(form: FormState): PropertyInput {
  const num = (s: string): number | null => (s ? parseFloat(s) : null)
  const int = (s: string): number | null => (s ? parseInt(s, 10) : null)
  return {
    title: form.title,
    type: form.type,
    listing_purpose: form.listing_purpose,
    listing_status: form.listing_status,
    ref_code: form.ref_code || null,
    featured: form.featured,

    price: num(form.price),
    rent_price: num(form.rent_price),
    condo_fee: num(form.condo_fee),
    iptu: num(form.iptu),
    accepts_financing: form.accepts_financing,
    accepts_fgts: form.accepts_fgts,
    accepts_exchange: form.accepts_exchange,

    address_zip: form.address_zip || null,
    location: form.location,
    address_number: form.address_number || null,
    address_complement: form.address_complement || null,
    neighborhood: form.neighborhood || null,
    city: form.city,
    address_state: form.address_state || null,

    area_m2: num(form.area_m2),
    total_area_m2: num(form.total_area_m2),
    bedrooms: int(form.bedrooms),
    suites: int(form.suites),
    bathrooms: int(form.bathrooms),
    parking_spots: int(form.parking_spots),
    floor: int(form.floor),
    year_built: int(form.year_built),

    furnished: form.furnished || null,
    amenities: form.amenities,

    description: form.description || null,
    video_url: form.video_url || null,
    virtual_tour_url: form.virtual_tour_url || null,
    listing_url: form.listing_url || null,

    internal_notes: form.internal_notes || null,
  }
}

// ---------- Section wrapper ----------
function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="overflow-hidden scroll-mt-24">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </Card>
  )
}

type CompatLead = {
  id: string; name: string|null; phone: string; status: string
  budget_max: number|null; bedrooms_needed: number|null; location_interest: string|null
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

const PROPERTY_FORM_SECTIONS: { id: string; label: string }[] = [
  { id: 'sec-basico', label: 'Básico' },
  { id: 'sec-valores', label: 'Valores' },
  { id: 'sec-endereco', label: 'Endereço' },
  { id: 'sec-specs', label: 'Specs' },
  { id: 'sec-amenidades', label: 'Amenidades' },
  { id: 'sec-midia', label: 'Mídia' },
  { id: 'sec-fotos', label: 'Fotos' },
  { id: 'sec-notas', label: 'Notas' },
  { id: 'sec-compat', label: 'Leads compat.' },
]

function PropertyFormNav() {
  return (
    <div className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-2 bg-canvas/95 backdrop-blur">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
        {PROPERTY_FORM_SECTIONS.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-subtle/60 hover:bg-subtle text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            <span className="tabular text-[10px] text-muted-foreground">{i + 1}</span>
            {s.label}
          </a>
        ))}
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer text-sm group">
      <span
        className={cn(
          'h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0',
          checked
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-background border-border-strong group-hover:border-muted-foreground',
        )}
      >
        {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5.5L4 7.5L8 2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-foreground">{label}</span>
    </label>
  )
}

// =========================================================================

export function Imoveis() {
  const { properties, loading, loadingMore, hasMore, loadMore, createProperty, updateProperty, updateStatus, deleteProperty } = useProperties()
  const { profile } = useProfile()
  const confirm = useConfirm()
  const toast = useToast()
  const [mode, setMode] = useState<'idle' | 'create' | { edit: string }>('idle')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const [compatLeads, setCompatLeads] = useState<CompatLead[]>([])
  const [loadingCompatLeads, setLoadingCompatLeads] = useState(true)

  const isEditing = typeof mode === 'object'
  const editingId = isEditing ? mode.edit : null
  const isFormOpen = mode !== 'idle'
  const orgId = profile?.organization_id

  useEffect(() => {
    if (!editingId) {
      setPhotos([])
      return
    }
    supabase
      .from('property_photos')
      .select('*')
      .eq('property_id', editingId)
      .order('display_order')
      .then(({ data }) => setPhotos((data as PhotoRow[]) ?? []))
  }, [editingId])

  function startCreate() {
    setForm(emptyForm)
    setPhotos([])
    setError(null)
    setMode('create')
  }

  function startEdit(p: Property) {
    setForm(propertyToForm(p))
    setPhotos([])
    setError(null)
    setMode({ edit: p.id })
  }

  function cancel() {
    setForm(emptyForm)
    setPhotos([])
    setError(null)
    setMode('idle')
  }

  async function handleCepLookup(cep: string) {
    if (cep.replace(/\D/g, '').length !== 8) return
    setCepLoading(true)
    const result = await fetchCep(cep)
    setCepLoading(false)
    if (!result) return
    setForm((f) => ({
      ...f,
      location: result.street || f.location,
      neighborhood: result.neighborhood || f.neighborhood,
      city: result.city || f.city,
      address_state: result.state || f.address_state,
    }))
  }

  function toggleAmenity(key: string) {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(key)
        ? f.amenities.filter((a) => a !== key)
        : [...f.amenities, key],
    }))
  }

  async function handleSave() {
    if (!form.title || !form.location) return
    setSaving(true)
    setError(null)
    const input = formToInput(form)
    let err: any
    let newPropertyId: string | undefined
    if (editingId) {
      err = await updateProperty(editingId, input)
    } else {
      const result = await createProperty(input)
      err = result.error
      newPropertyId = result.id
    }
    setSaving(false)
    if (err) {
      setError(err.message ?? 'Erro ao salvar')
      toast.error('Erro ao salvar imóvel', err.message)
      return
    }
    if (newPropertyId && orgId) {
      supabase.functions.invoke('outbound-reengagement', {
        body: { property_id: newPropertyId, organization_id: orgId },
      }).catch(() => {})
    }
    toast.success(editingId ? 'Imóvel atualizado' : 'Imóvel cadastrado', form.title)
    cancel()
  }

  async function handleDelete(p: Property) {
    const ok = await confirm({
      title: 'Remover imóvel?',
      description: `"${p.title}" será removido permanentemente.`,
      confirmLabel: 'Remover',
      variant: 'destructive',
    })
    if (!ok) return
    const err = await deleteProperty(p.id)
    if (err) toast.error('Erro ao remover', err.message)
    else toast.success('Imóvel removido')
  }

  async function handlePhotoUpload(files: FileList) {
    if (!editingId || !orgId) return
    setUploadingPhotos(true)
    const existingCount = photos.length
    const newPhotos: PhotoRow[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `${orgId}/${editingId}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('property-photos')
        .upload(path, file)
      if (uploadError) {
        toast.error('Erro ao enviar foto', uploadError.message)
        continue
      }
      const publicUrl = supabase.storage.from('property-photos').getPublicUrl(path).data.publicUrl
      const { data: inserted, error: insertError } = await supabase
        .from('property_photos')
        .insert({
          property_id: editingId,
          organization_id: orgId,
          storage_path: path,
          url: publicUrl,
          display_order: existingCount + i,
          is_cover: existingCount === 0 && i === 0,
        })
        .select()
        .single()
      if (insertError) {
        toast.error('Erro ao salvar foto', insertError.message)
        continue
      }
      newPhotos.push(inserted as PhotoRow)
    }
    setPhotos((prev) => [...prev, ...newPhotos])
    setUploadingPhotos(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDeletePhoto(photo: PhotoRow) {
    await supabase.from('property_photos').delete().eq('id', photo.id)
    await supabase.storage.from('property-photos').remove([photo.storage_path])
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  async function handleSetCover(photoId: string) {
    if (!editingId) return
    await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', editingId)
    await supabase.from('property_photos').update({ is_cover: true }).eq('id', photoId)
    setPhotos((prev) => prev.map((p) => ({ ...p, is_cover: p.id === photoId })))
  }

  useEffect(() => {
    if (!orgId || !isFormOpen) {
      setCompatLeads([])
      return
    }
    const propertyPrice = parseFloat(form.price) || parseFloat(form.rent_price) || 0
    const propertyBedrooms = parseInt(form.bedrooms) || 0
    const timer = setTimeout(async () => {
      setLoadingCompatLeads(true)
      const { data, error: leadsErr } = await supabase
        .from('leads')
        .select('id, name, phone, status, budget_max, bedrooms_needed, location_interest, property_type')
        .eq('organization_id', orgId)
        .neq('status', 'descartado')
        .neq('status', 'convertido')
        .limit(50)
      if (leadsErr) { console.error('[compatLeads]', leadsErr); setLoadingCompatLeads(false); return }
      const scored = (data ?? []).map((lead) => {
        const { score, label, color } = scoreLeadPropMatch(
          { property_type: lead.property_type, budget_max: lead.budget_max, bedrooms_needed: lead.bedrooms_needed, location_interest: lead.location_interest },
          { type: form.type || null, price: propertyPrice || null, bedrooms: propertyBedrooms || null, city: form.city || null, neighborhood: form.neighborhood || null }
        )
        return { ...lead, score, scoreLabel: label, scoreColor: color } as CompatLead
      }).sort((a, b) => b.score - a.score)
      const above50 = scored.filter((l) => l.score >= 50)
      setCompatLeads(above50.length >= 3 ? above50.slice(0, 8) : scored.slice(0, 3))
      setLoadingCompatLeads(false)
    }, 600)
    return () => clearTimeout(timer)
  }, [form.type, form.price, form.rent_price, form.bedrooms, form.neighborhood, form.city, orgId, isFormOpen])

  const rentsIncluded = form.listing_purpose === 'rent' || form.listing_purpose === 'both'
  const salesIncluded = form.listing_purpose === 'sale' || form.listing_purpose === 'both'

  // ---------- filtering ----------
  const filtered = properties.filter((p) => {
    const matchSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.location.toLowerCase().includes(search.toLowerCase()) ||
      (p.neighborhood ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.ref_code ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || p.listing_status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <>
    <div className="space-y-6">
      <PageHeader
        title="Imóveis"
        description={`${properties.length} imóv${properties.length !== 1 ? 'eis cadastrados' : 'el cadastrado'}`}
        actions={
          <Button leftIcon={<Plus size={14} />} onClick={isFormOpen ? cancel : startCreate}>
            {isFormOpen ? 'Fechar' : 'Novo imóvel'}
          </Button>
        }
      />

      {isFormOpen && (
        <div className="space-y-4">
          {/* Form header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {isEditing ? 'Editar imóvel' : 'Cadastrar novo imóvel'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Campos marcados com * são obrigatórios
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={cancel}><X size={14} /></Button>
          </div>

          <PropertyFormNav />

          {/* -------- 1. Básico -------- */}
          <Section id="sec-basico" title="Informações básicas">
            <Field label="Título *" hint="Aparece como headline no anúncio">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Apartamento 2 quartos com varanda — Vila Olímpia"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Tipo">
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {PROPERTY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Finalidade">
                <Select value={form.listing_purpose} onChange={(e) => setForm((f) => ({ ...f, listing_purpose: e.target.value }))}>
                  {Object.entries(LISTING_PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.listing_status} onChange={(e) => setForm((f) => ({ ...f, listing_status: e.target.value }))}>
                  {Object.entries(LISTING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Field label="Código interno (ref)" hint="Usado internamente pela equipe">
                <Input
                  value={form.ref_code}
                  onChange={(e) => setForm((f) => ({ ...f, ref_code: e.target.value }))}
                  placeholder="Ex: AP-2025-042"
                />
              </Field>
              <div className="flex items-end">
                <Checkbox
                  checked={form.featured}
                  onChange={(v) => setForm((f) => ({ ...f, featured: v }))}
                  label="Imóvel em destaque (prioriza nas buscas do bot)"
                />
              </div>
            </div>
          </Section>

          {/* -------- 2. Valores -------- */}
          <Section id="sec-valores" title="Valores e condições" description="Informe apenas os valores pertinentes à finalidade escolhida">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {salesIncluded && (
                <Field label="Preço de venda (R$)">
                  <Input type="number" step="1000" value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0" />
                </Field>
              )}
              {rentsIncluded && (
                <Field label="Preço de aluguel (R$/mês)">
                  <Input type="number" step="100" value={form.rent_price}
                    onChange={(e) => setForm((f) => ({ ...f, rent_price: e.target.value }))} placeholder="0" />
                </Field>
              )}
              <Field label="Condomínio (R$/mês)">
                <Input type="number" step="50" value={form.condo_fee}
                  onChange={(e) => setForm((f) => ({ ...f, condo_fee: e.target.value }))} placeholder="0" />
              </Field>
              <Field label="IPTU (R$/ano)">
                <Input type="number" step="50" value={form.iptu}
                  onChange={(e) => setForm((f) => ({ ...f, iptu: e.target.value }))} placeholder="0" />
              </Field>
            </div>
            {salesIncluded && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Aceita:</p>
                <div className="flex flex-wrap gap-4">
                  <Checkbox checked={form.accepts_financing} onChange={(v) => setForm((f) => ({ ...f, accepts_financing: v }))} label="Financiamento" />
                  <Checkbox checked={form.accepts_fgts} onChange={(v) => setForm((f) => ({ ...f, accepts_fgts: v }))} label="FGTS" />
                  <Checkbox checked={form.accepts_exchange} onChange={(v) => setForm((f) => ({ ...f, accepts_exchange: v }))} label="Permuta" />
                </div>
              </div>
            )}
          </Section>

          {/* -------- 3. Endereço -------- */}
          <Section id="sec-endereco" title="Endereço" description="Preencha o CEP para buscar automaticamente">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <Field label="CEP" className="sm:col-span-2">
                <Input
                  value={form.address_zip}
                  onChange={(e) => {
                    const v = maskCEP(e.target.value)
                    setForm((f) => ({ ...f, address_zip: v }))
                    if (v.replace(/\D/g, '').length === 8) handleCepLookup(v)
                  }}
                  placeholder="00000-000"
                />
                {cepLoading && <p className="text-[11px] text-muted-foreground mt-1">Buscando CEP...</p>}
              </Field>
              <Field label="Rua / logradouro *" className="sm:col-span-4">
                <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Av. Paulista" />
              </Field>
              <Field label="Número" className="sm:col-span-2">
                <Input value={form.address_number} onChange={(e) => setForm((f) => ({ ...f, address_number: e.target.value }))} placeholder="1000" />
              </Field>
              <Field label="Complemento" className="sm:col-span-4">
                <Input value={form.address_complement} onChange={(e) => setForm((f) => ({ ...f, address_complement: e.target.value }))} placeholder="Apto 501, Bloco B" />
              </Field>
              <Field label="Bairro" className="sm:col-span-3">
                <Input value={form.neighborhood} onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))} placeholder="Bela Vista" />
              </Field>
              <Field label="Cidade" className="sm:col-span-2">
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="São Paulo" />
              </Field>
              <Field label="UF">
                <Select value={form.address_state} onChange={(e) => setForm((f) => ({ ...f, address_state: e.target.value }))}>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </Select>
              </Field>
            </div>
          </Section>

          {/* -------- 4. Especificações -------- */}
          <Section id="sec-specs" title="Especificações" description="Medidas e características físicas do imóvel">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Área útil (m²)">
                <Input type="number" value={form.area_m2} onChange={(e) => setForm((f) => ({ ...f, area_m2: e.target.value }))} placeholder="72" />
              </Field>
              <Field label="Área total (m²)">
                <Input type="number" value={form.total_area_m2} onChange={(e) => setForm((f) => ({ ...f, total_area_m2: e.target.value }))} placeholder="85" />
              </Field>
              <Field label="Quartos">
                <Input type="number" value={form.bedrooms} onChange={(e) => setForm((f) => ({ ...f, bedrooms: e.target.value }))} placeholder="2" />
              </Field>
              <Field label="Suítes">
                <Input type="number" value={form.suites} onChange={(e) => setForm((f) => ({ ...f, suites: e.target.value }))} placeholder="1" />
              </Field>
              <Field label="Banheiros">
                <Input type="number" value={form.bathrooms} onChange={(e) => setForm((f) => ({ ...f, bathrooms: e.target.value }))} placeholder="2" />
              </Field>
              <Field label="Vagas">
                <Input type="number" value={form.parking_spots} onChange={(e) => setForm((f) => ({ ...f, parking_spots: e.target.value }))} placeholder="1" />
              </Field>
              <Field label="Andar">
                <Input type="number" value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} placeholder="5" />
              </Field>
              <Field label="Ano de construção">
                <Input type="number" value={form.year_built} onChange={(e) => setForm((f) => ({ ...f, year_built: e.target.value }))} placeholder="2018" />
              </Field>
            </div>
            <Field label="Mobiliado">
              <Select value={form.furnished} onChange={(e) => setForm((f) => ({ ...f, furnished: e.target.value }))}>
                <option value="">—</option>
                {Object.entries(FURNISHED_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </Section>

          {/* -------- 5. Amenities -------- */}
          <Section id="sec-amenidades" title="Características e amenidades" description="Marque tudo que o imóvel ou condomínio oferece">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {AMENITIES.map((a) => (
                <Checkbox
                  key={a.key}
                  checked={form.amenities.includes(a.key)}
                  onChange={() => toggleAmenity(a.key)}
                  label={a.label}
                />
              ))}
            </div>
          </Section>

          {/* -------- 6. Mídia -------- */}
          <Section id="sec-midia" title="Mídia e links" description="Anúncio externo, imagens, vídeo e tour virtual">
            <Field label="URL do anúncio" hint="Link para o anúncio em outro site (seu, VivaReal, Zap, Imovelweb, etc.)">
              <Input type="url" value={form.listing_url}
                onChange={(e) => setForm((f) => ({ ...f, listing_url: e.target.value }))}
                placeholder="https://www.vivareal.com.br/imovel/..." />
            </Field>
            <Field label="Descrição pública" hint="Aparece para o lead nas sugestões do bot">
              <Textarea rows={3} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Apartamento reformado, com vista privilegiada e ótima localização..." />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Vídeo (URL)" hint="YouTube, Vimeo ou MP4 direto">
                <Input type="url" value={form.video_url}
                  onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                  placeholder="https://youtube.com/..." />
              </Field>
              <Field label="Tour virtual 360° (URL)">
                <Input type="url" value={form.virtual_tour_url}
                  onChange={(e) => setForm((f) => ({ ...f, virtual_tour_url: e.target.value }))}
                  placeholder="https://..." />
              </Field>
            </div>
          </Section>

          {/* -------- 7. Fotos -------- */}
          <Section id="sec-fotos" title="Fotos" description="Galeria de imagens do imóvel">
            {!editingId ? (
              <p className="text-sm text-muted-foreground">Salve o imóvel primeiro para adicionar fotos</p>
            ) : (
              <div className="space-y-4">
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, idx) => (
                      <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                        <img
                          src={photo.url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setLightboxIndex(idx)}
                            title="Ver em tamanho real"
                            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                          >
                            <ZoomIn size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetCover(photo.id)}
                            title="Definir como capa"
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              photo.is_cover ? 'text-yellow-400 bg-white/10' : 'text-white hover:text-yellow-400 bg-white/10 hover:bg-white/20',
                            )}
                          >
                            <Star size={14} fill={photo.is_cover ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(photo)}
                            title="Remover foto"
                            className="p-1.5 rounded bg-white/10 hover:bg-red-500/70 text-white transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {photo.is_cover && (
                          <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-yellow-400/90 text-black font-medium py-0.5">
                            Capa
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <label className={cn(
                  'flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed border-border px-4 py-6 cursor-pointer transition-colors',
                  uploadingPhotos
                    ? 'opacity-50 pointer-events-none'
                    : 'hover:border-muted-foreground hover:bg-subtle/40',
                )}>
                  <ImagePlus size={22} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploadingPhotos ? 'Enviando...' : 'Clique para adicionar fotos'}
                  </span>
                  <span className="text-xs text-muted-foreground">JPEG, PNG ou WebP</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handlePhotoUpload(e.target.files)
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </Section>

          {/* -------- 8. Interno -------- */}
          <Section id="sec-notas" title="Anotações internas" description="Visíveis apenas para a equipe — nunca exibidas ao cliente">
            <Field label="Notas privadas">
              <Textarea rows={3} value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                placeholder="Proprietário aceita negociar até 5%. Chaves na portaria..." />
            </Field>
          </Section>

          {/* -------- 9. Leads compatíveis -------- */}
          <Section id="sec-compat" title="Leads compatíveis">
            <div id="sec-compat-inner">
              <div className="flex items-center gap-2 mb-3">
                <Users size={13} className="text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leads compatíveis</p>
                {loadingCompatLeads && <span className="text-[11px] text-muted-foreground">Buscando…</span>}
                {!loadingCompatLeads && compatLeads.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">{compatLeads.length} encontrado{compatLeads.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              {loadingCompatLeads ? (
                <p className="text-xs text-muted-foreground">Buscando leads…</p>
              ) : compatLeads.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum lead ativo compatível com este imóvel.</p>
              ) : (
                <div className="space-y-2">
                  {compatLeads.map((lead) => (
                    <div key={lead.id} className="rounded-lg border border-border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{lead.name ?? lead.phone}</p>
                        <span className={cn('text-[11px] font-semibold shrink-0', lead.scoreColor)}>{lead.scoreLabel} · {lead.score}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{lead.phone}</p>
                      {lead.budget_max ? <p className="text-[11px] text-muted-foreground">Orç. máx: {formatCurrency(lead.budget_max)}</p> : null}
                      {lead.location_interest ? <p className="text-[11px] text-muted-foreground truncate">📍 {lead.location_interest}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {error && (
            <div className="text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 sticky bottom-4 bg-canvas/95 backdrop-blur rounded-xl border border-border p-3 shadow-elev">
            <Button variant="outline" onClick={cancel}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.title || !form.location}>
              {isEditing ? 'Salvar alterações' : 'Criar imóvel'}
            </Button>
          </div>
        </div>
      )}

      {!isFormOpen && (
        <>
          {/* Filters */}
          {properties.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[220px]">
                <Input
                  leftIcon={<Search size={14} />}
                  placeholder="Buscar por título, rua, bairro ou código..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-48">
                <option value="">Todos os status</option>
                {Object.entries(LISTING_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : properties.length === 0 ? (
            <EmptyState
              icon={Home}
              title="Nenhum imóvel cadastrado"
              description="Cadastre imóveis para que o bot possa sugerir aos leads."
              action={<Button leftIcon={<Plus size={14} />} onClick={startCreate}>Cadastrar primeiro imóvel</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Home}
              title="Nenhum imóvel corresponde ao filtro"
              description="Ajuste a busca ou o status."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => <PropertyCard key={p.id} p={p} onEdit={startEdit} onStatus={updateStatus} onDelete={handleDelete} />)}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                Carregar mais imóveis
              </Button>
            </div>
          )}
        </>
      )}
    </div>

    {/* Lightbox */}
    {lightboxIndex !== null && photos.length > 0 && (
      <div
        className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center animate-fade-in"
        onClick={() => setLightboxIndex(null)}
      >
        <button
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={() => setLightboxIndex(null)}
        >
          <X size={18} />
        </button>
        {photos.length > 1 && (
          <>
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) - 1 + photos.length) % photos.length) }}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => ((i ?? 0) + 1) % photos.length) }}
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
        <div className="flex flex-col items-center gap-3 max-w-3xl max-h-[90vh] px-16" onClick={(e) => e.stopPropagation()}>
          <img
            src={photos[lightboxIndex].url}
            alt=""
            className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl"
          />
          <p className="text-white/60 text-xs">{lightboxIndex + 1} / {photos.length}{photos[lightboxIndex].is_cover ? ' · Capa' : ''}</p>
        </div>
      </div>
    )}
    </>
  )
}

// =========================================================================
// Card
// =========================================================================
function PropertyCard({
  p,
  onEdit,
  onStatus,
  onDelete,
}: {
  p: Property
  onEdit: (p: Property) => void
  onStatus: (id: string, status: string) => void
  onDelete: (p: Property) => void
}) {
  const typeLabel = PROPERTY_TYPES.find((t) => t.key === p.type)?.label ?? p.type
  const statusKey = p.listing_status ?? 'available'
  const amenityLabels = (p.amenities ?? [])
    .map((k) => AMENITIES.find((a) => a.key === k)?.label)
    .filter(Boolean) as string[]

  return (
    <Card className={cn('overflow-hidden flex flex-col hover:border-border-strong transition-colors', statusKey !== 'available' && 'opacity-80')}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <Badge variant="neutral" className="capitalize">{typeLabel}</Badge>
            {p.featured && (
              <Badge variant="warning"><Sparkles size={10} /> Destaque</Badge>
            )}
          </div>
          <Badge variant={LISTING_STATUS_VARIANTS[statusKey]} dot className="shrink-0">
            {LISTING_STATUS_LABELS[statusKey]}
          </Badge>
        </div>

        <div>
          <p className="font-semibold text-foreground text-base leading-tight line-clamp-2">{p.title}</p>
          {p.ref_code && (
            <p className="text-[10px] text-muted-foreground font-mono mt-1">{p.ref_code}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
          <MapPin size={11} className="shrink-0" />
          {[p.location, p.address_number].filter(Boolean).join(', ')}
          {p.neighborhood ? ` — ${p.neighborhood}` : ''}
        </p>
      </div>

      <div className="px-4 pb-4 space-y-3 flex-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground bg-subtle/40 rounded-lg px-3 py-2">
          {p.bedrooms != null && <span className="flex items-center gap-1 tabular"><BedDouble size={11} />{p.bedrooms}{p.suites != null && p.suites > 0 ? ` (${p.suites} suíte${p.suites > 1 ? 's' : ''})` : ''}</span>}
          {p.bathrooms != null && <span className="flex items-center gap-1 tabular"><Bath size={11} />{p.bathrooms}</span>}
          {p.parking_spots != null && <span className="flex items-center gap-1 tabular"><Car size={11} />{p.parking_spots}</span>}
          {p.area_m2 != null && <span className="flex items-center gap-1 tabular"><Ruler size={11} />{p.area_m2}m²</span>}
          {p.floor != null && <span className="flex items-center gap-1 tabular"><Layers size={11} />{p.floor}º</span>}
          {p.year_built != null && <span className="flex items-center gap-1 tabular"><CalendarIcon size={11} />{p.year_built}</span>}
        </div>

        {amenityLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {amenityLabels.slice(0, 3).map((l) => (
              <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-subtle-foreground border border-border">
                {l}
              </span>
            ))}
            {amenityLabels.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground" title={amenityLabels.slice(3).join(', ')}>
                +{amenityLabels.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-border space-y-0.5">
          {p.price != null && (
            <p className="text-lg font-semibold tabular tracking-tight text-foreground">
              {formatCurrency(p.price)}
              <span className="text-[11px] font-normal text-muted-foreground ml-1">venda</span>
            </p>
          )}
          {p.rent_price != null && (
            <p className="text-sm font-semibold tabular text-foreground">
              {formatCurrency(p.rent_price)}
              <span className="text-[11px] font-normal text-muted-foreground ml-1">/mês</span>
            </p>
          )}
          {(p.condo_fee != null || p.iptu != null) && (
            <p className="text-[11px] text-muted-foreground tabular">
              {p.condo_fee != null && <span>Cond. {formatCurrency(p.condo_fee)}</span>}
              {p.condo_fee != null && p.iptu != null && <span> · </span>}
              {p.iptu != null && <span>IPTU {formatCurrency(p.iptu)}/ano</span>}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 p-3 border-t border-border">
        <Select
          value={statusKey}
          onChange={(e) => onStatus(p.id, e.target.value)}
          className="h-8 flex-1 text-xs py-0"
        >
          {Object.entries(LISTING_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        {p.listing_url && (
          <a
            href={p.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir anúncio"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-subtle hover:text-foreground transition-colors"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(p)} title="Editar">
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(p)}
          title="Remover"
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </Card>
  )
}
