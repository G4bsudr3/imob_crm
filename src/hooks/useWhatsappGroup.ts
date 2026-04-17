import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from './useProfile'

export type WhatsappGroupInfo = {
  instance_name: string | null
  group_jid: string | null
  group_name: string | null
  group_created_at: string | null
  instance_status: string | null
}

export function useWhatsappGroup() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const [info, setInfo] = useState<WhatsappGroupInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchInfo = useCallback(async () => {
    if (!orgId) { setInfo(null); setLoading(false); return }
    setLoading(true)
    const { data } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: WhatsappGroupInfo[] | null }>)('get_my_org_whatsapp_group')
    const row = Array.isArray(data) ? data[0] : null
    setInfo(row ?? { instance_name: null, group_jid: null, group_name: null, group_created_at: null, instance_status: null })
    setLoading(false)
  }, [orgId])

  useEffect(() => { fetchInfo() }, [fetchInfo])

  // Realtime: atualiza quando whatsapp_instances muda
  useEffect(() => {
    if (!orgId) return
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    const ch = supabase
      .channel(`whatsapp-instance-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `organization_id=eq.${orgId}` }, () => { fetchInfo() })
      .subscribe()
    channelRef.current = ch
    return () => { supabase.removeChannel(ch); channelRef.current = null }
  }, [orgId, fetchInfo])

  async function invokeAction(action: string): Promise<{ ok: boolean; error?: string; data?: any }> {
    setBusy(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) return { ok: false, error: 'Sessão expirou. Faça login novamente.' }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-proxy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}`, data: json }
      await fetchInfo()
      return { ok: true, data: json }
    } finally {
      setBusy(false)
    }
  }

  const createGroup = useCallback(() => invokeAction('create_alerts_group'), [])
  const joinGroup = useCallback(() => invokeAction('join_alerts_group'), [])

  return { info, loading, busy, createGroup, joinGroup, refetch: fetchInfo }
}
