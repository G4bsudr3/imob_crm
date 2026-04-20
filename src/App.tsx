import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Layout } from './components/layout/Layout'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Leads = lazy(() => import('./pages/Leads').then((m) => ({ default: m.Leads })))
const Agendamentos = lazy(() => import('./pages/Agendamentos').then((m) => ({ default: m.Agendamentos })))
const Imoveis = lazy(() => import('./pages/Imoveis').then((m) => ({ default: m.Imoveis })))
const BotConfig = lazy(() => import('./pages/BotConfig').then((m) => ({ default: m.BotConfig })))
const Negocios = lazy(() => import('./pages/Negocios').then((m) => ({ default: m.Negocios })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Onboarding = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.Onboarding })))
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="h-5 w-5 rounded-full border-2 border-foreground border-r-transparent animate-spin" />
    </div>
  )
}

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="h-5 w-5 rounded-full border-2 border-foreground border-r-transparent animate-spin" />
    </div>
  )
}

export default function App() {
  const { session, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading, hasOrg } = useProfile()

  if (authLoading) return <LoadingScreen />
  if (!session) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Login />
      </Suspense>
    )
  }
  if (profileLoading && !profile) return <LoadingScreen />
  if (!hasOrg) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Onboarding />
      </Suspense>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/agendamentos" element={<Agendamentos />} />
            <Route path="/negocios" element={<Negocios />} />
            <Route path="/imoveis" element={<Imoveis />} />
            <Route path="/bot" element={<BotConfig />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
