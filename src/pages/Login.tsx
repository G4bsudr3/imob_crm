import { useEffect, useState } from 'react'
import { Mail, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Input'
import { OtpInput } from '../components/ui/OtpInput'

type Step = 'email' | 'otp'

const RESEND_COOLDOWN = 30

export function Login() {
  const { sendOtp, verifyOtp } = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email) return
    setSending(true)
    setError(null)
    const { error } = await sendOtp(email.trim())
    setSending(false)
    if (error) {
      setError(error)
      return
    }
    setStep('otp')
    setCooldown(RESEND_COOLDOWN)
  }

  async function handleVerify(token: string) {
    setVerifying(true)
    setError(null)
    const { error } = await verifyOtp(email.trim(), token)
    setVerifying(false)
    if (error) {
      setError(error)
      setCode('')
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    const { error } = await sendOtp(email.trim())
    if (!error) {
      setResent(true)
      setCooldown(RESEND_COOLDOWN)
      setTimeout(() => setResent(false), 3000)
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--border-strong)) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative w-full max-w-[400px] animate-slide-in-bottom">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/logo-icon.png"
            alt="Imob CRM"
            className="h-20 w-20 object-contain drop-shadow-sm"
          />
          <p className="text-base font-semibold tracking-tight mt-2">Imob CRM</p>
          <p className="text-xs text-muted-foreground">Gestão de leads e agendamentos</p>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-card p-6 sm:p-7">
          {step === 'email' && (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-semibold tracking-tight">Entrar na sua conta</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Digite seu email e enviaremos um código de 6 dígitos.
                </p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <Field label="Email">
                  <Input
                    type="email"
                    placeholder="voce@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftIcon={<Mail size={14} />}
                    autoFocus
                    required
                  />
                </Field>

                {error && (
                  <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <Button type="submit" className="w-full" loading={sending} disabled={!email}>
                  Continuar
                </Button>
              </form>

              <p className="text-[11px] text-muted-foreground text-center mt-6 leading-relaxed">
                Ao continuar, você concorda com os termos de uso e a política de privacidade.
              </p>
            </>
          )}

          {step === 'otp' && (
            <div className="animate-fade-in">
              <button
                onClick={() => { setStep('email'); setCode(''); setError(null); setCooldown(0) }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft size={12} /> Trocar email
              </button>

              <div className="mb-6">
                <h1 className="text-lg font-semibold tracking-tight">Verifique seu email</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Enviamos um código para <span className="font-medium text-foreground">{email}</span>.
                </p>
              </div>

              <div className="space-y-4">
                <OtpInput
                  value={code}
                  onChange={setCode}
                  disabled={verifying}
                  autoFocus
                  onComplete={handleVerify}
                />

                {error && (
                  <div className="flex items-start gap-2 text-xs text-destructive bg-destructive-soft border border-destructive/20 rounded-lg p-3">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <Button
                  onClick={() => handleVerify(code)}
                  className="w-full"
                  loading={verifying}
                  disabled={code.length !== 6}
                >
                  Verificar e entrar
                </Button>

                <div className="text-center">
                  {resent ? (
                    <p className="text-xs text-success flex items-center justify-center gap-1">
                      <CheckCircle size={12} /> Código reenviado
                    </p>
                  ) : cooldown > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Reenviar em <span className="tabular font-medium">{cooldown}s</span>
                    </p>
                  ) : (
                    <button
                      onClick={handleResend}
                      className="text-xs text-primary hover:underline transition-colors"
                    >
                      Não recebeu? Reenviar código
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          Protegido por Supabase Auth · OTP por email
        </p>
      </div>
    </div>
  )
}
