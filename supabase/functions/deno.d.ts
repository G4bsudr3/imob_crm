// Declarações ambiente para Edge Functions (runtime Deno).
// Evita errors de lint no VSCode sem exigir instalação da extensão Deno.

declare namespace Deno {
  export const env: {
    get(key: string): string | undefined
    set(key: string, value: string): void
    toObject(): Record<string, string>
  }

  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void

  export function serve(
    options: { port?: number; hostname?: string },
    handler: (req: Request) => Response | Promise<Response>,
  ): void
}

declare module 'jsr:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}

declare module 'jsr:@supabase/supabase-js@^2' {
  export * from '@supabase/supabase-js'
}
