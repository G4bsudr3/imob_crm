import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function formatDateShort(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short',
  }).format(new Date(date))
}

export function formatTime(date: string | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

export const STATUS_LEAD_LABELS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  agendado: 'Agendado',
  descartado: 'Descartado',
  convertido: 'Convertido',
}

export const STATUS_LEAD_VARIANTS: Record<string, BadgeVariant> = {
  novo: 'info',
  em_contato: 'warning',
  agendado: 'primary',
  descartado: 'destructive',
  convertido: 'success',
}

export const STATUS_APPT_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  realizado: 'Realizado',
}

export const STATUS_APPT_VARIANTS: Record<string, BadgeVariant> = {
  agendado: 'info',
  confirmado: 'success',
  cancelado: 'destructive',
  realizado: 'neutral',
}

export const PROPERTY_TYPES: { key: string; label: string }[] = [
  { key: 'apartamento', label: 'Apartamento' },
  { key: 'casa', label: 'Casa' },
  { key: 'cobertura', label: 'Cobertura' },
  { key: 'studio', label: 'Studio' },
  { key: 'kitnet', label: 'Kitnet' },
  { key: 'loft', label: 'Loft' },
  { key: 'flat', label: 'Flat' },
  { key: 'sobrado', label: 'Sobrado' },
  { key: 'terreno', label: 'Terreno' },
  { key: 'galpao', label: 'Galpão' },
  { key: 'sala_comercial', label: 'Sala comercial' },
  { key: 'predio', label: 'Prédio' },
  { key: 'rural', label: 'Imóvel rural' },
  { key: 'outro', label: 'Outro' },
]

export const LISTING_PURPOSE_LABELS: Record<string, string> = {
  sale: 'Venda',
  rent: 'Aluguel',
  both: 'Venda e aluguel',
}

export const LISTING_STATUS_LABELS: Record<string, string> = {
  available: 'Disponível',
  reserved: 'Reservado',
  sold: 'Vendido',
  rented: 'Alugado',
}

export const LISTING_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'warning',
  sold: 'neutral',
  rented: 'info',
}

export const FURNISHED_LABELS: Record<string, string> = {
  furnished: 'Mobiliado',
  semi: 'Semimobiliado',
  unfurnished: 'Não mobiliado',
}

export const AMENITIES: { key: string; label: string }[] = [
  { key: 'pool', label: 'Piscina' },
  { key: 'gym', label: 'Academia' },
  { key: 'sauna', label: 'Sauna' },
  { key: 'barbecue', label: 'Churrasqueira' },
  { key: 'party_room', label: 'Salão de festas' },
  { key: 'playground', label: 'Playground' },
  { key: 'concierge_24h', label: 'Portaria 24h' },
  { key: 'elevator', label: 'Elevador' },
  { key: 'balcony', label: 'Varanda' },
  { key: 'gourmet_balcony', label: 'Varanda gourmet' },
  { key: 'ac', label: 'Ar condicionado' },
  { key: 'pet_friendly', label: 'Pet friendly' },
  { key: 'bike_rack', label: 'Bicicletário' },
  { key: 'great_view', label: 'Vista privilegiada' },
  { key: 'gourmet_space', label: 'Espaço gourmet' },
  { key: 'green_area', label: 'Ampla área verde' },
  { key: 'concierge_service', label: 'Concierge' },
  { key: 'coworking', label: 'Coworking' },
  { key: 'rooftop', label: 'Rooftop' },
  { key: 'wheelchair', label: 'Acessibilidade' },
]
