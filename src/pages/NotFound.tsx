import { Link } from 'react-router-dom'
import { Home, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="h-14 w-14 rounded-full bg-warning-soft text-warning flex items-center justify-center mx-auto">
          <AlertCircle size={22} />
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight mt-5">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          O endereço que você tentou acessar não existe ou foi movido. Verifique o link ou volte para o dashboard.
        </p>
        <div className="mt-6">
          <Link to="/">
            <Button variant="primary" leftIcon={<Home size={14} />}>
              Voltar ao dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
