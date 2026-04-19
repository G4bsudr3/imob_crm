export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          property_id: string | null
          scheduled_at: string
          status: string
          updated_at: string
          organization_id: string | null
          google_event_id: string | null
          google_calendar_user_id: string | null
          reminder_24h_sent_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          property_id?: string | null
          scheduled_at: string
          status?: string
          updated_at?: string
          organization_id?: string | null
          google_event_id?: string | null
          google_calendar_user_id?: string | null
          reminder_24h_sent_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          property_id?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          organization_id?: string | null
          google_event_id?: string | null
          google_calendar_user_id?: string | null
          reminder_24h_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          }
        ]
      }
      bot_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          persona: string | null
          mensagem_agendamento: string
          triagem_localizacao: string
          triagem_orcamento: string
          triagem_quartos: string
          triagem_tipo: string
          updated_at: string
          welcome_message: string
          business_hours_enabled: boolean
          business_hours_start: string
          business_hours_end: string
          outside_hours_message: string
          farewell_message: string
          no_properties_message: string
          max_properties_shown: number
          organization_id: string | null
          can_schedule: boolean
          can_escalate: boolean
          can_negotiate_price: boolean
          show_listing_links: boolean
          communication_style: string
          company_differentials: string | null
          service_areas: string | null
          auto_assign: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          persona?: string | null
          mensagem_agendamento?: string
          triagem_localizacao?: string
          triagem_orcamento?: string
          triagem_quartos?: string
          triagem_tipo?: string
          updated_at?: string
          welcome_message?: string
          business_hours_enabled?: boolean
          business_hours_start?: string
          business_hours_end?: string
          outside_hours_message?: string
          farewell_message?: string
          no_properties_message?: string
          max_properties_shown?: number
          organization_id?: string | null
          can_schedule?: boolean
          can_escalate?: boolean
          can_negotiate_price?: boolean
          show_listing_links?: boolean
          communication_style?: string
          company_differentials?: string | null
          service_areas?: string | null
          auto_assign?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          persona?: string | null
          mensagem_agendamento?: string
          triagem_localizacao?: string
          triagem_orcamento?: string
          triagem_quartos?: string
          triagem_tipo?: string
          updated_at?: string
          welcome_message?: string
          business_hours_enabled?: boolean
          business_hours_start?: string
          business_hours_end?: string
          outside_hours_message?: string
          farewell_message?: string
          no_properties_message?: string
          max_properties_shown?: number
          organization_id?: string | null
          can_schedule?: boolean
          can_escalate?: boolean
          can_negotiate_price?: boolean
          show_listing_links?: boolean
          communication_style?: string
          company_differentials?: string | null
          service_areas?: string | null
          auto_assign?: boolean
        }
        Relationships: []
      }
      calendar_integrations: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          provider: string
          google_email: string | null
          calendar_id: string
          access_token: string | null
          refresh_token: string
          expires_at: string | null
          scope: string | null
          last_error: string | null
          connected_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          provider?: string
          google_email?: string | null
          calendar_id?: string
          access_token?: string | null
          refresh_token: string
          expires_at?: string | null
          scope?: string | null
          last_error?: string | null
          connected_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string
          provider?: string
          google_email?: string | null
          calendar_id?: string
          access_token?: string | null
          refresh_token?: string
          expires_at?: string | null
          scope?: string | null
          last_error?: string | null
          connected_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          state: string
          user_id: string
          organization_id: string
          provider: string
          created_at: string
        }
        Insert: {
          state: string
          user_id: string
          organization_id: string
          provider?: string
          created_at?: string
        }
        Update: {
          state?: string
          user_id?: string
          organization_id?: string
          provider?: string
          created_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: number
          organization_id: string | null
          actor_id: string | null
          actor_email: string | null
          action: string
          target_type: string | null
          target_id: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: number
          organization_id?: string | null
          actor_id?: string | null
          actor_email?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          organization_id: string
          instance_name: string
          status: string
          connected_number: string | null
          last_qr_at: string | null
          last_connection_at: string | null
          last_error: string | null
          welcome_sent_at: string | null
          created_at: string
          updated_at: string
          group_jid: string | null
          group_name: string | null
          group_created_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          organization_id: string
          instance_name: string
          status?: string
          connected_number?: string | null
          last_qr_at?: string | null
          last_connection_at?: string | null
          last_error?: string | null
          welcome_sent_at?: string | null
          created_at?: string
          updated_at?: string
          group_jid?: string | null
          group_name?: string | null
          group_created_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          organization_id?: string
          instance_name?: string
          status?: string
          connected_number?: string | null
          last_qr_at?: string | null
          last_connection_at?: string | null
          last_error?: string | null
          welcome_sent_at?: string | null
          created_at?: string
          updated_at?: string
          group_jid?: string | null
          group_name?: string | null
          group_created_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      property_photos: {
        Row: {
          id: string
          property_id: string
          organization_id: string
          storage_path: string
          url: string
          display_order: number
          is_cover: boolean
          created_at: string
        }
        Insert: {
          id?: string
          property_id: string
          organization_id: string
          storage_path: string
          url: string
          display_order?: number
          is_cover?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          property_id?: string
          organization_id?: string
          storage_path?: string
          url?: string
          display_order?: number
          is_cover?: boolean
          created_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          direction: string
          id: string
          lead_id: string
          message: string
          sent_at: string
          organization_id: string | null
          ai_tool_used: string | null
          ai_tokens_used: number | null
          ai_tool_output: unknown | null
          whatsapp_message_id: string | null
        }
        Insert: {
          direction: string
          id?: string
          lead_id: string
          message: string
          sent_at?: string
          organization_id?: string | null
          ai_tool_used?: string | null
          ai_tokens_used?: number | null
          ai_tool_output?: unknown | null
          whatsapp_message_id?: string | null
        }
        Update: {
          direction?: string
          id?: string
          lead_id?: string
          message?: string
          sent_at?: string
          organization_id?: string | null
          ai_tool_used?: string | null
          ai_tokens_used?: number | null
          ai_tool_output?: unknown | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          }
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          bedrooms_needed: number | null
          budget_max: number | null
          budget_min: number | null
          created_at: string
          id: string
          location_interest: string | null
          name: string | null
          phone: string
          profile_notes: string | null
          property_type: string | null
          status: string
          updated_at: string
          whatsapp_id: string | null
          organization_id: string | null
          last_message_at: string | null
          source: string | null
          source_detail: string | null
          email: string | null
          name_confirmed: boolean
          bot_paused: boolean
          bot_paused_at: string | null
          bot_paused_reason: string | null
          deal_type: string | null
          deal_value: number | null
          deal_closed_at: string | null
          deal_property_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          bedrooms_needed?: number | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          id?: string
          location_interest?: string | null
          name?: string | null
          phone: string
          profile_notes?: string | null
          property_type?: string | null
          status?: string
          updated_at?: string
          whatsapp_id?: string | null
          organization_id?: string | null
          last_message_at?: string | null
          source?: string | null
          source_detail?: string | null
          email?: string | null
          name_confirmed?: boolean
          bot_paused?: boolean
          bot_paused_at?: string | null
          bot_paused_reason?: string | null
          deal_type?: string | null
          deal_value?: number | null
          deal_closed_at?: string | null
          deal_property_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          bedrooms_needed?: number | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          id?: string
          location_interest?: string | null
          name?: string | null
          phone?: string
          profile_notes?: string | null
          property_type?: string | null
          status?: string
          updated_at?: string
          whatsapp_id?: string | null
          organization_id?: string | null
          last_message_at?: string | null
          source?: string | null
          source_detail?: string | null
          email?: string | null
          name_confirmed?: boolean
          bot_paused?: boolean
          bot_paused_at?: string | null
          bot_paused_reason?: string | null
          deal_type?: string | null
          deal_value?: number | null
          deal_closed_at?: string | null
          deal_property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
          role: string
          email: string | null
          phone: string | null
          avatar_url: string | null
          updated_at: string
          organization_id: string | null
          last_assigned_at: string | null
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
          role?: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          updated_at?: string
          organization_id?: string | null
          last_assigned_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          role?: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          updated_at?: string
          organization_id?: string | null
          last_assigned_at?: string | null
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role: string
          invited_by: string | null
          accepted_at: string | null
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          email: string
          role?: string
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          email?: string
          role?: string
          invited_by?: string | null
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      organizations: {
        Row: {
          id: string
          legal_name: string | null
          trade_name: string | null
          cnpj: string | null
          state_registration: string | null
          creci: string | null
          email: string | null
          phone: string | null
          website: string | null
          logo_url: string | null
          address_zip: string | null
          address_street: string | null
          address_number: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_city: string | null
          address_state: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          legal_name?: string | null
          trade_name?: string | null
          cnpj?: string | null
          state_registration?: string | null
          creci?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          logo_url?: string | null
          address_zip?: string | null
          address_street?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          legal_name?: string | null
          trade_name?: string | null
          cnpj?: string | null
          state_registration?: string | null
          creci?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          logo_url?: string | null
          address_zip?: string | null
          address_street?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_city?: string | null
          address_state?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          area_m2: number | null
          available: boolean
          bathrooms: number | null
          bedrooms: number | null
          city: string
          created_at: string
          description: string | null
          id: string
          location: string
          neighborhood: string | null
          price: number | null
          title: string
          type: string
          updated_at: string
          organization_id: string | null
          listing_purpose: string | null
          listing_status: string | null
          ref_code: string | null
          featured: boolean
          internal_notes: string | null
          rent_price: number | null
          condo_fee: number | null
          iptu: number | null
          accepts_financing: boolean
          accepts_fgts: boolean
          accepts_exchange: boolean
          total_area_m2: number | null
          suites: number | null
          parking_spots: number | null
          floor: number | null
          year_built: number | null
          furnished: string | null
          amenities: string[]
          address_zip: string | null
          address_number: string | null
          address_complement: string | null
          address_state: string | null
          video_url: string | null
          virtual_tour_url: string | null
          listing_url: string | null
        }
        Insert: {
          area_m2?: number | null
          available?: boolean
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string
          created_at?: string
          description?: string | null
          id?: string
          location: string
          neighborhood?: string | null
          price?: number | null
          title: string
          type: string
          updated_at?: string
          organization_id?: string | null
          listing_purpose?: string | null
          listing_status?: string | null
          ref_code?: string | null
          featured?: boolean
          internal_notes?: string | null
          rent_price?: number | null
          condo_fee?: number | null
          iptu?: number | null
          accepts_financing?: boolean
          accepts_fgts?: boolean
          accepts_exchange?: boolean
          total_area_m2?: number | null
          suites?: number | null
          parking_spots?: number | null
          floor?: number | null
          year_built?: number | null
          furnished?: string | null
          amenities?: string[]
          address_zip?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_state?: string | null
          video_url?: string | null
          virtual_tour_url?: string | null
          listing_url?: string | null
        }
        Update: {
          area_m2?: number | null
          available?: boolean
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string
          neighborhood?: string | null
          price?: number | null
          title?: string
          type?: string
          updated_at?: string
          organization_id?: string | null
          listing_purpose?: string | null
          listing_status?: string | null
          ref_code?: string | null
          featured?: boolean
          internal_notes?: string | null
          rent_price?: number | null
          condo_fee?: number | null
          iptu?: number | null
          accepts_financing?: boolean
          accepts_fgts?: boolean
          accepts_exchange?: boolean
          total_area_m2?: number | null
          suites?: number | null
          parking_spots?: number | null
          floor?: number | null
          year_built?: number | null
          furnished?: string | null
          amenities?: string[]
          address_zip?: string | null
          address_number?: string | null
          address_complement?: string | null
          address_state?: string | null
          video_url?: string | null
          virtual_tour_url?: string | null
          listing_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helpers de tipo
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Lead = Tables<'leads'>
export type Property = Tables<'properties'>
export type Appointment = Tables<'appointments'>
export type Conversation = Tables<'conversations'>
export type BotConfig = Tables<'bot_config'>
export type Profile = Tables<'profiles'>
export type Organization = Tables<'organizations'>
export type OrganizationInvitation = Tables<'organization_invitations'>
export type WhatsappInstance = Tables<'whatsapp_instances'>
export type CalendarIntegrationRow = Tables<'calendar_integrations'>
export type PropertyPhoto = Tables<'property_photos'>
