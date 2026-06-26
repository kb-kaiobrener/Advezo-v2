import {
  LayoutDashboard,
  Users,
  MessageCircle,
  MessagesSquare,
  TrendingUp,
  BarChart3,
  BrainCircuit,
  Settings,
  Link2,
} from 'lucide-react'

export const NAV_ICONS = {
  Dashboard:    LayoutDashboard,
  Clientes:     Users,
  WhatsApp:     MessageCircle,
  Conversas:    MessagesSquare,
  LinksRastreáveis: Link2,
  Conversões:   TrendingUp,
  Relatórios:   BarChart3,
  AssistenteIA: BrainCircuit,
  Configurações: Settings,
} as const

export type NavIconKey = keyof typeof NAV_ICONS
