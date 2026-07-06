'use client'

interface Props {
  loading: boolean
  text: string | null
  error: string | null
  onClose: () => void
}

export function ReportPreviewModal({ loading, text, error, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Pré-visualização do relatório</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Fechar
          </button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Gerando pré-visualização...</p>}

        {!loading && error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-4 text-sm text-foreground">
            {text}
          </pre>
        )}
      </div>
    </div>
  )
}
