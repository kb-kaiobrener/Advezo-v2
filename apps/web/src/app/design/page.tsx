import { notFound } from 'next/navigation'
import { Users, LayoutDashboard } from 'lucide-react'
import { StatusBadge } from '@/components/atoms/StatusBadge'
import { PlatformIcon } from '@/components/atoms/PlatformIcon'
import { HealthBar } from '@/components/atoms/HealthBar'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { EmptyState } from '@/components/molecules/EmptyState'

export default function DesignPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-12">
      <h1 className="text-3xl font-bold text-gray-900">Advezo Design System</h1>

      {/* ── Brand Colors ──────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Brand Colors</h2>
        <div className="flex gap-2 flex-wrap">
          {([50, 100, 200, 500, 600, 700, 800, 900] as const).map((shade) => (
            <div key={shade} className="flex flex-col items-center gap-1">
              <div className={`size-12 rounded-lg bg-brand-${shade} border border-gray-200`} />
              <span className="text-xs text-gray-600">{shade}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Health Tokens ──────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Health Status Colors</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="size-6 rounded-full bg-health-good" />
            <div className="size-6 rounded-full bg-health-good-bg" />
            <span className="text-health-good-text text-sm font-medium">Good — #16A34A / bg #DCFCE7 / text #15803D</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="size-6 rounded-full bg-health-warning" />
            <div className="size-6 rounded-full bg-health-warning-bg" />
            <span className="text-health-warning-text text-sm font-medium">Warning — #D97706 / bg #FEF9C3 / text #B45309</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="size-6 rounded-full bg-health-critical" />
            <div className="size-6 rounded-full bg-health-critical-bg" />
            <span className="text-health-critical-text text-sm font-medium">Critical — #DC2626 / bg #FEE2E2 / text #B91C1C</span>
          </div>
        </div>
      </section>

      {/* ── Platform Colors ────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Platform Colors</h2>
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-1">
            <div className="size-8 rounded-full bg-platform-meta" />
            <span className="text-xs">Meta</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="size-8 rounded-full bg-platform-google" />
            <span className="text-xs">Google</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="size-8 rounded-full bg-platform-whatsapp" />
            <span className="text-xs">WhatsApp</span>
          </div>
        </div>
      </section>

      {/* ── StatusBadge ─────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">StatusBadge</h2>
        <div className="flex gap-3">
          <StatusBadge status="good" />
          <StatusBadge status="warning" />
          <StatusBadge status="critical" />
        </div>
      </section>

      {/* ── PlatformIcon ────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">PlatformIcon</h2>
        <div className="flex items-center gap-6">
          {(['meta', 'google', 'whatsapp'] as const).map((p) => (
            <div key={p} className="flex flex-col items-center gap-2">
              <PlatformIcon platform={p} size="sm" />
              <PlatformIcon platform={p} size="md" />
              <PlatformIcon platform={p} size="lg" />
              <span className="text-xs text-gray-500 capitalize">{p}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── HealthBar ───────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">HealthBar</h2>
        <div className="space-y-3 max-w-sm">
          <HealthBar value={85} showLabel />
          <HealthBar value={55} showLabel />
          <HealthBar value={25} showLabel />
          <HealthBar value={0} showLabel />
          <HealthBar value={100} showLabel />
        </div>
      </section>

      {/* ── LoadingSpinner ──────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">LoadingSpinner</h2>
        <div className="flex items-center gap-6">
          <LoadingSpinner size="sm" />
          <LoadingSpinner size="md" />
          <LoadingSpinner size="lg" />
        </div>
      </section>

      {/* ── EmptyState ──────────────────────────────── */}
      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">EmptyState</h2>
        <div className="border rounded-xl">
          <EmptyState
            icon={Users}
            title="Nenhum cliente cadastrado"
            subtitle="Adicione seu primeiro cliente para começar a gerenciar suas campanhas."
            action={{ label: 'Adicionar cliente', href: '/clients/new' }}
          />
        </div>
        <div className="border rounded-xl mt-4">
          <EmptyState
            icon={LayoutDashboard}
            title="Dashboard vazio"
            subtitle="Conecte uma conta de anúncios para ver os indicadores."
          />
        </div>
      </section>
    </div>
  )
}
