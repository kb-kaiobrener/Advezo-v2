// Helpers puros de agendamento de relatórios (Story 3.5).
// Todas as contas usam UTC — o cron do Vercel roda em UTC e send_time é
// interpretado como hora UTC (documentado na UI da Story 3.3).

export interface ScheduleTiming {
  frequency: string
  send_day: number | null
  send_time: string // 'HH:MM' ou 'HH:MM:SS'
}

/** Retorna true se o schedule deve disparar na hora `now` (UTC). */
export function scheduleShouldFireNow(schedule: ScheduleTiming, now: Date): boolean {
  const [sendHour] = schedule.send_time.split(':').map(Number)
  if (now.getUTCHours() !== sendHour) return false

  switch (schedule.frequency) {
    case 'daily':
      return true
    case 'weekly':
      return now.getUTCDay() === schedule.send_day
    case 'biweekly': {
      if (now.getUTCDay() !== schedule.send_day) return false
      // Dispara em semanas pares desde o início do ano (paridade estável entre runs)
      return weekOfYear(now) % 2 === 0
    }
    case 'monthly':
      return now.getUTCDate() === schedule.send_day
    default:
      return false
  }
}

/** Retorna period_start/period_end (ISO YYYY-MM-DD) do período vigente do relatório. */
export function computePeriod(
  frequency: string,
  now: Date
): { period_start: string; period_end: string } {
  const today = toISODate(now)

  switch (frequency) {
    case 'daily':
      return { period_start: today, period_end: today }

    case 'weekly':
      return { period_start: toISODate(mondayOf(now)), period_end: today }

    case 'biweekly': {
      const monday = mondayOf(now)
      const blockStart = new Date(monday)
      // Bloco quinzenal começa numa semana par; se a semana atual é ímpar, recua 7 dias
      if (weekOfYear(monday) % 2 !== 0) blockStart.setUTCDate(blockStart.getUTCDate() - 7)
      return { period_start: toISODate(blockStart), period_end: today }
    }

    case 'monthly': {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      return { period_start: toISODate(monthStart), period_end: today }
    }

    default:
      throw new Error(`Frequência desconhecida: ${frequency}`)
  }
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Segunda-feira da semana de `d` (UTC, hora zerada). */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay()
  const offset = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - offset)
  return monday
}

/** Semana do ano (0-based) contada em blocos de 7 dias desde 1º de janeiro. */
function weekOfYear(d: Date): number {
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1)
  const dayUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.floor((dayUTC - startOfYear) / (7 * 86400 * 1000))
}
