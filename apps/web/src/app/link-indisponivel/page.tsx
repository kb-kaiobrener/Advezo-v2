/** Página de link inativo — Story 4.3 (AC 4.3.5). Pública, sem sessão. */
export default function LinkIndisponivelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-foreground">Link indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este link foi desativado. Entre em contato com quem o compartilhou para
          receber um novo endereço.
        </p>
      </div>
    </div>
  )
}
