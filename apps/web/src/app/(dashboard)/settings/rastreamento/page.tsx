import { createSupabaseServerClient, createSupabaseServiceClient } from '@advezo/database'
import { ThresholdForm } from '@/components/molecules/ThresholdForm'

/** Configurações → Rastreamento — Story 5.6. */
export default async function RastreamentoSettingsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const service = createSupabaseServiceClient()
  const { data: membership } = await service
    .from('workspace_members').select('workspace_id').eq('user_id', user?.id ?? '').limit(1).maybeSingle()
  const { data: settings } = await service
    .from('workspace_settings')
    .select('classification_confidence_threshold')
    .eq('workspace_id', membership?.workspace_id ?? '')
    .maybeSingle()

  return (
    <div className="mx-auto max-w-lg px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Configurações → Rastreamento</h1>
      <ThresholdForm initial={Number(settings?.classification_confidence_threshold ?? 0.7)} />
    </div>
  )
}
