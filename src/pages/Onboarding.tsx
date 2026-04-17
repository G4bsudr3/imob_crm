import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, ArrowRight, LogOut, Mail } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useOrganization } from '../hooks/useOrganization'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Input'
import { maskCNPJ } from '../lib/masks'

export function Onboarding() {
  const { user, signOut } = useAuth()
  const { refetch: refetchProfile } = useProfile()
  const { saveOrg } = useOrganization()

  const [step, setStep] = useState<'intro' | 'form' | 'done'>('intro')
  const [form, setForm] = useState({ legal_name: '', trade_name: '', cnpj: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingInvite, setCheckingInvite] = useState(false)
  const [inviteChecked, setInviteChecked] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)

  async function checkInvitation() {
    setCheckingInvite(true)
    setInviteMessage(null)
    const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: { message: string } | null }>)('accept_pending_invitation')
    setCheckingInvite(false)
    setInviteChecked(true)
    if (error) {
      setInviteMessage(`Erro: ${error.message}`)
      return
    }
    if (data) {
      // Invitation accepted — refetch profile; App guard will redirect
      await refetchProfile()
    } else {
      setInviteMessage('Nenhum convite encontrado para este email. Peça ao administrador da imobiliária pra te convidar, ou crie sua própria imobiliária abaixo.')
    }
  }

  // Auto-check once on mount (cobre caso de usuário que já existia antes do convite)
  useEffect(() => {
    checkInvitation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate() {
    if (!form.legal_name.trim()) return
    setSaving(true)
    setError(null)
    const { error } = await saveOrg({
      legal_name: form.legal_name,
      trade_name: form.trade_name || null,
      cnpj: form.cnpj || null,
    })
    setSaving(false)
    if (error) {
      setError(error)
      return
    }
    setStep('done')
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 relative">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--border-strong)) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative w-full max-w-[460px] animate-slide-in-bottom">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo-icon.png"
            alt="Imob CRM"
            className="h-20 w-20 object-contain drop-shadow-sm"
          />
          <p className="text-base font-semibold tracking-tight mt-2">Imob CRM</p>
          <p className="text-xs text-muted-foreground">Configuração inicial</p>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-card p-6 sm:p-7">
          {step === 'intro' && (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Bem-vindo, {user?.email?.split('@')[0]}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Antes de começar, precisamos cadastrar sua imobiliária. Isso leva menos de 1 minuto.
              </p>

              <ul className="mt-5 space-y-2.5 text-sm">
                {[
                  'Seus dados ficam isolados: nenhum outro usuário consegue ver nada da sua imobiliária.',
                  'Você será cadastrado como administrador automaticamente.',
                  'Poderá editar todas as informações depois em Configurações → Empresa.',
                ].map((txt, i) => (
                  <li key={i} className="flex items-start gap-2 text-foreground">
                    <CheckCircle size={14} className="text-success mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{txt}</span>
                  </li>
                ))}
              </ul>

              <Button className="w-full mt-6" onClick={() => setStep('form')} rightIcon={<ArrowRight size={14} />}>
                Criar minha imobiliária
              </Button>

              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={checkInvitation}
                  loading={checkingInvite}
                  leftIcon={<Mail size={14} />}
                >
                  Já recebi um convite
                </Button>
                {inviteChecked && inviteMessage && (
                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    {inviteMessage}
                  </p>
                )}
              </div>

              <button
                onClick={() => signOut()}
                className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
              >
                <LogOut size={11} /> Sair
              </button>
            </>
          )}

          {step === 'form' && (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Cadastro rápido</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Só o essencial agora — você completa os outros dados depois.
              </p>

              <div className="mt-5 space-y-4">
                <Field label="Razão social *" hint="Nome registrado da sua empresa">
                  <Input
                    value={form.legal_name}
                    onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                    placeholder="Imobiliária Exemplo Ltda."
                    autoFocus
                  />
                </Field>
                <Field label="Nome fantasia" hint="Opcional — como os clientes te conhecem">
                  <Input
                    value={form.trade_name}
                    onChange={(e) => setForm((f) => ({ ...f, trade_name: e.target.value }))}
                    placeholder="Exemplo Imóveis"
                  />
                </Field>
                <Field label="CNPJ" hint="Opcional — você pode preencher depois">
                  <Input
                    value={form.cnpj}
                    onChange={(e) => setForm((f) => ({ ...f, cnpj: maskCNPJ(e.target.value) }))}
                    placeholder="00.000.000/0001-00"
                  />
                </Field>

                {error && (
                  <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('intro')}>Voltar</Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreate}
                    loading={saving}
                    disabled={!form.legal_name.trim()}
                  >
                    Criar imobiliária
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="h-12 w-12 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto">
                <CheckCircle size={20} />
              </div>
              <h1 className="text-lg font-semibold tracking-tight mt-4">Tudo pronto!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sua imobiliária foi criada. Redirecionando...
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          Logado como {user?.email}
        </p>
      </div>
    </div>
  )
}
