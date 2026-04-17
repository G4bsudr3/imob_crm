import { useEffect, useState } from 'react'
import { User, Building2, Save, CheckCircle, AlertCircle, Mail, Users, UserPlus, X, Shield, Sparkles, Calendar, Link2, Unlink, Bell } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useOrganization } from '../hooks/useOrganization'
import { useTeam } from '../hooks/useTeam'
import { useCalendarIntegration } from '../hooks/useCalendarIntegration'
import { useWhatsappGroup } from '../hooks/useWhatsappGroup'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { cn, formatDate } from '../lib/utils'
import { maskCNPJ, maskCEP, maskPhone, UFS } from '../lib/masks'

type Tab = 'pessoal' | 'empresa' | 'equipe' | 'integracoes'

const ROLE_LABELS: Record<string, string> = {
  user: 'Corretor',
  manager: 'Gerente',
  admin: 'Administrador',
}

const ROLE_VARIANTS: Record<string, 'neutral' | 'info' | 'primary'> = {
  user: 'neutral',
  manager: 'info',
  admin: 'primary',
}

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

function SchemaErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Schema ainda não foi migrado</p>
        <p className="mt-0.5 leading-relaxed">{message}</p>
        <p className="mt-1">
          Rode{' '}
          <code className="px-1 py-0.5 bg-destructive/10 rounded text-[10px]">
            supabase/migrations/20260416_profile_and_organization.sql
          </code>{' '}
          no SQL Editor do Supabase.
        </p>
      </div>
    </div>
  )
}

export function Settings() {
  const { profile } = useProfile()
  const [tab, setTab] = useState<Tab>('pessoal')

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager'

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: 'pessoal', label: 'Perfil pessoal', icon: User },
    { id: 'empresa', label: 'Empresa', icon: Building2 },
    ...(isAdmin ? [{ id: 'equipe' as Tab, label: 'Equipe', icon: Users }] : []),
    ...(isAdmin ? [{ id: 'integracoes' as Tab, label: 'Integrações', icon: Link2 }] : []),
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Configurações"
        description="Dados do seu perfil, da imobiliária e da equipe"
      />

      <div className="flex gap-0.5 bg-subtle rounded-lg p-0.5 w-fit border border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'pessoal' && <PersonalTab />}
      {tab === 'empresa' && <CompanyTab />}
      {tab === 'equipe' && isAdmin && <TeamTab />}
      {tab === 'integracoes' && isAdmin && <IntegrationsTab />}
    </div>
  )
}

// ============================================================
// Perfil pessoal
// ============================================================
function PersonalTab() {
  const toast = useToast()
  const { user } = useAuth()
  const { profile, loading, upsertProfile } = useProfile()
  const [form, setForm] = useState({ name: '', phone: '', role: 'user', avatar_url: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? '',
        phone: profile.phone ?? '',
        role: profile.role ?? 'user',
        avatar_url: profile.avatar_url ?? '',
      })
    } else if (user && !loading) {
      setForm((f) => ({ ...f, name: user.email?.split('@')[0] ?? '' }))
    }
  }, [profile, loading, user])

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error } = await upsertProfile({
      name: form.name || null,
      phone: form.phone || null,
      role: form.role,
      avatar_url: form.avatar_url || null,
      email: user?.email ?? null,
    })
    setSaving(false)
    if (error) {
      setError(error)
      toast.error('Erro ao salvar perfil', error)
      return
    }
    setSaved(true)
    toast.success('Perfil atualizado')
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <Card className="p-8 text-sm text-muted-foreground text-center">Carregando...</Card>

  const initials = (form.name || user?.email || '??').slice(0, 2).toUpperCase()
  const schemaMissing = error?.toLowerCase().includes('column') || error?.toLowerCase().includes('does not exist')

  return (
    <div className="space-y-4">
      {schemaMissing && error && <SchemaErrorBanner message={error} />}

      <SubSection title="Identidade" description="Como outros membros veem você">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-xl font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{form.name || 'Sem nome'}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Mail size={11} /> {user?.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Field label="Nome" className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Seu nome completo"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
              placeholder="(11) 99999-9999"
            />
          </Field>
          <Field label="Função" hint="Usado para controle de permissões">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="user">Corretor</option>
              <option value="manager">Gerente</option>
              <option value="admin">Administrador</option>
            </Select>
          </Field>
          <Field label="URL do avatar" className="sm:col-span-2" hint="Opcional — imagem do seu perfil">
            <Input
              type="url"
              value={form.avatar_url}
              onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
              placeholder="https://..."
            />
          </Field>
        </div>
      </SubSection>

      <AlertsGroupJoinCard />

      <SubSection title="Conta" description="Informações da sua sessão">
        <Field label="Email">
          <Input value={user?.email ?? ''} disabled />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          O email é gerenciado pela autenticação. Para alterar, entre em contato com o administrador.
        </p>
      </SubSection>

      {error && !schemaMissing && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} leftIcon={saved ? <CheckCircle size={14} /> : <Save size={14} />}>
          {saved ? 'Salvo' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Card "Grupo de alertas" (visível pra qualquer usuário no PerfilTab)
// ============================================================
function AlertsGroupJoinCard() {
  const toast = useToast()
  const { profile } = useProfile()
  const { info, loading, busy, joinGroup } = useWhatsappGroup()

  if (loading) return null

  const hasGroup = !!info?.group_jid
  const hasPhone = !!profile?.phone?.trim()
  const isConnected = info?.instance_status === 'connected'

  // Se o WhatsApp nem está conectado, nem mostra esse card
  if (!isConnected) return null

  async function handleJoin() {
    if (!hasPhone) {
      toast.error('Configure seu telefone antes', 'Preenche o campo Telefone acima e salva.')
      return
    }
    const res = await joinGroup()
    if (res.ok) toast.success('Adicionado ao grupo', 'Confira seu WhatsApp.')
    else toast.error('Não foi possível entrar no grupo', res.error || 'Erro desconhecido')
  }

  if (!hasGroup) {
    return (
      <SubSection title="Grupo de alertas">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
            <Bell size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Aguardando criação</p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed max-w-md">
              O administrador da sua imobiliária ainda não criou o grupo de alertas no WhatsApp. Quando ele criar, você poderá entrar aqui.
            </p>
          </div>
        </div>
      </SubSection>
    )
  }

  return (
    <SubSection title="Grupo de alertas">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
          <Bell size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{info?.group_name || 'Alertas da imobiliária'}</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed max-w-md">
            Grupo no WhatsApp onde o bot envia notificações em tempo real: novos leads, visitas agendadas, cancelamentos, pedidos de atendente humano.
          </p>
        </div>
      </div>

      {!hasPhone && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft p-3 flex items-start gap-2.5">
          <AlertCircle size={14} className="text-warning mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-warning">Configure seu telefone primeiro</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Preenche o campo Telefone acima (com DDD) e clica em Salvar. Depois volta aqui pra entrar no grupo.
            </p>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <Button
          leftIcon={<Bell size={14} />}
          onClick={handleJoin}
          loading={busy}
          disabled={!hasPhone}
        >
          Entrar no grupo
        </Button>
      </div>
    </SubSection>
  )
}

// ============================================================
// Empresa / Imobiliária
// ============================================================
function CompanyTab() {
  const toast = useToast()
  const { profile } = useProfile()
  const { org, loading, saveOrg } = useOrganization()
  const canEdit = profile?.role === 'admin' || profile?.role === 'manager'
  const [form, setForm] = useState({
    legal_name: '',
    trade_name: '',
    cnpj: '',
    state_registration: '',
    creci: '',
    email: '',
    phone: '',
    website: '',
    logo_url: '',
    address_zip: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: 'SP',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (org) {
      setForm({
        legal_name: org.legal_name ?? '',
        trade_name: org.trade_name ?? '',
        cnpj: org.cnpj ?? '',
        state_registration: org.state_registration ?? '',
        creci: org.creci ?? '',
        email: org.email ?? '',
        phone: org.phone ?? '',
        website: org.website ?? '',
        logo_url: org.logo_url ?? '',
        address_zip: org.address_zip ?? '',
        address_street: org.address_street ?? '',
        address_number: org.address_number ?? '',
        address_complement: org.address_complement ?? '',
        address_neighborhood: org.address_neighborhood ?? '',
        address_city: org.address_city ?? '',
        address_state: org.address_state ?? 'SP',
      })
    }
  }, [org])

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error } = await saveOrg({
      legal_name: form.legal_name || null,
      trade_name: form.trade_name || null,
      cnpj: form.cnpj || null,
      state_registration: form.state_registration || null,
      creci: form.creci || null,
      email: form.email || null,
      phone: form.phone || null,
      website: form.website || null,
      logo_url: form.logo_url || null,
      address_zip: form.address_zip || null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      address_neighborhood: form.address_neighborhood || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
    })
    setSaving(false)
    if (error) {
      setError(error)
      toast.error('Erro ao salvar empresa', error)
      return
    }
    setSaved(true)
    toast.success('Empresa atualizada')
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <Card className="p-8 text-sm text-muted-foreground text-center">Carregando...</Card>

  const schemaMissing = error?.toLowerCase().includes('organizations') || error?.toLowerCase().includes('does not exist')

  return (
    <div className="space-y-4">
      {schemaMissing && error && <SchemaErrorBanner message={error} />}

      {!canEdit && (
        <div className="flex items-start gap-2 text-xs text-info bg-info-soft border border-info/20 rounded-lg p-3">
          <Shield size={14} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            <span className="font-medium">Modo somente leitura.</span>{' '}
            Apenas administradores podem alterar os dados da empresa.
            Peça a um administrador para fazer as mudanças necessárias.
          </p>
        </div>
      )}

      {canEdit && <DemoSeedCard />}

      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">

      <SubSection title="Dados da imobiliária" description="Informações fiscais e registro">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Razão social *" className="sm:col-span-2" hint="Nome registrado na Receita Federal">
            <Input
              value={form.legal_name}
              onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
              placeholder="Imobiliária Exemplo Ltda."
            />
          </Field>
          <Field label="Nome fantasia" className="sm:col-span-2" hint="Nome comercial exibido ao público">
            <Input
              value={form.trade_name}
              onChange={(e) => setForm((f) => ({ ...f, trade_name: e.target.value }))}
              placeholder="Exemplo Imóveis"
            />
          </Field>
          <Field label="CNPJ">
            <Input
              value={form.cnpj}
              onChange={(e) => setForm((f) => ({ ...f, cnpj: maskCNPJ(e.target.value) }))}
              placeholder="00.000.000/0001-00"
            />
          </Field>
          <Field label="Inscrição estadual">
            <Input
              value={form.state_registration}
              onChange={(e) => setForm((f) => ({ ...f, state_registration: e.target.value }))}
              placeholder="Isento ou número"
            />
          </Field>
          <Field label="CRECI" className="sm:col-span-2" hint="Registro no Conselho Regional de Corretores de Imóveis">
            <Input
              value={form.creci}
              onChange={(e) => setForm((f) => ({ ...f, creci: e.target.value }))}
              placeholder="CRECI/SP 12.345-J"
            />
          </Field>
        </div>
      </SubSection>

      <SubSection title="Contato" description="Canais públicos da imobiliária">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Email comercial">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="contato@imobiliaria.com"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
              placeholder="(11) 3000-0000"
            />
          </Field>
          <Field label="Site" className="sm:col-span-2">
            <Input
              type="url"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://imobiliaria.com.br"
            />
          </Field>
          <Field label="URL do logo" className="sm:col-span-2">
            <Input
              type="url"
              value={form.logo_url}
              onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
              placeholder="https://..."
            />
          </Field>
        </div>
      </SubSection>

      <SubSection title="Endereço" description="Sede ou escritório principal">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <Field label="CEP" className="sm:col-span-2">
            <Input
              value={form.address_zip}
              onChange={(e) => setForm((f) => ({ ...f, address_zip: maskCEP(e.target.value) }))}
              placeholder="00000-000"
            />
          </Field>
          <Field label="Rua" className="sm:col-span-4">
            <Input
              value={form.address_street}
              onChange={(e) => setForm((f) => ({ ...f, address_street: e.target.value }))}
              placeholder="Av. Paulista"
            />
          </Field>
          <Field label="Número" className="sm:col-span-2">
            <Input
              value={form.address_number}
              onChange={(e) => setForm((f) => ({ ...f, address_number: e.target.value }))}
              placeholder="1000"
            />
          </Field>
          <Field label="Complemento" className="sm:col-span-4">
            <Input
              value={form.address_complement}
              onChange={(e) => setForm((f) => ({ ...f, address_complement: e.target.value }))}
              placeholder="Sala 101"
            />
          </Field>
          <Field label="Bairro" className="sm:col-span-3">
            <Input
              value={form.address_neighborhood}
              onChange={(e) => setForm((f) => ({ ...f, address_neighborhood: e.target.value }))}
              placeholder="Bela Vista"
            />
          </Field>
          <Field label="Cidade" className="sm:col-span-2">
            <Input
              value={form.address_city}
              onChange={(e) => setForm((f) => ({ ...f, address_city: e.target.value }))}
              placeholder="São Paulo"
            />
          </Field>
          <Field label="UF">
            <Select
              value={form.address_state}
              onChange={(e) => setForm((f) => ({ ...f, address_state: e.target.value }))}
            >
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </Select>
          </Field>
        </div>
      </SubSection>

      {error && !schemaMissing && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      </fieldset>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving} leftIcon={saved ? <CheckCircle size={14} /> : <Save size={14} />}>
            {saved ? 'Salvo' : 'Salvar alterações'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Equipe
// ============================================================
function TeamTab() {
  const toast = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()
  const { profile } = useProfile()
  const { members, invitations, loading, invite, revokeInvitation, changeRole, removeMember } = useTeam()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'manager' | 'admin'>('user')
  const [sending, setSending] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    const normalized = email.trim().toLowerCase()
    if (normalized === user?.email?.toLowerCase()) {
      setInviteError('Você já faz parte da organização')
      return
    }
    if (members.some((m) => m.email?.toLowerCase() === normalized)) {
      setInviteError('Esta pessoa já é membro da organização')
      return
    }
    setSending(true)
    setInviteError(null)
    const { error } = await invite(normalized, role)
    setSending(false)
    if (error) {
      setInviteError(error)
      toast.error('Erro ao convidar', error)
      return
    }
    toast.success('Convite criado', `${normalized} como ${role === 'admin' ? 'Administrador' : role === 'manager' ? 'Gerente' : 'Corretor'}`)
    setEmail('')
    setRole('user')
    setInviteSuccess(true)
    setTimeout(() => setInviteSuccess(false), 2500)
  }

  async function handleRevoke(id: string, email: string) {
    const ok = await confirm({
      title: 'Revogar convite?',
      description: `O convite para ${email} será cancelado. Você pode convidar novamente depois.`,
      confirmLabel: 'Revogar',
      variant: 'destructive',
    })
    if (!ok) return
    const { error } = await revokeInvitation(id)
    if (error) toast.error('Erro ao revogar', error)
    else toast.success('Convite revogado')
  }

  async function handleRoleChange(userId: string, role: 'user' | 'manager' | 'admin') {
    const { error } = await changeRole(userId, role)
    if (error) toast.error('Erro ao alterar role', error)
    else toast.success('Role atualizada')
  }

  async function handleRemove(userId: string, name: string) {
    const ok = await confirm({
      title: 'Remover da organização?',
      description: `${name} perderá acesso à imobiliária. Essa ação não pode ser desfeita automaticamente.`,
      confirmLabel: 'Remover',
      variant: 'destructive',
    })
    if (!ok) return
    const { error } = await removeMember(userId)
    if (error) toast.error('Erro ao remover', error)
    else toast.success('Membro removido')
  }

  if (loading) return <Card className="p-8 text-sm text-muted-foreground text-center">Carregando...</Card>

  return (
    <div className="space-y-4">
      <SubSection title="Convidar pessoa" description="A pessoa será associada automaticamente ao fazer login com esse email">
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <Input
                type="email"
                placeholder="colega@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="sm:w-44">
              <option value="user">Corretor</option>
              <option value="manager">Gerente</option>
              <option value="admin">Administrador</option>
            </Select>
            <Button type="submit" loading={sending} leftIcon={inviteSuccess ? <CheckCircle size={14} /> : <UserPlus size={14} />}>
              {inviteSuccess ? 'Convidado' : 'Convidar'}
            </Button>
          </div>

          {inviteError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p>{inviteError}</p>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-subtle border border-border rounded-lg p-3">
            <Shield size={14} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              Não enviamos email automaticamente. Compartilhe o link da plataforma com a pessoa — quando ela se cadastrar com o email acima via OTP, será automaticamente associada à sua imobiliária com a role escolhida.
            </p>
          </div>
        </form>
      </SubSection>

      {invitations.length > 0 && (
        <SubSection title={`Convites pendentes (${invitations.length})`} description="Aguardando o cadastro das pessoas convidadas">
          <ul className="divide-y divide-border -mx-5">
            {invitations.map((inv) => (
              <li key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Convidado em {formatDate(inv.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={ROLE_VARIANTS[inv.role] ?? 'neutral'}>
                    {ROLE_LABELS[inv.role] ?? inv.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevoke(inv.id, inv.email)}
                    title="Revogar convite"
                  >
                    <X size={13} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SubSection>
      )}

      <SubSection title={`Membros (${members.length})`} description="Pessoas ativas na imobiliária">
        <ul className="divide-y divide-border -mx-5">
          {members.map((m) => {
            const isSelf = m.id === profile?.id
            const displayName = m.name?.trim() || (m.email ?? '').split('@')[0] || 'Sem nome'
            const initials = (m.name?.trim() || m.email || '??').slice(0, 2).toUpperCase()
            return (
              <li key={m.id} className="px-5 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {displayName}
                    {isSelf && <span className="text-[10px] text-muted-foreground font-normal">(você)</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value as 'user' | 'manager' | 'admin')}
                    disabled={isSelf}
                    className="h-7 py-0 text-xs w-36"
                  >
                    <option value="user">Corretor</option>
                    <option value="manager">Gerente</option>
                    <option value="admin">Administrador</option>
                  </Select>
                  {!isSelf && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(m.id, displayName)}
                      title="Remover da organização"
                    >
                      <X size={13} />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </SubSection>
    </div>
  )
}

// ============================================================
// Integrações (Google Calendar)
// ============================================================
function IntegrationsTab() {
  const toast = useToast()
  const confirm = useConfirm()
  const { integration, loading, connecting, connect, disconnect } = useCalendarIntegration()

  async function handleConnect() {
    try {
      await connect()
      toast.success('Google Calendar conectado', 'Agendamentos agora sincronizam automaticamente')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error('Não foi possível conectar', msg)
    }
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: 'Desconectar Google Calendar?',
      description: 'Agendamentos futuros deixarão de ser sincronizados. Eventos que já existem no seu calendário permanecem.',
      confirmLabel: 'Desconectar',
      variant: 'destructive',
    })
    if (!ok) return
    const err = await disconnect()
    if (err) toast.error('Erro ao desconectar', err)
    else toast.success('Google Calendar desconectado')
  }

  return (
    <div className="space-y-4">
      <SubSection
        title="Google Calendar"
        description="Sincronize agendamentos do bot automaticamente com seu calendário Google. O bot também valida conflitos contra seu Calendar antes de marcar visitas."
      >
        {loading ? (
          <div className="h-16 rounded-lg bg-subtle/60 animate-pulse" />
        ) : integration ? (
          <div className="border border-border rounded-xl p-4 bg-success-soft/40">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-success text-success-foreground flex items-center justify-center shrink-0">
                <CheckCircle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">Conectado</p>
                  <Badge variant="success" dot>ativo</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {integration.google_email ?? 'Sem e-mail detectado'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Calendário: <span className="font-medium">{integration.calendar_id}</span>
                  {' · '}
                  conectado {formatDate(integration.connected_at)}
                </p>
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-2 py-1 text-[11px] text-muted-foreground">
                  <span aria-hidden="true">📤</span>
                  <span>Sincronização <strong className="text-foreground">Imob CRM → Google</strong> (uma via)</span>
                </div>
                {integration.last_error && (
                  <p className="text-[11px] text-destructive mt-2 flex items-center gap-1">
                    <AlertCircle size={11} /> Último erro: {integration.last_error}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Unlink size={13} />}
                onClick={handleDisconnect}
              >
                Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-xl p-5 flex items-start gap-4">
            <div className="h-11 w-11 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
              <Calendar size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Conectar Google Calendar</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
                Ao conectar, agendamentos criados pelo bot via WhatsApp também aparecem no seu Google Calendar automaticamente. Alterações e cancelamentos sincronizam. O bot valida conflitos contra seu calendário antes de marcar.
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-[11px] text-muted-foreground">
                <span aria-hidden="true">📤</span>
                <span>Sincronização em uma via: <strong className="text-foreground">Imob CRM → Google</strong></span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Permissões: criar, editar e ler eventos do seu calendário principal. Sem acesso a outros dados.
              </p>
            </div>
            <Button
              variant="primary"
              leftIcon={<Link2 size={13} />}
              onClick={handleConnect}
              loading={connecting}
            >
              Conectar
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-border bg-subtle/30 p-3.5 text-[11px] text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1">Como funciona</p>
          <ul className="space-y-1 list-disc pl-4">
            <li>Se a organização tem integração, o bot checa conflitos no seu Google Calendar além da agenda interna.</li>
            <li>Horário ocupado → bot não revela o que você tem marcado, só oferece alternativas livres.</li>
            <li>Remarcar ou cancelar pelo bot atualiza o evento no Google.</li>
            <li>Se ninguém está integrado, o bot funciona normalmente só com controle interno.</li>
          </ul>
        </div>
      </SubSection>
    </div>
  )
}

// ============================================================
// Demo seed (admin-only, idempotente)
// ============================================================
function DemoSeedCard() {
  const toast = useToast()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ properties_added: number; leads_added: number } | null>(null)

  async function handleSeed() {
    const ok = await confirm({
      title: 'Popular dados de demonstração?',
      description: 'Adiciona 20 imóveis, 5 leads, 2 agendamentos e algumas conversas de exemplo na sua organização. É idempotente — rodar de novo não duplica. Use apenas para testes/demonstração.',
      confirmLabel: 'Popular',
    })
    if (!ok) return
    setLoading(true)
    setResult(null)
    const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: any; error: { message: string } | null }>)('seed_my_org_demo')
    setLoading(false)
    if (error) {
      toast.error('Erro ao popular', error.message)
      return
    }
    if (data?.error) {
      toast.error('Não foi possível popular', data.error)
      return
    }
    setResult({
      properties_added: data?.properties_added ?? 0,
      leads_added: data?.leads_added ?? 0,
    })
    toast.success(
      'Dados populados',
      `${data?.properties_added ?? 0} imóveis e ${data?.leads_added ?? 0} leads adicionados`,
    )
  }

  return (
    <Card className="overflow-hidden border-dashed">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0">
          <Sparkles size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold tracking-tight">Popular dados de demonstração</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Adiciona 20 imóveis em bairros de São Paulo, 5 leads em status variados, 2 agendamentos futuros e amostra de conversas. Ideal para mostrar o app funcionando.
          </p>
          {result && (
            <p className="text-[11px] text-success mt-2 flex items-center gap-1">
              <CheckCircle size={11} />
              Adicionados: {result.properties_added} imóveis, {result.leads_added} leads.
            </p>
          )}
        </div>
        <Button
          variant="soft"
          size="md"
          onClick={handleSeed}
          loading={loading}
          leftIcon={<Sparkles size={13} />}
        >
          Popular demo
        </Button>
      </div>
    </Card>
  )
}
