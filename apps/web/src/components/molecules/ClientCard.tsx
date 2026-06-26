'use client'

import { useTransition, useState } from 'react'
import Link from 'next/link'
import type { Client } from '@advezo/types'
import { archiveClient } from '@/app/actions/clients'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ClientCardProps {
  client: Client
}

export function ClientCard({ client }: ClientCardProps) {
  const initial = client.name.charAt(0).toUpperCase()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleArchive() {
    startTransition(async () => {
      await archiveClient(client.id)
      setOpen(false)
    })
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-card-foreground">{client.name}</p>
        {client.contact_email && (
          <p className="truncate text-sm text-muted-foreground">
            {client.contact_email}
          </p>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <Link
          href={`/clients/${client.id}/edit`}
          className="rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Editar
        </Link>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            className="rounded px-2 py-1 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            Arquivar
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar cliente?</AlertDialogTitle>
              <AlertDialogDescription>
                O cliente ficará oculto e pode ser restaurado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchive}
                disabled={isPending}
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
              >
                {isPending ? 'Arquivando...' : 'Arquivar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
