import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from './useProfile'

export type CalendarIntegration = {
  id: string
  user_id: string
  provider: 'google'
  google_email: string | null
  calendar_id: string
  connected_at: string
  last_error: string | null
}

export function useCalendarIntegration() {
  const { profile } = useProfile()
  const userId = profile?.id ?? null
  const [integration, setIntegration] = useState<CalendarIntegration | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const popupRef = useRef<Window | null>(null)

  const fetchIntegration = useCallback(async () => {
    if (!userId) {
      setIntegration(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('calendar_integrations')
      .select('id, user_id, provider, google_email, calendar_id, connected_at, last_error')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle()
    setIntegration((data as CalendarIntegration | null) ?? null)
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchIntegration() }, [fetchIntegration])

  const connect = useCallback(async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const accessToken = sess.session?.access_token
      if (!accessToken) {
        throw new Error('Sessão expirou. Faça login novamente.')
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-init`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            'Content-Type': 'application/json',
          },
        },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Falha ao iniciar OAuth: ${text}`)
      }
      const { auth_url } = await res.json() as { auth_url: string }

      // Abre popup centralizado
      const width = 500
      const height = 640
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      popupRef.current = window.open(
        auth_url,
        'google-oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      )

      // Escuta mensagem do callback
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', onMessage)
          reject(new Error('Tempo esgotado. Tente de novo.'))
        }, 5 * 60_000)

        function onMessage(e: MessageEvent) {
          if (!e.data || e.data.type !== 'imob-google-oauth') return
          clearTimeout(timeout)
          window.removeEventListener('message', onMessage)
          if (e.data.status === 'success') resolve()
          else reject(new Error('Autorização foi cancelada ou falhou.'))
        }

        window.addEventListener('message', onMessage)

        // Detecta popup fechado sem sucesso
        const poll = setInterval(() => {
          if (popupRef.current && popupRef.current.closed) {
            clearInterval(poll)
            setTimeout(() => {
              window.removeEventListener('message', onMessage)
              clearTimeout(timeout)
            }, 1500)
          }
        }, 500)
      })

      await fetchIntegration()
    } finally {
      setConnecting(false)
    }
  }, [connecting, fetchIntegration])

  const disconnect = useCallback(async () => {
    if (!integration) return
    const { error } = await supabase
      .from('calendar_integrations')
      .delete()
      .eq('id', integration.id)
    if (!error) setIntegration(null)
    return error?.message ?? null
  }, [integration])

  return { integration, loading, connecting, connect, disconnect, refetch: fetchIntegration }
}
