import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Organization } from '../types/database'
import { useProfile } from './useProfile'

export function useOrganization() {
  const { profile, refetch: refetchProfile } = useProfile()
  const orgId = profile?.organization_id ?? null

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrg = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (!orgId) {
      setOrg(null)
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle()
    if (error) setError(error.message)
    else setOrg(data)
    setLoading(false)
  }, [orgId])

  async function saveOrg(patch: Partial<Organization>) {
    if (org?.id) {
      const { error } = await supabase.from('organizations').update(patch).eq('id', org.id)
      if (!error) await fetchOrg()
      return { error: error?.message ?? null }
    }
    const { error } = await supabase.from('organizations').insert(patch)
    if (!error) {
      // trigger on_organization_created linked the profile — refetch to pick up org_id
      await refetchProfile()
    }
    return { error: error?.message ?? null }
  }

  useEffect(() => { fetchOrg() }, [fetchOrg])

  return { org, loading, error, refetch: fetchOrg, saveOrg }
}
