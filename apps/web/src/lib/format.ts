// Formatadores PT-BR puros (originalmente AC 3.4.3, extraídos na Story 3.8).
//
// EXTRAÇÃO INTENCIONAL: este módulo não pode importar NADA que puxe o barrel
// @advezo/database — ele entra em bundle de Client Components (ClientePanel via
// lib/dashboard/metrics). O barrel arrasta server.ts (next/headers), que quebra
// a compilação de qualquer segmento client que o alcance transitivamente.

const currencyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const numberFmt = new Intl.NumberFormat('pt-BR')
const percentFmt = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatBRL(n: number): string {
  return currencyFmt.format(n)
}

export function formatNumber(n: number): string {
  return numberFmt.format(n)
}

export function formatPercent(ratio: number): string {
  return percentFmt.format(ratio)
}

export function formatMultiplier(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}x`
}
