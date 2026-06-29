import { Fragment } from 'react'
import { type CampaignWeekData, type WeekRange, percentDelta } from '@/lib/analytics/weekly'
import { PlatformIcon } from '@/components/atoms/PlatformIcon'

interface WeeklyComparisonTableProps {
  data: CampaignWeekData[]
  weekRanges: WeekRange[]
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>
  if (delta > 0) return <span className="text-xs font-medium text-green-600">↑{delta}%</span>
  if (delta < 0) return <span className="text-xs font-medium text-red-600">↓{Math.abs(delta)}%</span>
  return <span className="text-xs text-muted-foreground">0%</span>
}

export function WeeklyComparisonTable({ data, weekRanges }: WeeklyComparisonTableProps) {
  // Última semana para comparação de delta (S-1)
  const lastWeekLabel = weekRanges[weekRanges.length - 1].label
  const prevWeekLabel = weekRanges[weekRanges.length - 2].label

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campanha</th>
            {weekRanges.map((week) => (
              <th
                key={week.label}
                colSpan={3}
                className="border-l border-border px-4 py-3 text-center font-medium text-muted-foreground"
              >
                {week.label}
                <span className="ml-1 text-xs text-muted-foreground/60">({week.start})</span>
              </th>
            ))}
          </tr>
          <tr className="bg-muted/30 text-xs text-muted-foreground">
            <th className="px-4 py-2" />
            {weekRanges.map((week) => (
              <Fragment key={week.label}>
                <th className="border-l border-border px-2 py-2 text-right">Gasto</th>
                <th className="px-2 py-2 text-right">Conv.</th>
                <th className="px-2 py-2 text-right">ROAS</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row) => (
            <tr key={row.campaignId} className="hover:bg-muted/20">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={row.platform} size="sm" />
                  <span className="max-w-[200px] truncate font-medium text-foreground">
                    {row.campaignName}
                  </span>
                </div>
              </td>
              {weekRanges.map((week) => {
                const w = row.weeks[week.label] ?? { spend: 0, conversions: 0, roas: 0 }
                const isLastWeek = week.label === lastWeekLabel
                const prevW = isLastWeek
                  ? (row.weeks[prevWeekLabel] ?? { spend: 0, conversions: 0, roas: 0 })
                  : null

                return (
                  <Fragment key={`${row.campaignId}-${week.label}`}>
                    <td className="border-l border-border px-2 py-3 text-right">
                      <span>R$ {w.spend.toFixed(2)}</span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span>{w.conversions}</span>
                        {isLastWeek && prevW && (
                          <DeltaBadge delta={percentDelta(prevW.conversions, w.conversions)} />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span>{w.roas.toFixed(2)}x</span>
                        {isLastWeek && prevW && (
                          <DeltaBadge delta={percentDelta(prevW.roas, w.roas)} />
                        )}
                      </div>
                    </td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
