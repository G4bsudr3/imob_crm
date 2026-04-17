import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WhatsappInstance } from '../types/database'
import { useProfile } from './useProfile'

const ACTIVE_STATES = new Set(['qrcode', 'connecting', 'connected'])

type ProxyResponse = {
  status?: 'qrcode' | 'connecting' | 'connected' | 'disconnected'
  qrcode?: string | null
  connected_number?: string | null
  error?: string
}

async function invokeProxy(action: 'connect' | 'status' | 'disconnect' | 'delete' | 'restart'): Promise<ProxyResponse> {
  // 1. Verifica se há sessão
  const { data: sessionData } = await supabase.auth.getSession()
  let session = sessionData.session
  if (!session) {
    return { error: 'Sessão expirada. Faça login novamente.' }
  }

  // 2. Se access_token expira em < 60s, força refresh
  const expiresAt = session.expires_at ?? 0
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt - now < 60) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr || !refreshed.session) {
      return { error: 'Sessão expirada. Faça login novamente.' }
    }
    session = refreshed.session
  }

  // 3. Invoke — supabase-js v2 anexa automaticamente o JWT da sessão atual
  const { data, error } = await supabase.functions.invoke('evolution-proxy', {
    body: { action },
  })

  if (error) {
    const msg = error.message?.toLowerCase() ?? ''
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('jwt')) {
      return { error: 'Sessão inválida. Faça logout e login novamente.' }
    }
    return { error: error.message }
  }
  return (data ?? {}) as ProxyResponse
}

export function useWhatsapp() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null

  const [instance, setInstance] = useState<WhatsappInstance | null>(null)
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)

  const fetchInstance = useCallback(async () => {
    if (!orgId) {
      setInstance(null)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle()
    setInstance(data)
    setLoading(false)
    return data
  }, [orgId])

  // Na montagem: carrega do DB e, se houver instance em estado transiente,
  // força sync com Evolution pra pegar estado real (caso polling tenha parado
  // antes de detectar 'connected')
  const syncedRef = useRef(false)
  useEffect(() => {
    if (!orgId) return
    syncedRef.current = false
    ;(async () => {
      const data = await fetchInstance()
      if (!syncedRef.current && data && ACTIVE_STATES.has(data.status)) {
        syncedRef.current = true
        await invokeProxy('status').catch(() => {})
        await fetchInstance()
      }
    })()
  }, [orgId, fetchInstance])

  function stopPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  function startPolling(onConnected: () => void) {
    stopPolling()
    pollingRef.current = window.setInterval(async () => {
      const res = await invokeProxy('status')
      if (res.status === 'connected') {
        setQrcode(null)
        await fetchInstance()
        onConnected()
        stopPolling()
      }
    }, 3000)
  }

  // QR expira ~20s — renova a cada 25s enquanto no modo qrcode
  const qrRefreshRef = useRef<number | null>(null)
  function startQrRefresh() {
    stopQrRefresh()
    qrRefreshRef.current = window.setInterval(async () => {
      const res = await invokeProxy('connect')
      if (res.qrcode) setQrcode(res.qrcode)
    }, 25000)
  }
  function stopQrRefresh() {
    if (qrRefreshRef.current) {
      window.clearInterval(qrRefreshRef.current)
      qrRefreshRef.current = null
    }
  }

  useEffect(() => () => { stopPolling(); stopQrRefresh() }, [])

  async function connect() {
    setActionLoading('connect')
    setError(null)
    const res = await invokeProxy('connect')
    setActionLoading(null)
    if (res.error) {
      setError(res.error)
      return
    }
    if (res.qrcode) setQrcode(res.qrcode)
    await fetchInstance()
    startPolling(() => fetchInstance())
    startQrRefresh()
  }

  async function disconnect() {
    setActionLoading('disconnect')
    setError(null)
    stopPolling()
    stopQrRefresh()
    const res = await invokeProxy('disconnect')
    setActionLoading(null)
    setQrcode(null)
    if (res.error) setError(res.error)
    await fetchInstance()
  }

  async function reset() {
    setActionLoading('reset')
    setError(null)
    stopPolling()
    stopQrRefresh()
    const res = await invokeProxy('delete')
    setActionLoading(null)
    setQrcode(null)
    if (res.error) setError(res.error)
    await fetchInstance()
  }

  async function restart() {
    setActionLoading('restart')
    setError(null)
    const res = await invokeProxy('restart')
    setActionLoading(null)
    if (res.error) setError(res.error)
    await fetchInstance()
  }

  function cancelQr() {
    stopPolling()
    stopQrRefresh()
    setQrcode(null)
  }

  return {
    instance,
    qrcode,
    loading,
    actionLoading,
    error,
    connect,
    disconnect,
    reset,
    restart,
    cancelQr,
    refetch: fetchInstance,
  }
}
