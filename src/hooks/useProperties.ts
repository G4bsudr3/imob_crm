import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Property } from '../types/database'
import { useProfile } from './useProfile'

export type PropertyInput = {
  // basic
  title: string
  type: string
  listing_purpose: string
  listing_status: string
  ref_code: string | null
  featured: boolean
  // financial
  price: number | null
  rent_price: number | null
  condo_fee: number | null
  iptu: number | null
  accepts_financing: boolean
  accepts_fgts: boolean
  accepts_exchange: boolean
  // address
  address_zip: string | null
  location: string
  address_number: string | null
  address_complement: string | null
  neighborhood: string | null
  city: string
  address_state: string | null
  // dimensions
  area_m2: number | null
  total_area_m2: number | null
  bedrooms: number | null
  suites: number | null
  bathrooms: number | null
  parking_spots: number | null
  floor: number | null
  year_built: number | null
  // condition
  furnished: string | null
  amenities: string[]
  // media
  description: string | null
  video_url: string | null
  virtual_tour_url: string | null
  listing_url: string | null
  // internal
  internal_notes: string | null
}

const PAGE_SIZE = 50

export function useProperties() {
  const { profile } = useProfile()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  async function fetchProperties() {
    setLoading(true)
    const { data, count } = await supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    setProperties(data ?? [])
    setHasMore((count ?? 0) > PAGE_SIZE)
    setLoading(false)
  }

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    const { data } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
      .range(properties.length, properties.length + PAGE_SIZE - 1)
    setProperties((prev) => [...prev, ...(data ?? [])])
    setHasMore((data ?? []).length === PAGE_SIZE)
    setLoadingMore(false)
  }

  async function createProperty(input: PropertyInput): Promise<{ error: any; id?: string }> {
    if (!profile?.organization_id) return { error: { message: 'Usuário sem organização' } }
    const { data, error } = await supabase.from('properties').insert({
      ...input,
      organization_id: profile.organization_id,
    }).select('id').single()
    if (!error) fetchProperties()
    return { error, id: data?.id }
  }

  async function updateProperty(id: string, patch: Partial<PropertyInput>) {
    const { error } = await supabase.from('properties').update(patch).eq('id', id)
    if (!error) fetchProperties()
    return error
  }

  async function updateStatus(id: string, listing_status: string) {
    const { error } = await supabase.from('properties').update({ listing_status }).eq('id', id)
    if (!error) fetchProperties()
    return error
  }

  async function deleteProperty(id: string) {
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (!error) fetchProperties()
    return error
  }

  useEffect(() => { fetchProperties() }, [profile?.organization_id])

  return {
    properties, loading, loadingMore, hasMore,
    refetch: fetchProperties,
    loadMore,
    createProperty,
    updateProperty,
    updateStatus,
    deleteProperty,
  }
}
