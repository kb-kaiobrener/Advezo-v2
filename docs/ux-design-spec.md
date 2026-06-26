# Advezo v2 — UI/UX Design Specification

**Versão:** 1.0
**Data:** 2026-06-25
**Autor:** Uma (@ux-design-expert)
**Status:** APPROVED FOR IMPLEMENTATION — Beta v2 (Epics 1–3)

---

## Change Log

| Data | Versão | Descrição |
|------|--------|-----------|
| 2026-06-25 | 1.0 | Spec inicial — tokens, layout, wireframes 8 telas core |

---

## 1. Design System Foundation

### 1.1 Color Tokens

#### Brand Blue — "Advezo Blue"

Escolha: `blue-600` (#2563EB) como primário. Racional: contraste 4.53:1 em fundo branco (passa WCAG AA), reconhecível em contexto de tráfego pago (alinha subtilmente à paleta Meta), forte em botões e nav ativa sem ser agressivo.

```css
/* Tailwind config → theme.extend.colors */
--color-brand-50:   #EFF6FF;   /* blue-50  — page section backgrounds */
--color-brand-100:  #DBEAFE;   /* blue-100 — badge bg, card highlight */
--color-brand-200:  #BFDBFE;   /* blue-200 — hover states on light bg */
--color-brand-500:  #3B82F6;   /* blue-500 — links, secondary interactive */
--color-brand-600:  #2563EB;   /* blue-600 — PRIMARY: buttons, active nav, CTAs */
--color-brand-700:  #1D4ED8;   /* blue-700 — hover on primary button */
--color-brand-800:  #1E40AF;   /* blue-800 — focus ring, pressed state */
--color-brand-900:  #1E3A8A;   /* blue-900 — sidebar text on brand-100 bg */
```

#### Semantic — Health Status

```css
/* Health: Good */
--color-health-good-bg:     #DCFCE7;   /* green-100 */
--color-health-good-text:   #15803D;   /* green-700 — 5.14:1 ✓ WCAG AA */
--color-health-good-border: #BBF7D0;   /* green-200 */
--color-health-good-solid:  #16A34A;   /* green-600 — for icons/borders */

/* Health: Warning */
--color-health-warn-bg:     #FEF9C3;   /* yellow-100 */
--color-health-warn-text:   #B45309;   /* amber-700 — 4.74:1 ✓ WCAG AA */
--color-health-warn-border: #FDE68A;   /* amber-200 */
--color-health-warn-solid:  #D97706;   /* amber-600 — for icons/borders */

/* Health: Critical */
--color-health-crit-bg:     #FEE2E2;   /* red-100 */
--color-health-crit-text:   #B91C1C;   /* red-700 — 4.99:1 ✓ WCAG AA */
--color-health-crit-border: #FECACA;   /* red-200 */
--color-health-crit-solid:  #DC2626;   /* red-600 — for icons/borders */
```

#### Neutral — UI Chrome

```css
--color-gray-0:    #FFFFFF;   /* backgrounds puros */
--color-gray-50:   #F9FAFB;   /* page background */
--color-gray-100:  #F3F4F6;   /* sidebar background, dividers */
--color-gray-200:  #E5E7EB;   /* borders, table separators */
--color-gray-300:  #D1D5DB;   /* input borders */
--color-gray-400:  #9CA3AF;   /* placeholder text */
--color-gray-500:  #6B7280;   /* secondary text */
--color-gray-600:  #4B5563;   /* body text */
--color-gray-700:  #374151;   /* headings */
--color-gray-800:  #1F2937;   /* primary text */
--color-gray-900:  #111827;   /* darkest text */
```

#### Platform Colors (NÃO alterar — identidade das plataformas)

```css
--color-meta:      #1877F2;   /* Meta blue oficial */
--color-google:    #4285F4;   /* Google blue (ícone colorido, não só azul) */
--color-whatsapp:  #25D366;   /* WhatsApp green oficial */
```

### 1.2 Typography

**Font family:** Inter (Google Fonts — carregada via `next/font/google`)

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

**Type Scale:**

| Token | Size | Line Height | Weight | Tailwind | Uso |
|-------|------|-------------|--------|----------|-----|
| `text-xs` | 12px | 16px | 400/500 | `text-xs` | Labels, captions, timestamps |
| `text-sm` | 14px | 20px | 400/500 | `text-sm` | Body text, table cells, form labels |
| `text-base` | 16px | 24px | 400 | `text-base` | Parágrafos, inputs |
| `text-lg` | 18px | 28px | 500/600 | `text-lg` | Card titles, section headers |
| `text-xl` | 20px | 28px | 600 | `text-xl` | Page sub-headers |
| `text-2xl` | 24px | 32px | 700 | `text-2xl` | Metric values (spend, ROI) |
| `text-3xl` | 30px | 36px | 700 | `text-3xl` | Dashboard hero metrics |
| `text-4xl` | 36px | 40px | 700 | `text-4xl` | Números grandes em empty states |

**Weights usados:**

```css
font-normal   (400) → texto corrido, labels secundários
font-medium   (500) → nav items, table headers, form labels
font-semibold (600) → card titles, button labels, page titles
font-bold     (700) → metric values, hero numbers
```

### 1.3 Spacing System

Base: 4px (rem: 0.25rem). Seguir escala Tailwind nativa.

```
4px  (1) → gap entre ícone e label, padding interno badge
8px  (2) → padding horizontal de badge, gap entre items pequenos
12px (3) → padding interno de nav item, gap em form row
16px (4) → padding de card, gap padrão entre elementos
20px (5) → gap entre cards em grid, padding de section header
24px (6) → padding interno de card principal, gap de table row
32px (8) → margin entre seções, padding de page content
40px (10) → espaçamento generoso entre blocos distintos
48px (12) → padding de modal, espaços de respiro em formulários
```

### 1.4 Shadows & Elevation

```css
shadow-sm  → cards comuns, dropdowns pequenos (0 1px 2px rgba(0,0,0,0.05))
shadow     → cards hover, popovers (0 1px 3px + 0 1px 2px)
shadow-md  → dropdowns, menus (0 4px 6px -1px + 0 2px 4px -2px)
shadow-lg  → modais, dialogs (0 10px 15px -3px + 0 4px 6px -4px)
shadow-xl  → drawer lateral, toasts importantes
```

### 1.5 Border Radius

```css
rounded-sm  (2px)  → badges de status
rounded     (4px)  → inputs, selects, checkboxes
rounded-md  (6px)  → buttons, tags
rounded-lg  (8px)  → cards, tooltips, dropdowns
rounded-xl  (12px) → modais, drawers, QR code container
rounded-2xl (16px) → cards de onboarding, empty states
rounded-full       → avatars, dots de saúde, platform icons
```

### 1.6 Breakpoints

```css
sm:  640px  → mobile (sidebar colapsa para ícones)
md:  768px  → breakpoint principal: sidebar visível vs. ícones
lg:  1024px → layout padrão do produto (desktop-first target)
xl:  1280px → layout confortável para gestores com monitor externo
2xl: 1536px → telas grandes (tabelas expandidas, charts maiores)
```

---

## 2. Layout System

### 2.1 Shell: Sidebar + Content Area

```
┌────────────────────────────────────────────────────────────────┐
│                        VIEWPORT                                │
│ ┌──────────────┬───────────────────────────────────────────┐  │
│ │   SIDEBAR    │              CONTENT AREA                 │  │
│ │  w: 240px    │  flex-1 — flex flex-col overflow-y-auto   │  │
│ │  h: 100vh    │                                           │  │
│ │  fixed left  │  ┌────────────────────────────────────┐   │  │
│ │  overflow-y  │  │    TOP BAR (sticky, h: 56px)       │   │  │
│ │  auto        │  │ Breadcrumb + Page actions          │   │  │
│ │              │  └────────────────────────────────────┘   │  │
│ │              │  ┌────────────────────────────────────┐   │  │
│ │              │  │                                    │   │  │
│ │              │  │       PAGE CONTENT                 │   │  │
│ │              │  │       p: 24px (desktop)            │   │  │
│ │              │  │                                    │   │  │
│ │              │  └────────────────────────────────────┘   │  │
│ └──────────────┴───────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Sidebar — Anatomia Detalhada

```
┌──────────────────────────────┐  ← w: 240px, bg: gray-100, border-r: gray-200
│                              │
│  ┌────────────────────────┐  │  ← Logo + Workspace selector (h: 64px)
│  │ 🔷 Advezo              │  │    Logo SVG 28px + wordmark
│  │ Minha Agência     [▾]  │  │    Workspace dropdown: CommandPopover
│  └────────────────────────┘  │
│                              │
│  ─── Conta de anúncio ────  │  ← Divisor com label "xs text-gray-400"
│  ┌────────────────────────┐  │
│  │ [Meta◼] Conta Fulano  │  │  ← Ad Account selector
│  │                    [▾] │  │    Platform icon 16px + truncated name
│  └────────────────────────┘  │    Combobox com search (quando >5 contas)
│                              │
│  ─── Navegação ────────────  │
│                              │
│  ┌────────────────────────┐  │  ← Nav item (h: 40px, px: 12px)
│  │ ⊞  Dashboard           │  │    Ícone 18px + label text-sm font-medium
│  └────────────────────────┘  │    Estado ativo: bg-brand-100 text-brand-700
│  [  ] Clientes               │      rounded-md border-l-2 border-brand-600
│  [  ] WhatsApp               │    Estado hover: bg-gray-200 text-gray-700
│  [  ] Conversões             │    (sub-nav WhatsApp: abas no content area)
│  [  ] Relatórios             │
│  [  ] Assistente IA          │
│                              │
│  ─────────────────────────   │  ← Divisor (border-t border-gray-200, mt-auto)
│                              │
│  [  ] Configurações          │  ← Rodapé da sidebar
│                              │
│  ┌────────────────────────┐  │  ← User avatar + name (h: 56px)
│  │ [AV] Kaio Brener    ⋮  │  │    Avatar 32px + name text-sm + menu
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**Estados dos Nav Items:**

| Estado | Classes Tailwind |
|--------|-----------------|
| Default | `text-gray-600 hover:bg-gray-200 hover:text-gray-800 rounded-md` |
| Ativo | `bg-brand-100 text-brand-700 font-semibold border-l-2 border-brand-600 rounded-md` |
| Hover | `bg-gray-200 text-gray-800 rounded-md` |
| Collapsed (< 768px) | Apenas ícone centrado, sem label, tooltip no hover |

### 2.3 Sidebar Colapso (< 768px)

```
┌──────┐  ← w: 56px, ícones centrados
│  🔷  │
│  ────│
│ [▾ ] │  ← Account selector: apenas platform icon
│ ─────│
│  ⊞   │  Dashboard (tooltip on hover)
│  👥  │  Clientes
│  📱  │  WhatsApp
│  💰  │  Conversões
│  📊  │  Relatórios
│  🤖  │  Assistente IA
│      │
│  ─── │
│  ⚙️   │  Configurações
│ [AV] │  User avatar
└──────┘
```

### 2.4 Ícones dos Nav Items

> Lista final aprovada — 2026-06-25. "Rastreamento" e "Conversas" como itens separados foram removidos.

| Item | Lucide Icon | Notas |
|------|-------------|-------|
| Dashboard | `LayoutDashboard` | padrão de dashboard |
| Clientes | `Users` | usuários/clientes |
| WhatsApp | `MessageCircle` | sub-nav no content area: Conexões \| Conversas \| Links Rastreáveis |
| Conversões | `TrendingUp` | crescimento, resultados de negócio |
| Relatórios | `BarChart2` | relatórios automáticos e dashboards compartilháveis |
| Assistente IA | `BrainCircuit` | chat com IA |
| Configurações | `Settings` | inclui sub-seção "Equipe" em `/settings/team` |

**"Rastreamento" → onde vive agora:**
- Links rastreáveis (gerador + listagem) → `/whatsapp/links`
- Conversas classificadas → `/whatsapp/conversations`
- Dashboard de resultados/ROI → `/conversions`

### 2.5 Top Bar (Content Area)

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Dashboard > Clientes > Nome do Cliente    [+Ação]│
│ h: 56px — sticky top-0 — bg-white border-b border-gray-200  │
└──────────────────────────────────────────────────────────────┘
```

A top bar é **por página** — não é global. Contém:
- Breadcrumb (Shadcn `Breadcrumb`)
- Ações primárias da página (button variant=default à direita)
- Badge de status quando relevante (ex.: "Sync em andamento…")

---

## 3. Component Inventory (Atomic Design)

### 3.1 Atoms — ShadCN Base

| Componente | ShadCN | Variantes usadas no Advezo |
|-----------|--------|---------------------------|
| Button | `Button` | `default` (primário azul), `outline`, `ghost`, `destructive`, `sm` |
| Badge | `Badge` | `default`, `secondary`, `outline` + custom health variants |
| Input | `Input` | padrão + `with icon` |
| Select | `Select` | padrão + Combobox (`Command + Popover`) |
| Switch | `Switch` | status de campanha (ativo/pausado) |
| Avatar | `Avatar` | usuário (32px), cliente (24px) |
| Tooltip | `Tooltip` | ícones colapsados, ações inline |
| Skeleton | `Skeleton` | loading state de cards e tabelas |
| Separator | `Separator` | divisores de sidebar e section |
| Dialog | `Dialog` | confirmações de ação destrutiva |
| Sheet | `Sheet` | drawer lateral (edição de orçamento, detalhe) |
| Tabs | `Tabs` | detalhe de cliente, configurações |
| Card | `Card` | health cards, metric cards |
| Table | `Table` | listagem de campanhas, conversas |
| Progress | `Progress` | orçamento gasto vs. total |

### 3.2 Molecules — Combinações

**Platform Badge:**
```
┌─────────────────┐
│ [icon] Meta Ads │  ← 16px platform icon + text-xs font-medium
└─────────────────┘
```
- `<MetaBadge />`, `<GoogleBadge />`, `<WhatsAppBadge />` — cores fixas, não temáticas

**Health Dot:**
```
● ← rounded-full, w-2.5 h-2.5
    green-600 / amber-600 / red-600
    + Tooltip com explicação (ex: "Gasto 94% do orçamento diário")
```

**Health Card (metric card com status):**
```
┌────────────────────────────────────┐
│ R$ 4.820                    [●]   │  ← valor grande (text-2xl bold) + health dot
│ Gasto hoje          ↑ 12% vs. sem │  ← label + variação percentual
└────────────────────────────────────┘
```

**Campaign Row (linha de tabela com ações inline):**
```
[●] [Meta◼] Campanha Black Friday Roupas  |  ◀▶  |  R$ 150/dia  |  R$ 89 |  3.2%  |  [⋮]
 ↑ status dot  ↑ platform badge  ↑ nome      ↑ toggle  ↑ orçamento editável inline
```

**Empty State Card:**
```
┌───────────────────────────────────────────┐
│                                           │
│          [illustration / icon 64px]       │
│                                           │
│          Título do estado vazio           │
│          Subtítulo explicativo            │
│                                           │
│          [  Ação primária CTA  ]          │
│                                           │
└───────────────────────────────────────────┘
```

### 3.3 Organisms — Seções Reutilizáveis

**Client Health Card (Dashboard):**
```
┌────────────────────────────────────────────────────────────┐  ← w: ~320px card
│  ┌──────┐  Nome do Cliente                    [⋮ menu]    │
│  │ [AV] │  [Meta◼] [Google◼]      ● Saudável             │  ← platform badges + health
│  └──────┘                                                  │
│  ─────────────────────────────────────────────────────────  │
│  R$ 12.480          Gasto / Mês                            │
│  ████████████░░░░░░  74% do orçamento                      │  ← Progress bar
│  ─────────────────────────────────────────────────────────  │
│  Campanhas ativas: 8     Conversões: 34      CTR: 3.4%     │
│  ─────────────────────────────────────────────────────────  │
│  [  Ver detalhe  ]                    Sync há 18 min       │
└────────────────────────────────────────────────────────────┘
```

**Campaign Table (organism com sort + inline edit):**
```
┌──┬─────────────────────────┬──────────┬────────────┬───────┬──────┬──────┬──┐
│● │ Campanha                │ Plat.    │ Orçamento  │ Gasto │  CTR │ ROAS │  │
├──┼─────────────────────────┼──────────┼────────────┼───────┼──────┼──────┼──┤
│● │ Black Friday Roupas     │ [Meta◼]  │ R$ 150/dia │ R$ 89 │ 3.2% │ 4.1x │⋮ │
│○ │ [Pausada] Leads Verão   │ [Google◼]│ R$ 80/dia  │ R$ 0  │ 0%   │ —    │⋮ │
└──┴─────────────────────────┴──────────┴────────────┴───────┴──────┴──────┴──┘
```

---

## 4. Wireframes — 8 Telas Core

> **Notação:**
> `[BTN]` = Button component | `[INP]` = Input | `[SEL]` = Select / Combobox
> `[●]` = Health dot | `[◼]` = Platform icon | `[⋮]` = Dropdown menu trigger
> `████` = filled area (progress, chart) | `░░░░` = empty area
> Dimensões em px quando relevantes para implementação.

---

### 4.1 Onboarding — Criação de Workspace

**Contexto:** Usuário acabou de se cadastrar via `/login`, não tem workspace ainda. Rota: `/onboarding`. Sem sidebar (pré-workspace). Fundo: `bg-gray-50`.

**Fluxo: 3 etapas lineares**

```
Etapa 1/3: Criar Workspace
Etapa 2/3: Convidar equipe (opcional)
Etapa 3/3: Conectar primeira conta
```

**Etapa 1 — Criar Workspace:**

```
┌────────────────────────────────────────────────────────────────┐
│  [LOGO Advezo — centrado — h: 80px]                           │
│                                                                │
│  ┌────────────────── Passo 1 de 3 ──────────────────────────┐ │
│  │                                                            │ │
│  │  [●──────────────────────────────────] ← Progress steps  │ │
│  │   1           2           3             ativo = brand-600 │ │
│  │  Workspace  Equipe     Conexão                            │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │                                                        │ │ │
│  │  │  🎉 Bem-vindo ao Advezo!                              │ │ │
│  │  │  Vamos configurar seu espaço de trabalho.            │ │ │
│  │  │                                                        │ │ │
│  │  │  Nome da agência / workspace *                        │ │ │
│  │  │  [INP placeholder="Ex: Agência Crescimento"]         │ │ │
│  │  │                                                        │ │ │
│  │  │  URL do workspace (auto-gerada, editável)             │ │ │
│  │  │  advezo.com.br/ [INP value="agencia-crescimento"]    │ │ │
│  │  │                  ↑ preenchido automaticamente do nome │ │ │
│  │  │                  verificação de disponibilidade inline │ │ │
│  │  │                                                        │ │ │
│  │  │  [BTN "Continuar →" full-width, brand-600]           │ │ │
│  │  │                                                        │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Etapa 2 — Convidar Equipe (opcional):**

```
│  Convide sua equipe (opcional — pode fazer depois)            │
│                                                               │
│  [INP placeholder="email@agencia.com"] [SEL "Administrador▾"]│
│  [+ Adicionar outro email]                                    │
│                                                               │
│  ┌───────────────────────────────────────┐                   │
│  │ kaio@agencia.com          Proprietário│  ← usuário atual  │
│  └───────────────────────────────────────┘                   │
│                                                               │
│  [BTN "Enviar convites e continuar"] [BTN ghost "Pular →"]   │
```

**Etapa 3 — Conectar Primeira Conta:**

```
│  Conecte sua primeira conta de anúncio                       │
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │  [Meta icon 48px]    │  │  [Google icon 48px]  │         │
│  │  Meta Ads            │  │  Google Ads           │         │
│  │  [BTN "Conectar"]    │  │  [BTN "Conectar"]    │         │
│  └──────────────────────┘  └──────────────────────┘         │
│                                                               │
│  [BTN ghost "Pular por agora — conectar depois"]             │
│  ↑ leva ao Dashboard com empty state orientativo             │
```

---

### 4.2 Dashboard Principal

**Rota:** `/` | **Sidebar item ativo:** Dashboard

```
SIDEBAR [ativo: Dashboard]

CONTENT AREA:
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: Dashboard                                    [+ Cliente]│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SUMMARY ROW — 4 metric cards (grid: 4 cols gap-4)              │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │
│  │ 5            │ │ R$ 48.200    │ │ 3,4%         │ │ 142    │ │
│  │ Clientes     │ │ Gasto total  │ │ CTR médio    │ │ Conver.│ │
│  │ ativos       │ │ este mês     │ │              │ │ este mês│ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘ │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  FILTER BAR                                                      │
│  [🔍 Buscar cliente...] [SEL "Todas plataformas▾"] [SEL "Mês▾"] │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  CLIENT GRID — grid: 3 cols (lg), 2 cols (md), 1 col (sm)       │
│                                                                   │
│  ┌────────────────────────────────────────┐                      │
│  │ [AV] Loja do João         [⋮]          │                      │
│  │      [Meta◼] [Google◼]   ● Saudável   │ ← health dot verde  │
│  │ ─────────────────────────────────────  │                      │
│  │ R$ 12.480                              │ ← text-2xl bold     │
│  │ Gasto em junho                         │                      │
│  │ ████████████░░░░░  74% do orçamento    │ ← Progress + %      │
│  │ ─────────────────────────────────────  │                      │
│  │ 8 campanhas   34 convers.   3.4% CTR  │                      │
│  │ ─────────────────────────────────────  │                      │
│  │ [  Ver detalhe  ]   Sync 18 min atrás │                      │
│  └────────────────────────────────────────┘                      │
│                                                                   │
│  ┌────────────────────────────────────────┐                      │
│  │ [AV] Clínica Estética Bella    [⋮]     │                      │
│  │      [Meta◼]        ⚠ Atenção         │ ← dot amarelo       │
│  │ ─────────────────────────────────────  │                      │
│  │ R$ 8.900                               │                      │
│  │ Gasto em junho                         │                      │
│  │ ████████████████░░  90% do orçamento   │ ← quase no limite   │
│  │ ─────────────────────────────────────  │                      │
│  │ 4 campanhas   12 convers.   2.1% CTR  │                      │
│  │ ─────────────────────────────────────  │                      │
│  │ [  Ver detalhe  ]   Sync 2 h atrás    │                      │
│  └────────────────────────────────────────┘                      │
│                                                                   │
│  ┌────────────────────────────────────────┐                      │
│  │ [AV] Pet Shop Bicho Feliz      [⋮]     │                      │
│  │      [Meta◼] [Google◼]  ✕ Crítico     │ ← dot vermelho      │
│  │ ─────────────────────────────────────  │                      │
│  │ R$ 3.200                               │                      │
│  │ Gasto em junho                         │                      │
│  │ ██████████████████  100% — esgotado    │ ← barra vermelha    │
│  │ ─────────────────────────────────────  │                      │
│  │ 2 campanhas    5 convers.   1.8% CTR  │                      │
│  │ ─────────────────────────────────────  │                      │
│  │ [  Ver detalhe  ]   Sync falhou ⚠     │ ← texto vermelho    │
│  └────────────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
```

**Lógica de saúde dos cards:**

| Saúde | Condição | Visual |
|-------|---------|--------|
| Saudável (verde) | Gasto < 85% orçamento AND sync < 1h | `border-green-200 bg-white` + dot verde |
| Atenção (amarelo) | Gasto 85-99% OR sync 1-6h | `border-amber-200 bg-amber-50/20` + dot âmbar |
| Crítico (vermelho) | Gasto = 100% OR sync falhou OR sync > 6h | `border-red-200 bg-red-50/20` + dot vermelho |

**Menu do card `[⋮]`:**
```
[ Ver detalhe ]
[ Sincronizar agora ]
[ Dashboard compartilhável ]
─────────────────────────
[ Editar cliente ]
```

---

### 4.3 Clientes — Lista

**Rota:** `/clients` | **Sidebar item ativo:** Clientes

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: Clientes                                   [+ Novo cliente]│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  FILTER BAR                                                      │
│  [🔍 Buscar por nome ou domínio...] [SEL "Plataforma▾"] [SEL "Status▾"]│
└──────────────────────────────────────────────────────────────────┘

TABLE:
┌───┬────────────────────────┬─────────────┬───────────┬──────────┬──────────┬───┐
│   │ Cliente                │ Plataformas │ Campanhas │ Gasto/mês│ Saúde    │   │
├───┼────────────────────────┼─────────────┼───────────┼──────────┼──────────┼───┤
│[●]│ [AV] Loja do João      │ [Meta][Goog]│ 8 ativas  │ R$12.480 │ ● Ótimo  │[⋮]│
│[●]│ [AV] Clínica Bella     │ [Meta]      │ 4 ativas  │ R$ 8.900 │ ⚠ Atenção│[⋮]│
│[●]│ [AV] Pet Shop Bicho F. │ [Meta][Goog]│ 2 ativas  │ R$ 3.200 │ ✕ Crítico│[⋮]│
│[●]│ [AV] Academia FitLife  │ [Google]    │ 3 ativas  │ R$ 5.100 │ ● Ótimo  │[⋮]│
│[●]│ [AV] Restaurante Sabor │ [Meta]      │ 1 ativa   │ R$   890 │ ● Ótimo  │[⋮]│
└───┴────────────────────────┴─────────────┴───────────┴──────────┴──────────┴───┘

FOOTER: Mostrando 5 de 5 clientes
```

**Menu de linha `[⋮]`:**
```
[ Ver detalhe ]
[ Ver campanhas ]
[ Sincronizar ]
─────────────────
[ Editar ]
[ Arquivar ]
```

---

### 4.4 Clientes — Detalhe

**Rota:** `/clients/[id]`

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: Clientes > Loja do João             [Sincronizar] [⋮]  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  CLIENT HEADER                                                   │
│  ┌──────┐  Loja do João                            ● Saudável  │
│  │ [AV] │  contato@lojadojoao.com                              │
│  │  64  │  Criado em: 10/03/2026       Último sync: 18 min atrás│
│  └──────┘                                                        │
└──────────────────────────────────────────────────────────────────┘

TABS: [Contas de Anúncio] [WhatsApp] [Relatórios] [Histórico]
        ↑ ativo (underline brand-600)

═════════════════ ABA: Contas de Anúncio ═════════════════

┌──────────────────────────────────────────────────────────────────┐
│  [+ Conectar conta]                                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  CONTA 1                                                         │
│  [Meta◼]  Conta Principal João           ● Conectada            │
│  ID: 123456789          Último sync: 18 min atrás               │
│  8 campanhas ativas     R$ 12.480 gasto em junho                │
│  ─────────────────────────────────────────────────────────────  │
│  [  Ver campanhas  ]  [  Análise comparativa  ]  [  Sync  ] [⋮] │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  CONTA 2                                                         │
│  [Google◼]  Google Ads — João            ● Conectada            │
│  CID: 987-654-3210      Último sync: 18 min atrás               │
│  3 campanhas ativas     R$ 2.100 gasto em junho                 │
│  ─────────────────────────────────────────────────────────────  │
│  [  Ver campanhas  ]  [  Análise comparativa  ]  [  Sync  ] [⋮] │
└──────────────────────────────────────────────────────────────────┘
```

---

### 4.5 Campanhas — Listagem com Ações Inline

**Rota:** `/clients/[id]/ad-accounts/[accountId]/campaigns`

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: Clientes > João > Meta Ads               [Sync] [Análise]│
└──────────────────────────────────────────────────────────────────┘

FILTER BAR:
┌──────────────────────────────────────────────────────────────────┐
│ [🔍 Buscar campanha...] [SEL "Status▾"] [SEL "Jun/2026▾"] [CSV] │
└──────────────────────────────────────────────────────────────────┘

CAMPAIGN TABLE — sticky header, linha de 48px:

┌───┬──────────────────────────────┬──────┬────────────┬──────────┬──────┬──────┬───┐
│   │ Campanha                     │Status│ Orçamento  │  Gasto   │  CTR │ ROAS │   │
├───┼──────────────────────────────┼──────┼────────────┼──────────┼──────┼──────┼───┤
│● │ Black Friday Roupas Masculinas│  [●] │ R$ 150/dia │  R$ 89   │ 3.2% │ 4.1x │[⋮]│
│  │ [Meta◼] Conversões           │  ↑   │   ↑        │          │      │      │   │
│  │                              │  Switc│ click→edit │          │      │      │   │
├───┼──────────────────────────────┼──────┼────────────┼──────────┼──────┼──────┼───┤
│○ │ [PAUSADA] Leads Verão        │  [○] │ R$ 80/dia  │  R$  0   │  0%  │  —   │[⋮]│
│  │ [Meta◼] Geração de leads     │      │            │          │      │      │   │
├───┼──────────────────────────────┼──────┼────────────┼──────────┼──────┼──────┼───┤
│● │ Remarketing Site Masculino   │  [●] │ R$200/dia  │ R$ 142   │ 1.8% │ 2.3x │[⋮]│
│  │ [Meta◼] Tráfego              │      │            │          │      │      │   │
├───┼──────────────────────────────┼──────┼────────────┼──────────┼──────┼──────┼───┤
│  │ ... mais 5 campanhas ...     │      │            │          │      │      │   │
└───┴──────────────────────────────┴──────┴────────────┴──────────┴──────┴──────┴───┘

FOOTER: Mostrando 8 campanhas | Gasto total: R$ 89 | Orçamento: R$ 1.230/dia
```

**Ação Inline: Toggle Campanha (Switch):**
```
Click no [●] Switch:
→ Abre Dialog de confirmação:
  "Pausar campanha 'Black Friday Roupas'?
   A campanha para imediatamente de veicular.
   [Cancelar]  [Pausar campanha]"
→ Loading state no switch (spinner)
→ On success: switch muda, dot muda para cinza
→ On error: toast "Não foi possível pausar — tente novamente"
```

**Ação Inline: Editar Orçamento:**
```
Click em "R$ 150/dia":
→ Célula transforma em:
  [R$ ][   150   ][/dia] [✓] [✗]
         ↑ INP focus automático
→ Pressionar Enter ou [✓]: chama PUT /api/campaigns/:id/budget
→ Loading spinner na célula durante request
→ On success: valor atualizado inline, toast "Orçamento atualizado"
→ On error: reverte valor, toast com erro da API
```

**Menu de linha `[⋮]`:**
```
[ Ver insights detalhados ]
[ Comparar com semanas anteriores ]
─────────────────────────────────
[ Pausar / Ativar ]
[ Ajustar orçamento ]
```

---

### 4.6 Análise Comparativa — 4 Semanas

**Rota:** `/clients/[id]/ad-accounts/[accountId]/analysis`

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: João > Meta Ads > Análise                     [Export] │
└──────────────────────────────────────────────────────────────────┘

METRIC SELECTOR + DATE CONTEXT:
┌──────────────────────────────────────────────────────────────────┐
│ Comparar por: [SEL "Gasto▾"] | Período: 01/06 a 25/06/2026     │
│                                                                  │
│ [BTN outline "Gasto"] [BTN outline "CTR"] [BTN "ROAS" active]  │
│                                        ↑ ativo: bg-brand-100   │
└──────────────────────────────────────────────────────────────────┘

CHART AREA (Recharts, LineChart):
┌──────────────────────────────────────────────────────────────────┐
│  4.5x ┤                                                          │
│       │          ·  ·                                            │
│  4.0x ┤     ·──·      ·──·                Semana 4 (atual)      │
│       │  ·─╱                ╲──·     ─ ─  Semana 3              │
│  3.5x ┤·╱                       ·  ·····  Semana 2              │
│       │                           ·       ······ Semana 1        │
│  3.0x ┤                                          (mais antiga)  │
│       └──┬──────┬──────┬──────┬──────┬──────┬──                │
│         Seg    Ter    Qua    Qui    Sex    Sab    Dom            │
│                                                                   │
│  Hover tooltip: "Quarta — Sem 4: ROAS 4.2x | Sem 3: 3.8x"     │
└──────────────────────────────────────────────────────────────────┘

COMPARISON TABLE:
┌─────────────────────────────────────────────────────────────────┐
│  Campanha                  │ Sem 1  │ Sem 2  │ Sem 3  │ Sem 4  │
│  ──────────────────────────┼────────┼────────┼────────┼────────│
│  Black Friday Roupas       │  3.1x  │  3.5x  │  3.8x  │ 4.1x ↑│
│  Remarketing Site          │  2.0x  │  2.1x  │  2.3x  │ 2.3x → │
│  [Pausada] Leads Verão     │  1.8x  │  1.5x  │   —    │   —    │
│  ─────────────────────────────────────────────────────────────  │
│  Total / Média             │  2.7x  │  2.9x  │  3.1x  │ 3.3x ↑│
└─────────────────────────────────────────────────────────────────┘

Legenda de variação:
↑ verde (melhora)  →  cinza (estável ±5%)  ↓ vermelho (piora)
```

---

### 4.7 Configuração de Relatórios WhatsApp + Preview

**Rota:** `/whatsapp/reports` | **Sidebar item ativo:** WhatsApp

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: WhatsApp > Relatórios Automáticos      [+ Nova config]  │
└──────────────────────────────────────────────────────────────────┘

TABS: [Relatórios Automáticos] [Alertas] [Mensagens manuais]
       ↑ ativo

LAYOUT 2 COLUNAS (lg: 60/40):

COLUNA ESQUERDA — Configuração:
┌─────────────────────────────────────┐
│  CONFIGURAÇÃO DO RELATÓRIO          │
│                                     │
│  Cliente *                          │
│  [SEL "Selecione o cliente...▾"]    │
│                                     │
│  Conta de anúncio *                 │
│  [SEL "Meta Ads — Conta João▾"]     │
│                                     │
│  Enviar para *                      │
│  ● Número individual                │
│  ○ Grupo do WhatsApp                │
│  [INP "+55 11 99999-9999"]         │
│                                     │
│  Frequência *                       │
│  [SEL "Semanal — toda segunda▾"]    │
│  Opções: Diário | Semanal |         │
│          Quinzenal | Mensal         │
│                                     │
│  Horário de envio *                 │
│  [INP "08:00"] [SEL "America/SP▾"] │
│                                     │
│  Métricas incluídas                 │
│  [✓] Gasto total                    │
│  [✓] ROAS                           │
│  [✓] Conversões                     │
│  [✓] CTR                            │
│  [  ] Impressões                    │
│  [  ] Custo por resultado           │
│                                     │
│  Conta WhatsApp remetente           │
│  [SEL "+55 11 97777-0000 ●▾"]      │
│                                     │
│  [BTN "Salvar configuração"]        │
│  [BTN ghost "Enviar teste agora"]   │
└─────────────────────────────────────┘

COLUNA DIREITA — Preview da mensagem:
┌─────────────────────────────────────┐
│  PREVIEW DA MENSAGEM                │
│  Atualizado em tempo real           │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 📊 *Relatório Advezo*         │  │  ← mensagem WhatsApp mockada
│  │ Loja do João — Meta Ads       │  │
│  │ Semana: 16–22/jun/2026        │  │
│  │                               │  │
│  │ 💰 Gasto: *R$ 12.480*        │  │
│  │ 🎯 ROAS: *4,1x*              │  │
│  │ 🛒 Conversões: *34*           │  │
│  │ 📈 CTR: *3,2%*               │  │
│  │                               │  │
│  │ ──────────────────            │  │
│  │ 🔴 Top campanha:              │  │
│  │ Black Friday Roupas           │  │
│  │ Gasto: R$ 8.900 | ROAS: 4,1x │  │
│  │                               │  │
│  │ Enviado por Advezo ⚡         │  │
│  └───────────────────────────────┘  │
│  ↑ fundo branco com borda wa-style  │
│                                     │
│  Caracteres: 248 / 4096             │
└─────────────────────────────────────┘
```

---

### 4.8 Dashboard Compartilhável (Visão Pública)

**Rota:** `/dashboard/[token]` — **sem sidebar, sem autenticação**
**Geração:** botão "Gerar link compartilhável" dentro do detalhe do cliente

```
┌────────────────────────────────────────────────────────────────┐
│  HEADER PÚBLICO                                                 │
│  [LOGO DA AGÊNCIA — carregado de workspace_settings]           │
│  Relatório: Loja do João            Período: jun/2026 [SEL▾]  │
│  ─────────────────────────────────────────────────────────────  │
│  Powered by Advezo (link discreto, gray-400)                    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  METRIC CARDS — 4 cols                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────┐ │
│  │  R$ 12.480   │ │    4,1x      │ │     34       │ │ 3,2% │ │
│  │  Gasto/mês   │ │    ROAS      │ │  Conversões  │ │  CTR │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────┘ │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  PERFORMANCE CHART                                             │
│  Gasto e ROAS — últimas 4 semanas                              │
│  [LineChart Recharts — versão simplificada, sem interações]    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  CAMPANHAS ATIVAS (TOP 5 por gasto)                            │
│  Tabela sem ações — read-only                                  │
│  Campanha | Plataforma | Gasto | ROAS                         │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  FOOTER PÚBLICO                                                │
│  "Este relatório foi gerado automaticamente pelo Advezo"      │
│  "Válido até 30/06/2026 · Dados atualizados em 25/06/2026"   │
└────────────────────────────────────────────────────────────────┘
```

**Opções de configuração do link (Sheet lateral no detalhe do cliente):**
```
┌───────────────────────────────────────────┐
│  Configurar dashboard compartilhável      │
│                                           │
│  Métricas visíveis                        │
│  [✓] Gasto total  [✓] ROAS               │
│  [✓] Conversões   [  ] CTR               │
│  [  ] Orçamento   [  ] Impressões        │
│                                           │
│  Proteção por senha                       │
│  [  ] Habilitar senha                     │
│  (desabilitado → mostra campo de senha)   │
│                                           │
│  Data de expiração                        │
│  [INP date] ou [  ] Sem expiração        │
│                                           │
│  Período padrão do relatório              │
│  [SEL "Mês atual▾"]                      │
│                                           │
│  [BTN "Gerar link"]                      │
│  [INP readonly "https://advezo.com.br/da…" [Copiar]]│
└───────────────────────────────────────────┘
```

---

### 4.9 Conexão WhatsApp — Fluxo QR Code

**Rota:** `/whatsapp/accounts/new` | **Sidebar item ativo:** WhatsApp

**Fluxo de 4 estados (sem etapas numeradas — transições automáticas):**

**Estado A — Formulário inicial:**
```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR: WhatsApp > Conectar número                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  📱 Conectar número WhatsApp                              │  │
│  │                                                             │  │
│  │  Nome de exibição (interno) *                              │  │
│  │  [INP placeholder="Ex: WhatsApp Vendas João"]              │  │
│  │                                                             │  │
│  │  ℹ️ Você vai escanear um QR Code com o WhatsApp deste      │  │
│  │     número. O número ficará conectado enquanto o worker     │  │
│  │     Railway estiver rodando.                                │  │
│  │                                                             │  │
│  │  [BTN "Iniciar conexão →" full-width]                      │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Estado B — QR Code (polling ativo — atualiza a cada 20s):**
```
┌──────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  📱 Escaneie o QR Code                                    │  │
│  │                                                             │  │
│  │  ┌──────────────────────────┐                              │  │
│  │  │                          │                              │  │
│  │  │   [QR CODE — 200x200px] │  ← rounded-xl, shadow-md    │  │
│  │  │   ████ ██  ████ ██       │                              │  │
│  │  │   ██   ██  ██ ████       │                              │  │
│  │  │   ████ ██████████        │                              │  │
│  │  │                          │                              │  │
│  │  └──────────────────────────┘                              │  │
│  │                                                             │  │
│  │  Como escanear:                                            │  │
│  │  1. Abra o WhatsApp no número que quer conectar           │  │
│  │  2. Toque em ⋮ (Menu) > Aparelhos conectados             │  │
│  │  3. Toque em "Conectar aparelho" e aponte para o QR       │  │
│  │                                                             │  │
│  │  ⏱ QR Code válido por: 45s [████████░░░░░░░░]            │  │
│  │  (atualiza automaticamente)                                │  │
│  │                                                             │  │
│  │  [BTN ghost "Cancelar"]                                    │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Estado C — Conectado com sucesso:**
```
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │          ✅  (ícone check verde, 64px)                     │  │
│  │                                                             │  │
│  │          WhatsApp Vendas João conectado!                   │  │
│  │          +55 11 99999-0000                                 │  │
│  │                                                             │  │
│  │  [BTN "Ir para configurações do número"]                   │  │
│  │  [BTN ghost "Conectar outro número"]                        │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
```

**Estado D — Erro / timeout:**
```
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │          ⚠️  (ícone âmbar, 64px)                          │  │
│  │                                                             │  │
│  │          QR Code expirou                                   │  │
│  │          Nenhum escaneamento detectado em 3 minutos.       │  │
│  │                                                             │  │
│  │  [BTN "Gerar novo QR Code"]                               │  │
│  │  [BTN ghost "Cancelar"]                                    │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
```

---

## 5. Empty States

Regra: toda tela com lista ou dashboard precisa de empty state com:
1. Ilustração / ícone grande (48–64px, cor `gray-300`)
2. Título claro (o que está vazio)
3. Subtítulo explicativo (por que está vazio / o que fazer)
4. CTA primária (ação para resolver o estado vazio)

### 5.1 Dashboard — Sem Clientes

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│                    [Users icon — 64px — gray-300]                │
│                                                                   │
│               Nenhum cliente ainda                               │
│         Adicione seu primeiro cliente para começar               │
│         a gerenciar as contas de anúncio.                        │
│                                                                   │
│                 [+ Adicionar cliente]                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Clientes — Lista Vazia

Mesma estrutura do 5.1 — reaproveita o mesmo componente.

### 5.3 Campanhas — Sem Campanhas Sincronizadas

```
│             [RefreshCw icon — 64px — gray-300]                  │
│                                                                   │
│           Nenhuma campanha sincronizada                          │
│     Clique em "Sincronizar" para buscar as campanhas             │
│     desta conta no Meta Ads.                                     │
│                                                                   │
│              [↺ Sincronizar agora]                              │
```

### 5.4 Análise Comparativa — Sem Dados de Insights

```
│              [BarChart2 icon — 64px — gray-300]                 │
│                                                                   │
│          Sem dados para comparação ainda                         │
│     A análise estará disponível após a primeira                  │
│     sincronização de insights de campanha.                       │
│                                                                   │
│              [↺ Sincronizar conta]                              │
```

### 5.5 WhatsApp — Sem Números Conectados

```
│             [MessageCircle icon — 64px — green-200]             │
│                                                                   │
│          Nenhum número WhatsApp conectado                        │
│     Conecte um número para receber mensagens,                    │
│     rastrear conversas e enviar relatórios automáticos.          │
│                                                                   │
│              [+ Conectar número]                                │
```

### 5.6 WhatsApp — Sem Relatórios Configurados

```
│             [Send icon — 64px — gray-300]                       │
│                                                                   │
│         Nenhum relatório automático configurado                  │
│     Configure o envio automático de métricas por WhatsApp        │
│     para seus clientes — diário, semanal ou mensal.              │
│                                                                   │
│              [+ Configurar relatório]                           │
```

### 5.7 Assistente IA — Primeira Conversa

```
│             [BrainCircuit icon — 64px — brand-200]              │
│                                                                   │
│          Olá! Sou o Assistente Advezo                           │
│     Pergunte sobre desempenho, tendências e sugestões           │
│     baseadas nos dados da conta selecionada.                     │
│                                                                   │
│     Exemplos:                                                    │
│     · "Qual campanha teve melhor ROAS esta semana?"             │
│     · "Onde estou gastando mais sem retorno?"                   │
│     · "Sugira ajuste de orçamento para esta conta"              │
│                                                                   │
│     [INP "Pergunte algo sobre a conta..." full-width]           │
```

### 5.8 Conversas — Sem Rastreamento Ativo

```
│              [Link2 icon — 64px — gray-300]                     │
│                                                                   │
│       Nenhuma conversa rastreada ainda                          │
│     Crie um link rastreável e vincule a uma campanha.           │
│     Quando alguém clicar e enviar mensagem, aparecerá aqui.     │
│                                                                   │
│              [+ Criar link rastreável]                          │
```

### 5.9 Conversões — Sem Conversões

```
│            [TrendingUp icon — 64px — gray-300]                  │
│                                                                   │
│        Nenhuma conversão registrada ainda                       │
│     Conversões aparecem quando o Assistente IA classifica       │
│     uma conversa rastreada como venda.                          │
│                                                                   │
│         [Ver conversas pendentes de classificação]              │
```

---

## 6. Interaction Specifications

### 6.1 Ad Account Selector (Sidebar)

**Componente:** `Combobox` (ShadCN Command + Popover)

```
Click no seletor:
→ Popover abre abaixo do seletor (max-h: 320px, overflow-y-auto)
→ Campo de busca no topo (quando > 5 contas)
→ Contas agrupadas por plataforma:

  [Buscar conta...]
  ─── Meta Ads (2) ───────────────
  [Meta◼] Conta João          ✓  ← checkmark na ativa
  [Meta◼] Conta Bella
  ─── Google Ads (1) ─────────────
  [Google◼] Google Ads João
  ─────────────────────────────────
  [+ Conectar nova conta]          ← link para /clients/[id]/ad-accounts

→ Seleção atualiza Zustand store (activeAdAccountId)
→ TanStack Query invalida queries dependentes
→ Sem reload de página — transição suave
```

### 6.2 Inline Budget Edit (Campaign Table)

```
Duplo click em célula de orçamento / click no valor:
  → Célula passa para modo edit
  → Input numérico com focus automático
  → Botões [✓] [✗] aparecem inline à direita
  → ESC cancela, Enter confirma

On confirm:
  1. PUT /api/campaigns/:id/budget { budget: value }
  2. Spinner na célula
  3. On success: valor atualizado, toast "Orçamento atualizado"
  4. On error: valor revertido, toast com mensagem da API
  5. Rate limit (1/min): toast "Aguarde antes de ajustar orçamento novamente"
```

### 6.3 Campaign Status Toggle

> **Sem modal bloqueante.** Pausar/ativar é reversível (clicar de novo desfaz) — 1 clique direto, conforme FR-A3 e Story 2.7.

```
Click no Switch:
  1. PUT /api/campaigns/:id/status { status: 'paused' | 'active' }
  2. Switch em loading state (pointer-events-none, opacity-60) durante request
  3. On success:
     a. Switch anima para novo estado
     b. Status badge atualiza inline
     c. Toast aparece: "Campanha pausada.  [Desfazer]"
        └ Botão [Desfazer] visível por 5s
        └ Click em [Desfazer] → PUT status de volta + toast "Ativada novamente"
        └ Após 5s sem interação: toast fecha, ação confirmada
  4. On error:
     Switch reverte para estado anterior
     Toast: "Não foi possível pausar — tente novamente" (sem [Desfazer])

Implementação do toast de desfazer:
  - ShadCN Toast com action: <ToastAction>Desfazer</ToastAction>
  - duration: 5000ms
  - Cancelar a requisição de desfazer se toast já fechou
```

### 6.4 Campaign Sync — UI Feedback (202 Pattern)

```
Click em [Sincronizar]:
  1. Botão entra em loading: "Sincronizando..." + spinner
  2. Resposta 202 retorna
  3. Polling de GET /api/ad-accounts/:id a cada 3s
  4. Detecta last_synced_at atualizado
  5. Toast: "Sync concluído — X campanhas atualizadas"
  6. TanStack Query invalida: ['campaigns', accountId]

Timeout (60s sem update):
  → Toast: "Sync demorou mais que o esperado. Tente novamente."
  → Botão volta ao estado normal
```

### 6.5 WhatsApp QR Code Polling

```
On iniciar conexão:
  1. POST /api/whatsapp/accounts { name }
  2. Transição para Estado B (QR Code)
  3. GET /api/whatsapp/accounts/:id/qr a cada 20s
  4. Barra de progresso conta regressivamente (60s)

Eventos possíveis (polling):
  { status: 'qr_pending', qr: '...data...' }   → mostra/atualiza QR
  { status: 'connected' }                        → transição Estado C
  { status: 'error', message: '...' }           → transição Estado D

Timeout de 3 min sem conexão:
  → Para polling
  → Transição para Estado D
```

### 6.6 AI Chat Streaming

```
Submit de mensagem:
  1. Mensagem do usuário aparece imediatamente (optimistic UI)
  2. POST /api/ai/chat { message, session_id?, ad_account_id }
  3. Response: SSE stream
  4. Tokens chegam como { type: 'delta', text: '...' }
  5. Mensagem do assistente renderizada progressivamente (texto streaming)
  6. { type: 'done' } → encerra stream
  7. Botão de envio desabilitado durante stream

On error:
  → Toast: "Não foi possível obter resposta. Tente novamente."
  → Input habilitado novamente

Ação de 1 clique (se IA sugere ação):
  → Card especial: "💡 Sugestão: Pausar 'Campanha X'"
  → Botão [Aplicar] inline no card
  → Executa ação diretamente (mesma lógica do toggle)
```

---

## 7. Accessibility (WCAG AA)

### 7.1 Requisitos obrigatórios por componente

| Componente | Requisito WCAG AA |
|-----------|------------------|
| Todos botões | `role="button"` implícito via `<button>`, ou `role` explícito + `aria-label` |
| Ícones sem texto | `aria-label` descritivo ou `aria-hidden="true"` + texto visível nearby |
| Campos de formulário | `<label>` associado via `htmlFor` / `aria-labelledby` |
| Toggle de campanha | `aria-label="Pausar campanha X"` / `"Ativar campanha X"` |
| Health dots | `aria-label="Saúde: Saudável"` (não comunicar status só por cor) |
| Tabelas | `<thead>` com `<th scope="col">`, `role="grid"` para tabelas interativas |
| Modais/Dialogs | `role="dialog"`, `aria-labelledby`, focus trap, ESC fecha |
| Imagens decorativas | `alt=""` |
| QR Code | `alt="QR Code para conexão do WhatsApp — escaneie com o aplicativo"` |
| Gráficos | `aria-label` descritivo + tabela alternativa acessível |

### 7.2 Contraste mínimo (verificado na Seção 1.1)

Todos os tokens de cor documentados na Seção 1.1 foram selecionados com contraste ≥ 4.5:1 para texto normal e ≥ 3:1 para texto grande / componentes de UI.

### 7.3 Teclado

- Tab navigation: sidebar → top bar → conteúdo da página
- Skip link: `<a href="#main-content">Ir para o conteúdo</a>` (visível ao focar)
- Focus visible: anel de foco brand-600 (2px solid, offset 2px) em todos os elementos interativos
- Dropdowns e Comboboxes: navegação com setas, Enter para selecionar, ESC para fechar

### 7.4 Testes obrigatórios (incrementais, conforme Seção 16 da arquitetura)

- `axe-core` nos componentes críticos a cada PR: Sidebar, Campaign Table, Dashboard Cards
- Navegação completa por teclado nos fluxos: Onboarding, Campaign Toggle, QR Code flow
- Verificação de contraste com Storybook a11y addon (quando Storybook for adicionado)

---

## 8. Tokens para tailwind.config.ts

```typescript
// apps/web/tailwind.config.ts (extensão de theme)
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          500: '#3B82F6',
          600: '#2563EB',  // PRIMARY
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        health: {
          good:    '#16A34A',  // green-600
          warning: '#D97706',  // amber-600
          critical:'#DC2626',  // red-600
        },
        platform: {
          meta:      '#1877F2',
          google:    '#4285F4',
          whatsapp:  '#25D366',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 9. Decisões de Design Abertas (não bloqueantes para Epics 1–3)

| Item | Status | Quando resolver |
|------|--------|----------------|
| Logo final do Advezo (SVG) | Pendente | Antes do lançamento público |
| Ilustrações para empty states (custom vs. ícone grande) | Ícone grande definido como padrão | Se design system evoluir |
| Toast de notificação: posição bottom-right vs. top-right | bottom-right (padrão ShadCN) | Implementação da Story 1.6 |
| Dark mode | Adiado pós-Beta | Epic 8+ |
| Mobile fully responsive | Adiado pós-Beta | Epic 8+ |
| Storybook / pattern library visual | Adiado pós-Beta | Quando equipe crescer |
| Painel do cliente final (FR-B5) | Não wireframado aqui — Epic 4+ | Antes de Epic 4 |
| Dashboard Rastreamento / Conversas / Conversões | Não wireframado — Epics 4–6 | Antes dos respectivos Epics |

---

## 10. Mapeamento de Screens → Stories

| Tela wireframada | Story responsável |
|-----------------|-------------------|
| Onboarding (criação de workspace) | **1.2** — Autenticação Multi-Tenant e Estrutura de Workspace |
| Design System, tokens, componentes base | **1.3** — Design System e Componentes Base |
| Clientes — Lista + Detalhe + Contas vinculadas | **1.4** — Gestão de Clientes (CRUD) |
| Layout Sidebar + Seletor de cliente/conta | **1.5** — Layout de Navegação Lateral e Seletor de Cliente |
| Dashboard Principal com saúde por cor | **1.6** — Dashboard Principal com Indicadores de Saúde |
| Campanhas — Listagem por conta | **2.5** — Listagem de Campanhas por Conta |
| Campanhas — Toggle + Edição de orçamento inline | **2.7** — Ações Inline: Pausar/Ativar e Ajustar Orçamento |
| Análise Comparativa 4 Semanas | **2.8** — Análise Comparativa de 4 Semanas |
| Conexão WhatsApp (fluxo QR Code) | **3.2** — Conexão de WhatsApp por Cliente |
| Config. Relatórios WhatsApp + Preview | **3.3** — Configuração de Relatórios Automáticos por Cliente |
| Dashboard Compartilhável (rota pública) | **3.7** — Dashboard Compartilhável com Branding da Agência |

---

*— Uma, desenhando com empatia 💝 — Advezo v2 UX/UI Spec v1.0 — 2026-06-25*
