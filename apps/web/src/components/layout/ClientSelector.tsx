'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { fetchClients } from '@/lib/queries/clients'
import { useActiveClientStore } from '@/stores/useActiveClientStore'
import { cn } from '@/lib/utils'

export function ClientSelector() {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const activeClientId = useActiveClientStore((s) => s.activeClientId)
  const activeClientName = useActiveClientStore((s) => s.activeClientName)
  const setActiveClient = useActiveClientStore((s) => s.setActiveClient)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: fetchClients,
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return clients
    return clients.filter((c) => c.name.toLowerCase().includes(term))
  }, [clients, search])

  return (
    <div className="relative">
      <label htmlFor="client-search" className="sr-only">
        Buscar cliente
      </label>
      <div className="relative">
        <input
          id="client-search"
          type="text"
          aria-label="Buscar cliente"
          placeholder={isLoading ? 'Carregando...' : 'Buscar cliente...'}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so click on a list item registers before closing.
            window.setTimeout(() => setOpen(false), 150)
          }}
          className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 pr-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {filtered.map((client) => {
            const isSelected = client.id === activeClientId
            return (
              <li
                key={client.id}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  // onMouseDown fires before input blur, so selection is kept.
                  e.preventDefault()
                  setActiveClient(client.id, client.name)
                  setSearch(client.name)
                  setOpen(false)
                }}
                className={cn(
                  'flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-muted',
                  isSelected && 'bg-muted'
                )}
              >
                <span className="truncate">{client.name}</span>
                {isSelected && <Check className="size-4 text-brand-600" />}
              </li>
            )
          })}
        </ul>
      )}

      {open && !isLoading && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          Nenhum cliente encontrado
        </div>
      )}

      {activeClientId && activeClientName && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-sm bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
            {activeClientName}
          </span>
        </div>
      )}
    </div>
  )
}
