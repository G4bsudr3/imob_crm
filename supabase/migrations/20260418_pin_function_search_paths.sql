-- Security hardening: pin search_path on functions to prevent search-path hijack attacks.
-- Addresses Supabase linter WARN 0011 (function_search_path_mutable).

ALTER FUNCTION public.normalize_cnpj_trigger() SET search_path = public;
ALTER FUNCTION public.unaccent_lower(text) SET search_path = public;
