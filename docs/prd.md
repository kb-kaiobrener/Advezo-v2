# Advezo v2 — Product Requirements Document (PRD)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-24 | 1.0 | Versão inicial do PRD v2 | Morgan / Kaio |

---

## 1. Goals and Background Context

### Goals

- **Rastrear a origem de vendas fechadas via WhatsApp** — conectar cada anúncio (Meta ou Google Ads) à conversa que gerou a venda real, classificar automaticamente por IA e retroalimentar o resultado na Conversions API do Meta Ads, fechando o ciclo de otimização do algoritmo
- Reconstruir o Advezo v2 com interface moderna, rápida e visualmente competitiva (referência: Criativivo), eliminando o retrabalho de gestores que hoje alternam entre gerenciadores de anúncio, planilhas e WhatsApp manual
- Centralizar gestão de Meta Ads + Google Ads num único painel multi-tenant, com dashboards de saúde visual por cliente e conta
- Automatizar relatórios e alertas proativos via WhatsApp para clientes finais, eliminando envio manual
- Gerar dashboards compartilháveis com branding da agência, eliminando o envio de planilha/print para o cliente
- Oferecer IA consultiva com sugestões de ação de 1 clique sobre os dados sincronizados
- Suportar modelo de agência: permissões granulares por colaborador, por conta e por funcionalidade

### Background Context

O Advezo v1 validou em produção os pilares fundamentais: autenticação multi-tenant, integração com Meta Ads e Google Ads via OAuth, sincronização de métricas, relatórios automáticos via WhatsApp e análise de campanhas por IA (Anthropic). Esta v2 é uma reconstrução completa em repositório novo — o código da v1 não é herdado, mas os aprendizados de produto são preservados (lógica de deduplicação de conversões Meta, criptografia de tokens, arquitetura de cron, instabilidade do serviço WhatsApp com Chromium).

**O diferencial central desta versão — e o gap mais crítico do mercado brasileiro de tráfego pago — é a camada de rastreamento que conecta o anúncio à venda real fechada por WhatsApp.** Hoje, nenhuma plataforma acessível no Brasil faz isso de forma simples: o gestor sabe quantos cliques ou mensagens um anúncio gerou, mas não sabe quantas dessas conversas viraram venda, nem consegue devolver esse dado à plataforma de anúncio para otimizar o algoritmo. O Advezo v2 resolve exatamente esse gap — rastreando a origem, classificando a conversa com IA e retroalimentando o Meta Ads via Conversions API.

Além do rastreamento, gestores de tráfego que atendem múltiplos clientes perdem tempo operacional alternando entre ferramentas. Clientes finais recebem planilhas ou prints em vez de dashboards claros. O saldo de verba ainda é monitorado de forma reativa. A v2 endereça todos esses pontos sobre uma interface completamente nova, com o rastreamento como o diferencial que nenhum concorrente genérico de gestão de tráfego entrega de forma integrada.

---

## 2. Requirements

### 2.1 Functional Requirements

#### FR-A — Gestão de Mídia (Meta Ads + Google Ads)

- **FR-A1:** O sistema deve permitir conectar múltiplas contas de Meta Ads e Google Ads por workspace, incluindo múltiplas Business Managers e contas filhas de MCC
- **FR-A2:** O sistema deve sincronizar campanhas e métricas diárias (gasto, impressões, cliques, conversões deduplicadas) de forma agendada e sob demanda
- **FR-A3:** O usuário deve poder pausar/ativar uma campanha e ajustar orçamento diário diretamente no Advezo, sem abrir o gerenciador nativo
- **FR-A4:** O dashboard principal deve exibir indicadores visuais de saúde (verde/amarelo/vermelho) por cliente e por conta, baseados em gasto vs. orçamento e status de sync
- **FR-A5:** O sistema deve oferecer análise comparativa das últimas 4 semanas por conta/campanha
- **FR-A6:** O sistema deve verificar saldo/orçamento e permitir configurar limites para alerta proativo

#### FR-B — Comunicação com Cliente

- **FR-B1:** O sistema deve enviar relatórios automáticos via WhatsApp com frequência configurável (diário/semanal/quinzenal/mensal), para número individual ou grupo do cliente
- **FR-B2:** O relatório deve detectar o objetivo predominante da conta (vendas, leads ou mensagens) pelo volume real de conversão e adaptar as métricas exibidas
- **FR-B3:** O sistema deve enviar alertas proativos via WhatsApp quando o saldo estiver projetado para esgotar em menos de N dias (configurável)
- **FR-B4:** O sistema deve gerar dashboards compartilháveis por cliente: link público, logo da agência, seleção de métricas, proteção por senha opcional
- **FR-B5:** O sistema deve oferecer painel logado para o cliente final visualizar seus próprios dados sem acesso às demais contas do workspace

#### FR-C — Rastreamento de Origem e Vendas via WhatsApp

> ⚠️ **Pré-requisito bloqueante para toda a seção FR-C:** NFR-3 (migração do serviço WhatsApp para Baileys, sem dependência de Chromium) deve estar resolvido — implementado como Story 3.1 — antes de iniciar qualquer story de FR-C1 em diante.

**Fase 1 — Origem** *(depende de: NFR-3 resolvido — Story 3.1)*

- **FR-C1:** O sistema deve gerar links rastreáveis que associam um clique a uma campanha/conjunto/anúncio de origem (Meta/Google Ads ou fonte arbitrária) e redirecionam para o WhatsApp do cliente
- **FR-C2:** O sistema deve registrar, ao receber a primeira mensagem de um número que clicou em link rastreável, a conversa como rastreada e vinculada à origem

**Fase 2 — Classificação por IA** *(depende de: Fase 1 completa; aplica NFR-5, NFR-6)*

- **FR-C3:** O sistema deve usar IA para ler o conteúdo da conversa e classificar automaticamente a etapa do funil de compra do lead
- **FR-C4:** O sistema deve usar IA para identificar quando uma conversa resultou em venda, incluindo estimativa do valor vendido, sem input manual do atendente

**Fase 3 — Retroalimentação e Dashboards** *(depende de: Fase 2 estável)*

- **FR-C5:** Quando uma conversa é classificada como venda, o sistema deve enviar automaticamente um evento de conversão (com valor) para a Conversions API do Meta Ads, vinculado à campanha/anúncio de origem
- **FR-C6:** Para Google Ads, o sistema deve gerar relatório de conversões periódico para importação manual
- **FR-C7:** O sistema deve exibir dashboard de vendas por WhatsApp: origem das conversas, % rastreadas, total de vendas, taxa de conversão e faturamento, por cliente e período
- **FR-C8:** O sistema deve permitir exportação dos dados de conversas rastreadas em CSV

**Futuro** *(não bloqueante para v2)*

- **FR-C9:** Auditoria de qualidade de atendimento via IA (tempo de resposta, aderência a script) — após Fases 1–3 estáveis

#### FR-D — IA Consultiva

- **FR-D1:** O sistema deve oferecer chat onde o usuário pergunta sobre desempenho de contas/campanhas em linguagem natural
- **FR-D2:** A IA deve sugerir ações concretas (pausar campanha, ajustar orçamento) baseadas nos dados sincronizados
- **FR-D3:** O usuário deve poder aplicar a ação sugerida pela IA com 1 clique, sem sair do chat
- **FR-D4:** O sistema deve manter histórico de conversas do chat por workspace e por usuário

#### FR-E — Plataforma e Administração

- **FR-E1:** O sistema deve ser multi-tenant com isolamento total de dados por workspace (RLS)
- **FR-E2:** O sistema deve permitir convidar colaboradores com permissões granulares: por conta de anúncio, por funcionalidade e por conexão de WhatsApp
- **FR-E3:** A navegação principal deve ter no máximo 6–7 itens de menu, com troca rápida de cliente/conta sem reload de página

---

### 2.2 Non-Functional Requirements

- **NFR-1:** Tokens de acesso das contas de anúncio armazenados criptografados (AES-256-GCM ou equivalente), nunca em texto puro
- **NFR-2:** Dashboards públicos (FR-B4) com acesso por token JWT de escopo restrito via Supabase RLS — nunca com service key exposta ao público
- **NFR-3:** Serviço de WhatsApp com reconexão automática, sem dependência de Chromium/Puppeteer (biblioteca: Baileys), viabilizando hospedagem em Railway sem consumo excessivo de memória
- **NFR-4:** Falhas de sync com Meta/Google Ads registradas em tabela dedicada e visíveis na interface — nunca falham silenciosamente
- **NFR-5:** Classificação de conversas por IA (FR-C3/C4) roda de forma assíncrona, sem impactar latência do atendimento via WhatsApp
- **NFR-6:** O sistema deve registrar nível de confiança da classificação de IA, permitindo revisão manual de casos de baixa confiança; conversões não são enviadas ao Meta automaticamente abaixo do limiar configurado
- **NFR-7:** Secrets de produção (API keys, tokens de criptografia) distintos dos de desenvolvimento, nunca reaproveitados de versões anteriores expostas
- **NFR-8:** O processamento de conteúdo de conversas de WhatsApp via API Anthropic constitui tratamento de dado pessoal de terceiro (o lead do cliente final). Base legal: legítimo interesse do controlador (agência/gestor) para fins de otimização de campanha e mensuração de resultado comercial. Requisitos: (a) aviso ao titular na primeira interação rastreada; (b) retenção de conteúdo bruto limitada a 90 dias após classificação — após esse período, reter apenas a classificação estruturada; (c) Anthropic reconhecida como subprocessadora de dados pessoais nesse fluxo. Decisão de estrutura contratual de subprocessamento a confirmar com @architect antes de iniciar Story 5.3.

---

## 3. User Interface Design Goals

### Overall UX Vision

Interface limpa, de leitura imediata — o gestor de tráfego deve conseguir avaliar a saúde de todos os seus clientes em menos de 30 segundos após o login. Velocidade de percepção é a métrica de UX mais importante. Referência visual: Criativivo — painel de SaaS moderno de tráfego pago, não um BI genérico. Tema claro como padrão; paleta principal em tons de azul; vermelho/laranja reservados a alerta e erro.

### Key Interaction Paradigms

**Navegação lateral fixa com 7 itens principais (FR-E3) — lista final aprovada 2026-06-25:**

| # | Item | Escopo |
|---|------|--------|
| 1 | Dashboard | Visão geral de todos os clientes com saúde por cor |
| 2 | Clientes | Lista de clientes, contas de anúncio e configurações por cliente |
| 3 | WhatsApp | Contas Baileys (Conexões), conversas classificadas (Conversas) e links rastreáveis (Links Rastreáveis) — sub-navegação por abas no content area |
| 4 | Conversões | Dashboard de vendas via WhatsApp, ROI e retroalimentação de conversões para Meta/Google |
| 5 | Relatórios | Frequência de relatórios automáticos, alertas proativos e dashboards compartilháveis |
| 6 | Assistente IA | Chat com histórico e ações de 1 clique sobre dados sincronizados |
| 7 | Configurações | Contas conectadas, integrações, workspace e gestão de equipe (sub-seção "Equipe" — não item de primeiro nível) |

> **"Rastreamento" como conceito:** links rastreáveis vivem em WhatsApp > Links Rastreáveis; resultados de conversão em Conversões. Não existe mais como item de primeiro nível.

- **Seletor de cliente/conta fixo no topo da sidebar**, acima dos 7 itens — sempre visível, trocável sem reload de página (estado global via Zustand)
- Cards com código de cor de saúde (verde/amarelo/vermelho) e números grandes nos indicadores mais lidos
- Ações de 1 clique direto nas listas — sem telas intermediárias para ações simples
- Ícone de plataforma (Meta, Google, WhatsApp) sempre visível ao lado do nome da conta em listas mistas
- Empty states orientativos em todas as telas novas, indicando o próximo passo

### Core Screens and Views

1. Dashboard principal — visão geral de todos os clientes com saúde por cor
2. Clientes → Conta → Campanhas — listagem com métricas, ações inline e acesso à análise comparativa
3. Rastreamento → [cliente] → Classificações — uso operacional: validar se a IA está classificando bem (Story 5.5)
4. Rastreamento → [cliente] → Resultados — uso comercial/ROI: apresentar resultado ao cliente (Story 6.3)
5. Rastreamento → Links — gerador e listagem de links rastreáveis
6. IA Consultiva — chat com histórico e sugestões de ação
7. Relatórios — configuração de frequência, alertas e dashboard compartilhável
8. Dashboard compartilhável — rota pública `/dashboard/[token]` com branding da agência
9. Painel do cliente final — acesso logado restrito ao próprio cliente

> **Nota de navegação:** As telas "Classificações" (5.5) e "Resultados" (6.3) são complementares, não substitutas. Ficam como sub-páginas dentro de Rastreamento → [cliente], não como itens separados no menu principal.

### Accessibility

WCAG AA — padrão mínimo para produto SaaS B2B comercial.

### Branding

- Paleta principal em tons de azul: azul primário forte (CTAs e estados ativos), azul médio (hover), azul claro/gelo (backgrounds secundários)
- Vermelho/laranja exclusivos para alertas e erros
- Verde exclusivo para estados positivos e saúde boa
- Tema claro como padrão
- Ícones de plataforma (Meta azul, Google colorido, WhatsApp verde) como linguagem visual consistente
- Dashboard compartilhável suporta substituição do logo pela marca da agência cliente

### Target Device and Platforms

Web responsivo — desktop prioritário (gestores trabalham em desktop), mobile como fallback para consulta rápida. Sem app nativo nesta versão.

---

## 4. Technical Assumptions

### Timeline e Estratégia de Entrega

Sem data de lançamento fixa; prioridade alta de velocidade de entrega. Faseamento sugerido:
- **Beta v2:** Epics 1–3 (Fundação + Gestão de Mídia + Comunicação com Cliente) — primeiro alvo de entrega, liberado tão rápido quanto a qualidade permitir
- **v2 Completo:** Epics 4–7 (Rastreamento + IA Consultiva) — em sequência imediata, sem pausa planejada entre fases

O @architect deve favorecer decisões que não bloqueiem velocidade de entrega nos Epics 1–3 (evitar gold-plating, preferir soluções simples e corretas a elaboradas), **sem comprometer os NFRs definidos** (criptografia AES-256-GCM, RLS, LGPD NFR-8), que são não-negociáveis independente de velocidade.

### Repository Structure

**Monorepo** — único repositório para frontend, backend (API routes/Server Actions do Next.js) e serviços auxiliares (WhatsApp worker, cron jobs).

### Service Architecture

| Camada | Tecnologia | Deploy |
|--------|-----------|--------|
| Frontend + API principal | Next.js 16+ (App Router), React, TypeScript, Tailwind CSS | Vercel |
| Estado global client-side | Zustand | — |
| Banco de dados | PostgreSQL via Supabase | Supabase (gerenciado) |
| WhatsApp worker (Baileys) + cron + fila de classificação | Node.js + Baileys | Railway (background worker service) |
| IA | Anthropic API (Claude) | API externa |
| Integrações externas | Meta Marketing API + Conversions API; Google Ads API | APIs externas |
| Autenticação | Supabase Auth | — |

### Testing Requirements

**Unit + Integration:**
- Unit tests para lógica de negócio crítica (deduplicação de conversões, classificação de IA, geração de links rastreáveis)
- Integration tests para fluxos de sync com Meta/Google Ads e envio de conversão via Conversions API
- E2E manual para fluxos de onboarding e dashboard compartilhável antes de releases
- Estratégia de sandbox por plataforma (Meta, Google, Anthropic) a definir pelo @architect antes do Epic 2

### Additional Technical Assumptions

- **Criptografia:** AES-256-GCM para tokens de acesso de contas de anúncio em repouso (NFR-1)
- **Hashing:** HMAC-SHA256 com salt por workspace para `phone_number_hash` e `ip_hash` — pseudonimização controlada, não anonimização irreversível (NFR-8 / LGPD Art. 5º, XII)
- **Fila de classificação assíncrona:** Tabela PostgreSQL `conversation_classification_queue` com colunas `status` (pending/processing/done/failed), `created_at`, `processed_at`, `error`, `retry_count`. Worker no Railway faz polling a cada N minutos (configurável). Sem Redis nesta fase — pode evoluir para BullMQ + Redis se volume justificar (NFR-5)
- **WhatsApp worker em Railway:** Serviço Node.js dedicado com Baileys (sem Chromium); Railway gerenciado elimina fragilidade de VM auto-gerenciada da v1. Sessão Baileys persistida no **Supabase Storage** (não em volume Railway) — durável em caso de migração ou recriação do serviço (NFR-3)
- **Secrets:** Variáveis de ambiente separadas por ambiente; secrets de produção nunca reaproveitados da v1 (NFR-7)
- **Conversions API Meta:** Reaproveitamento do fluxo OAuth da v1, adaptado ao novo schema Supabase
- **Google Ads Developer Token:** Validar aprovação para produção antes de stories que dependam desta API em ambiente real
- **Dashboards públicos:** Token JWT de escopo restrito via Supabase — nunca com service key exposta (NFR-2)
- **Confiança de IA:** Registrada em coluna dedicada na tabela de classificações; limiar configurável por workspace via UI (Story 5.6); casos abaixo do limiar disponíveis para revisão manual antes de envio ao Meta (NFR-6)
- **Edge Function para redirect:** Rota `/t/[code]` implementada como Vercel Edge Function para latência consistente < 300ms sem cold start
- **Observabilidade:** Sentry (erros de aplicação — Next.js + Railway workers), Vercel Analytics (Core Web Vitals e performance de páginas), Railway metrics nativos (CPU/memória dos workers). Alertas mínimos: error rate > 5% em 5min e latência p95 > 3s

---

## 5. Out of Scope (nesta versão)

- Gestão de Instagram orgânico (calendário/agendamento de posts)
- Estúdio criativo com IA (editor visual para gerar vídeo/imagem)
- Gerador de criativos em massa com IA
- App mobile nativo (iOS/Android) — web responsivo é suficiente nesta fase
- Rastreamento via UTM para e-commerce com integrações de checkout (Shopify, Hotmart, etc.)
- Auditoria de qualidade de atendimento via IA (FR-C9) — listado como requisito futuro, não bloqueante

---

## 6. Risks and Known Restrictions

| Risco | Mitigação |
|-------|-----------|
| WhatsApp worker instável (Chromium/Puppeteer) | Migrar para Baileys antes do módulo de rastreamento (Story 3.1 — bloqueante para Epics 3, 4, 5 e 6) |
| Conversions API Meta exige token OAuth com permissões corretas | Reaproveitar fluxo OAuth da v1; validar permissões na Story 2.1 |
| Classificação de venda por IA pode gerar falsos positivos/negativos | Registrar nível de confiança (NFR-6); limiar configurável (Story 5.6); gate obrigatório antes de enviar ao Meta |
| Google Ads API exige Developer Token aprovado para produção | Validar aprovação com antecedência antes de Stories críticas do Epic 2 |
| Rastreamento via WhatsApp não cobre 100% dos casos (grupos, conversas sem mensagem enviada) | Limitação comunicada desde o PRD — não é bug, é limitação de design do canal |
| LGPD — processamento de conteúdo de conversas via Anthropic | NFR-8: base legal documentada, aviso ao titular (AC Story 4.4), retenção 90 dias, Anthropic como subprocessadora |
| Broken Access Control no chat de IA (colaboradores sem permissão) | Story 7.3: verificação de permissão obrigatória antes de injetar dados no contexto; teste explícito no QA gate |

---

## 7. Objectives and Success Metrics

| Objetivo | Métrica de sucesso |
|----------|-------------------|
| Visual mais fácil de navegar | Tempo para localizar status de uma conta específica reduzido em relação à v1 (medir por teste com usuário) |
| Dashboards compartilháveis | % de clientes ativos com dashboard público configurado dentro de 30 dias do lançamento |
| Rastreamento de vendas via WhatsApp | % de conversas com origem identificada automaticamente (meta: > 70%) |
| Retroalimentação de conversão | Conversões reais enviadas ao Meta Ads via Conversions API por semana, por conta ativa |
| Redução de churn por saldo zerado | Queda no número de campanhas pausadas por falta de saldo sem alerta prévio |

---

## 8. Personas

| Persona | Necessidade principal |
|---------|----------------------|
| Gestor de tráfego autônomo | Centralizar contas de clientes, ver saúde das campanhas rapidamente, automatizar relatório |
| Agência (vários gestores) | Tudo da persona anterior + controle de permissão por colaborador e por conta |
| Cliente final do gestor | Visibilidade simples do investimento e resultado, sem precisar entender o gerenciador de anúncios |

---

## 9. Market References (Benchmark)

**Criativivo (criativivo.com.br):** Plataforma de gestão de tráfego pago para agências — Meta Ads + Google Ads + Instagram orgânico num só painel, dashboards compartilháveis, relatórios e alertas via WhatsApp, Super Agente de IA com ações de 1 clique, CRM multicanal, gerador de criativos com IA, rastreamento via UTM e via WhatsApp, permissões granulares, app mobile. Posicionamento: eliminar planilha e retrabalho.

**Tintim (tintim.app):** Ferramenta especializada em rastreamento de vendas por WhatsApp — identifica origem da conversa (campanha/anúncio Meta/Google ou fonte rastreável), classifica etapa do funil e venda via IA, devolve conversão ao Meta via Conversions API. Limitações: não rastreia entrada em grupos; só captura origem a partir do envio da primeira mensagem.

---

## 10. Epic List

| # | Epic | Entrega |
|---|------|---------|
| 1 | Fundação e Navegação | Infra, design system, auth multi-tenant, navegação, dashboard inicial |
| 2 | Gestão de Mídia (Meta Ads + Google Ads) | OAuth, sync, ações inline, análise 4 semanas, alertas de saldo |
| 3 | Comunicação com Cliente | Relatórios WhatsApp, alertas, dashboard compartilhável, painel do cliente |
| 4 | Rastreamento Fase 1: Origem | Links rastreáveis, captura automática de origem por conversa |
| 5 | Rastreamento Fase 2: Classificação por IA | Classificação de funil e venda, fila assíncrona, revisão manual |
| 6 | Rastreamento Fase 3: Retroalimentação | Conversions API Meta, relatório Google, dashboard de vendas, CSV |
| 7 | IA Consultiva | Chat com dados reais, sugestões de ação de 1 clique, histórico |

> **Faseamento:** Beta v2 = Epics 1–3. v2 Completo = Epics 4–7 em sequência imediata.

---

## 11. Epic Details

---

### Epic 1 — Fundação e Navegação

**Goal:** Estabelecer toda a infraestrutura técnica do projeto (Next.js no Vercel, Supabase com RLS, Railway skeleton) e entregar a primeira fatia de valor visível ao gestor: autenticação multi-tenant funcional, design system em tons de azul, navegação lateral com 7 itens, seletor de cliente/conta e dashboard principal com indicadores de saúde por cor.

#### Story 1.1 — Setup de Projeto e Infraestrutura Base

> Como desenvolvedor do Advezo, quero o repositório configurado com Next.js 16+, Supabase, Railway skeleton e CI/CD básico no Vercel, para que qualquer story seguinte possa ser desenvolvida sobre uma base estável e deployável desde o início.

**Acceptance Criteria:**
1. Repositório criado com Next.js 16+ (App Router), TypeScript, Tailwind CSS e ESLint/Prettier configurados
2. Projeto Supabase criado com variáveis de ambiente configuradas (`.env.local` e Vercel env vars)
3. Deploy automático no Vercel funcionando a partir do branch `main`
4. Railway projeto criado com serviço `whatsapp-worker` skeleton (Node.js — apenas health check respondendo 200, sem lógica ainda)
5. Estrutura de pastas definida conforme preset `nextjs-react`
6. README com instruções de setup local

---

#### Story 1.2 — Autenticação Multi-Tenant e Estrutura de Workspace

> Como gestor de tráfego, quero criar minha conta, fazer login e pertencer a um workspace, para que meus dados fiquem isolados dos demais workspaces e eu possa convidar colaboradores no futuro.

**Acceptance Criteria:**
1. Fluxo de cadastro e login via Supabase Auth (email/senha) funcionando
2. Tabela `workspaces` criada com RLS: usuário só acessa dados do próprio workspace
3. Tabela `workspace_members` com campo `role` (owner/member) — owner atribuído automaticamente ao criador
4. Middleware Next.js protegendo todas as rotas autenticadas; redirecionamento para `/login` se não autenticado
5. Rota `/onboarding` para criação do workspace após primeiro login
6. Testes de RLS: usuário A não consegue acessar dados do workspace B

---

#### Story 1.3 — Design System e Componentes Base

> Como desenvolvedor do Advezo, quero um design system com tokens de cor em azul, tipografia e componentes base, para que todas as telas seguintes sejam construídas com consistência visual.

**Acceptance Criteria:**
1. Paleta de cores definida em `tailwind.config.ts`: azul primário (ação/ativo), azul médio (hover), azul claro (background secundário), vermelho/laranja (alerta/erro), verde (positivo)
2. Componentes base criados: `Button` (variantes: primary/secondary/ghost/danger), `Card`, `StatusBadge` (verde/amarelo/vermelho), `Input`, `Select`
3. Componente `PlatformIcon` com ícones para Meta, Google Ads e WhatsApp
4. Página `/design` com preview dos componentes (facilita desenvolvimento das próximas stories)
5. Todos os componentes com suporte a dark text sobre fundo claro (tema claro padrão)

---

#### Story 1.4 — Gestão de Clientes (CRUD)

> Como gestor de tráfego, quero criar e gerenciar meus clientes dentro do meu workspace, para que as contas de anúncio, relatórios e rastreamentos sejam sempre organizados por cliente.

**Acceptance Criteria:**
1. Tabela `clients` criada: `id`, `workspace_id`, `name`, `status` (active/archived), `created_at`, `updated_at`
2. RLS: usuário só acessa clientes do próprio workspace (consistente com Story 1.2)
3. UI na rota `/clientes`: lista de clientes com nome, status e data de criação
4. Modal ou página para criar cliente (nome obrigatório) e editar nome
5. Ação de arquivar cliente (status → archived) — sem exclusão física para preservar histórico
6. Clientes arquivados filtráveis (ocultos por padrão, visíveis com toggle "Mostrar arquivados")
7. Seletor de cliente da Story 1.5 populado com dados reais desta tabela

---

#### Story 1.5 — Layout de Navegação Lateral e Seletor de Cliente

> Como gestor de tráfego, quero uma navegação lateral com 7 itens e um seletor de cliente/conta fixo no topo, para que eu consiga mudar de contexto rapidamente sem reload de página.

**Acceptance Criteria:**
1. Sidebar fixa com os 7 itens: Dashboard, Clientes, Rastreamento, Relatórios, IA Consultiva, Equipe, Configurações
2. Item ativo destacado visualmente (azul primário)
3. Seletor de cliente/conta acima dos itens de menu, sempre visível — exibe nome do cliente atual e permite troca por dropdown
4. Troca de cliente/conta atualiza o contexto da página sem reload (estado global via Zustand)
5. Em mobile (< 768px): sidebar colapsável com ícones apenas
6. Empty state no seletor quando não há clientes cadastrados, com CTA "Adicionar cliente"

---

#### Story 1.6 — Dashboard Principal com Indicadores de Saúde

> Como gestor de tráfego, quero ver no dashboard principal todos os meus clientes com indicadores visuais de saúde (verde/amarelo/vermelho), para que eu avalie a situação geral em menos de 30 segundos após o login.

**Acceptance Criteria:**
1. Dashboard exibe cards por cliente com: nome, número de contas ativas, indicador de saúde e data do último sync
2. Lógica de cor de saúde baseada em dados mockados nesta story (dados reais chegam na Story 2.6): verde = tudo ok, amarelo = sync desatualizado ou saldo < 20%, vermelho = campanha pausada por saldo zerado ou erro de sync
3. Indicador numérico grande por cliente: gasto total do período, número de campanhas ativas
4. Ordenação padrão: clientes com status vermelho aparecem primeiro
5. Empty state orientativo quando não há clientes, com CTA "Conectar primeira conta"
6. Loading skeleton durante carregamento dos dados

---

### Epic 2 — Gestão de Mídia (Meta Ads + Google Ads)

**Goal:** Habilitar o gestor a operar todas as contas de Meta Ads e Google Ads dos seus clientes diretamente no Advezo — conectando via OAuth, sincronizando campanhas e métricas de forma agendada e sob demanda, executando ações inline e visualizando saúde e histórico de 4 semanas sem abrir o gerenciador nativo.

#### Story 2.1 — Conexão de Contas Meta Ads via OAuth

> Como gestor de tráfego, quero conectar minha Business Manager e contas de anúncio do Meta Ads via OAuth, para que o Advezo acesse os dados e execute ações em meu nome com segurança.

**Acceptance Criteria:**
1. Fluxo OAuth 2.0 com Meta completo: redirect → autorização → callback → armazenamento do token
2. Token criptografado em repouso com AES-256-GCM antes de persistir no Supabase (NFR-1)
3. Suporte a múltiplas Business Managers por workspace; listagem de contas filhas disponíveis após OAuth
4. Tabela `ad_accounts`: `id`, `platform` (meta), `workspace_id`, `client_id`, `external_account_id`, `encrypted_token`, `status`, `last_synced_at`
5. UI em Configurações → Integrações: botão "Conectar Meta Ads", lista de contas conectadas com status
6. Tratamento de token expirado: alerta visível na UI e na conta afetada (NFR-4)

---

#### Story 2.2 — Conexão de Contas Google Ads via OAuth

> Como gestor de tráfego, quero conectar minhas contas Google Ads (incluindo contas filhas de MCC) via OAuth, para gerenciá-las junto com as contas Meta no mesmo painel.

**Acceptance Criteria:**
1. Fluxo OAuth 2.0 com Google completo: redirect → autorização → callback → armazenamento de token e refresh token
2. Token e refresh token criptografados com AES-256-GCM (NFR-1)
3. Suporte a MCC: após OAuth, listar contas filhas acessíveis e permitir seleção
4. Reutiliza tabela `ad_accounts` com `platform` = google
5. UI consistente com Story 2.1: botão "Conectar Google Ads" na mesma tela de integrações
6. Validar que o Developer Token tem acesso de produção; exibir alerta se token for apenas de teste

---

#### Story 2.3 — Sync de Campanhas e Métricas (Meta Ads)

> Como gestor de tráfego, quero que o Advezo sincronize automaticamente campanhas e métricas diárias das minhas contas Meta Ads, para que os dados estejam atualizados sem intervenção manual.

**Acceptance Criteria:**
1. Cron no Railway executa sync diário de todas as contas Meta Ads ativas (horário configurável via env var)
2. Sync busca: campanhas (nome, status, orçamento diário), métricas do dia (gasto, impressões, cliques, conversões deduplicadas)
3. Deduplicação de conversões Meta aplicada (lógica preservada da v1)
4. Tabela `campaign_metrics` com dados por dia, conta e campanha
5. Botão "Sincronizar agora" disponível na UI por conta — executa sync sob demanda
6. Falhas de sync registradas em `sync_errors` e visíveis na UI da conta afetada (NFR-4)
7. `last_synced_at` em `ad_accounts` atualizado ao final de cada sync bem-sucedido

---

#### Story 2.4 — Sync de Campanhas e Métricas (Google Ads)

> Como gestor de tráfego, quero que o Advezo sincronize campanhas e métricas das minhas contas Google Ads com a mesma cadência das contas Meta, para ter visão unificada no painel.

**Acceptance Criteria:**
1. Cron no Railway inclui Google Ads no ciclo de sync diário existente
2. Sync busca: campanhas (nome, status, orçamento), métricas do dia (gasto, impressões, cliques, conversões)
3. Reutiliza tabela `campaign_metrics` — campo `platform` distingue fonte
4. Botão "Sincronizar agora" funcional para contas Google
5. Falhas de sync Google registradas e visíveis na UI (NFR-4)
6. Refresh token renovado automaticamente quando expirado; alerta se renovação falhar

---

#### Story 2.5 — Listagem de Campanhas por Conta

> Como gestor de tráfego, quero ver todas as campanhas de uma conta de anúncio listadas com seus dados principais, para que eu possa monitorar status e desempenho e acessar ações e análises diretamente dessa tela.

**Acceptance Criteria:**
1. Tela acessível via Clientes → [cliente] → [conta]: lista de campanhas da conta selecionada
2. Colunas: ícone de plataforma (Meta/Google), nome da campanha, status (ativa/pausada/arquivada), orçamento diário, gasto do dia
3. Filtros: por status e busca por nome de campanha
4. Dados provenientes de `campaign_metrics` já sincronizados — sem chamada extra à API externa
5. Placeholder para ações inline (botão Pausar/Ativar) e link para análise comparativa — implementados nas Stories 2.7 e 2.8
6. Empty state orientativo com CTA "Sincronizar agora" quando não há campanhas

---

#### Story 2.6 — Dashboard de Saúde por Cliente (dados reais)

> Como gestor de tráfego, quero que o dashboard principal exiba indicadores de saúde com dados reais sincronizados, substituindo os dados mockados da Story 1.6.

**Acceptance Criteria:**
1. Cards do dashboard populados com dados reais de `campaign_metrics` e `ad_accounts`
2. Lógica de cor de saúde com dados reais: verde = sync < 6h + saldo > 30%, amarelo = sync 6h–24h ou saldo 10–30%, vermelho = sync > 24h ou saldo < 10% ou erro de campanha
3. Indicadores por cliente: gasto total do período, ROAS médio, conversões totais
4. Filtro de período: hoje, últimos 7 dias, últimos 30 dias
5. Ícone de plataforma (Meta/Google) visível em cada conta dentro do card do cliente

---

#### Story 2.7 — Ações Inline: Pausar/Ativar e Ajustar Orçamento

> Como gestor de tráfego, quero pausar, ativar uma campanha e ajustar seu orçamento diário diretamente no Advezo, sem abrir o gerenciador nativo.

**Acceptance Criteria:**
1. Na listagem de campanhas (Story 2.5): botão inline "Pausar" (se ativa) ou "Ativar" (se pausada)
2. Ação chama a API da plataforma correspondente e atualiza status local após confirmação da API
3. Campo de orçamento diário editável inline com confirmação
4. Feedback visual imediato: loading state durante chamada, estado atualizado sem reload
5. Erros de API exibidos inline com mensagem clara
6. Ações registradas em `action_log`: quem, o quê, quando, resultado

---

#### Story 2.8 — Análise Comparativa de 4 Semanas

> Como gestor de tráfego, quero ver a comparação de métricas das últimas 4 semanas para uma conta ou campanha, para identificar tendências sem precisar exportar dados.

**Acceptance Criteria:**
1. Tela de análise comparativa acessível por conta e por campanha individual
2. Exibe gasto, impressões, cliques, conversões e ROAS semana a semana (4 colunas: S-4, S-3, S-2, S-1)
3. Variação percentual entre semanas: verde se melhora, vermelho se piora, cinza se neutro (< 5%)
4. Dados provenientes de `campaign_metrics` — sem chamada adicional à API externa
5. Exportação dos dados comparativos em CSV

---

#### Story 2.9 — Alertas de Saldo Proativo (UI)

> Como gestor de tráfego, quero configurar um limite de saldo por conta e ver alerta quando o saldo estiver projetado para esgotar em menos de N dias, para evitar campanhas pausadas por falta de verba.

**Acceptance Criteria:**
1. Campo configurável por conta: "Alertar quando saldo projetado para esgotar em menos de N dias" (padrão: 3 dias)
2. Cron de verificação de saldo roda diariamente, aproveitando o ciclo de sync
3. Projeção calculada com base na média de gasto diário dos últimos 7 dias vs. saldo restante
4. Alerta registrado em `alerts` com tipo, conta, data e status (sent/pending/dismissed)
5. Alerta visível na UI: badge na conta afetada no dashboard e na tela da conta
6. Envio via WhatsApp implementado no Epic 3 (Story 3.6) — esta story cria o mecanismo de detecção e registro

---

### Epic 3 — Comunicação com Cliente

**Goal:** Eliminar o trabalho manual do gestor na comunicação com clientes — relatórios automáticos via WhatsApp adaptados ao objetivo real da conta, alertas proativos antes do saldo zerar, e dashboard compartilhável com branding da agência que substitui planilha. Base técnica: serviço WhatsApp estável via Baileys, migrado na Story 3.1 antes de qualquer outra story deste epic.

#### Story 3.1 — Migração do WhatsApp Worker para Baileys

> Como desenvolvedor do Advezo, quero substituir a integração WhatsApp baseada em Chromium/Puppeteer pela biblioteca Baileys, para que o worker seja estável em Railway sem consumo excessivo de memória.

> ⚠️ **Bloqueante para Epics 3, 4, 5 e 6 inteiros.** Nenhuma story que dependa de conexão WhatsApp pode começar antes desta ser aprovada no QA gate.

**Acceptance Criteria:**
1. Serviço Node.js no Railway substitui whatsapp-web.js/Puppeteer por Baileys como biblioteca de conexão
2. QR code de autenticação gerado e exibido via endpoint do worker (consumido pela UI na Story 3.2)
3. Sessão WhatsApp persiste entre restarts do Railway — arquivo de sessão armazenado no **Supabase Storage** (não em volume Railway)
4. **Critério de estabilidade obrigatório:** sessão permanece conectada por no mínimo 24h sem queda em ambiente Railway, sem qualquer dependência de Chromium ou Puppeteer
5. Envio de mensagem de texto simples validado end-to-end (mensagem enviada e recebida com sucesso)
6. Reconexão automática em caso de queda transitória de rede — sem intervenção manual
7. Chromium/Puppeteer completamente removidos do serviço; build do Railway não instala dependências de browser

---

#### Story 3.2 — Conexão de WhatsApp por Cliente

> Como gestor de tráfego, quero conectar um número de WhatsApp a cada cliente, para que relatórios e alertas sejam enviados pelo número correto sem misturar comunicações entre clientes.

**Acceptance Criteria:**
1. UI em Clientes → [cliente] → Configurações: botão "Conectar WhatsApp" exibe QR code gerado pelo worker Baileys
2. Sessão autenticada salva em `whatsapp_connections` (`workspace_id`, `client_id`, `status`, `connected_at`)
3. Campo de template de aviso ao titular configurável (texto enviado automaticamente ao lead na primeira conversa rastreada — NFR-8)
4. Status de conexão visível na UI: conectado (verde) / desconectado (vermelho) / aguardando QR (amarelo)
5. Suporte a múltiplos números por cliente
6. Reconexão automática via Railway restart policy sem intervenção manual (NFR-3)
7. Desconexão manual disponível na UI

---

#### Story 3.3 — Configuração de Relatórios Automáticos por Cliente

> Como gestor de tráfego, quero configurar para cada cliente a frequência, o horário e o destinatário dos relatórios automáticos, para que o envio ocorra sem intervenção minha.

**Acceptance Criteria:**
1. UI de configuração por cliente: frequência (diário/semanal/quinzenal/mensal), dia da semana e hora do envio
2. Destinatário configurável: número individual **ou grupo de WhatsApp** (ambos suportados — FR-B1)
3. Configurações salvas em `report_schedules` (`client_id`, `frequency`, `send_day`, `send_time`, `destination_type`, `destination_id`)
4. Cron no Railway lê `report_schedules` e enfileira relatórios no horário configurado
5. Preview do relatório disponível na UI antes de ativar (conteúdo exibido sem envio real)
6. Toggle para ativar/desativar envio automático sem apagar a configuração

---

#### Story 3.4 — Geração de Relatório (texto formatado)

> Como sistema do Advezo, quero gerar automaticamente o texto do relatório com as métricas do período, adaptado ao objetivo predominante da conta, para que o conteúdo seja correto e formatado antes de ser enviado.

**Acceptance Criteria:**
1. Função geradora recebe `client_id` + período e retorna texto formatado — testável unitariamente sem conexão WhatsApp
2. Detecção automática do objetivo predominante pelo volume real de conversão: vendas → ROAS e conversões; leads → CPL e volume; mensagens → CPM e volume
3. Formato texto puro compatível com WhatsApp: sem HTML, com emojis de status, números em PT-BR (ex.: R$ 1.234,56)
4. Variações de formato testadas com dados de cada tipo de objetivo (3 cenários de teste obrigatórios)
5. Dados provenientes exclusivamente de `campaign_metrics` — sem chamada à API externa durante geração

---

#### Story 3.5 — Envio de Relatório via WhatsApp

> Como gestor de tráfego, quero que o relatório gerado seja enviado automaticamente via WhatsApp ao destinatário configurado, com suporte a número individual e grupo.

**Acceptance Criteria:**
1. Consome o texto gerado pela Story 3.4 e a conexão WhatsApp da Story 3.2
2. **Suporte explícito a grupo de WhatsApp como destinatário**, além de número individual (FR-B1) — critério testado com envio real para grupo
3. Envio executado via Baileys usando a conexão ativa da conta
4. Registro de envio em `report_logs` (`schedule_id`, `sent_at`, `status`, `destination_type`, `error_message`)
5. Reenvio manual disponível na UI para qualquer relatório do histórico
6. Falhas de envio visíveis na UI com mensagem de erro clara (NFR-4)
7. Sem envio duplicado: relatório já enviado no período não é reenviado pelo cron

---

#### Story 3.6 — Alertas Proativos de Saldo via WhatsApp

> Como gestor de tráfego, quero receber alerta via WhatsApp quando o saldo de uma conta estiver projetado para esgotar em menos de N dias, para agir antes da campanha ser pausada.

**Acceptance Criteria:**
1. Consome alertas gerados pela Story 2.9 (tabela `alerts` com status pending)
2. Destinatário configurável por conta (gestor ou cliente — independente do destinatário de relatório)
3. Mensagem inclui: nome da conta, saldo atual, projeção de dias restantes e sugestão de ação
4. Alerta marcado como `sent` após envio; `failed` com erro registrado se falhar
5. Sem envio duplicado: alerta já enviado não é reenviado no próximo ciclo do cron
6. Suporte a grupo de WhatsApp como destinatário (consistente com Story 3.5)

---

#### Story 3.7 — Dashboard Compartilhável com Branding da Agência

> Como gestor de tráfego, quero gerar um link público de dashboard para cada cliente com meu logo e as métricas que eu selecionar, para substituir o envio de planilha ou print.

**Acceptance Criteria:**
1. UI em Clientes → [cliente]: botão "Gerar dashboard" com configurações — seleção de métricas, upload de logo, proteção por senha opcional
2. Rota pública `/dashboard/[token]` com token JWT de escopo restrito via Supabase — sem service key exposta (NFR-2)
3. Dashboard exibe: logo da agência, nome do cliente, métricas selecionadas, data da última atualização
4. Proteção por senha: rota exige senha antes de exibir dados quando configurada
5. Link copiável na UI com botão "Compartilhar"
6. Dashboard atualizado automaticamente a cada sync — sem gerar novo link
7. Opção de desativar link (token invalidado) sem apagar configuração
8. **Tempo de carregamento da página pública abaixo de 2 segundos em conexão 4G padrão** — medido via Lighthouse ou WebPageTest em ambiente de produção (Vercel Edge)

---

#### Story 3.8 — Painel Logado do Cliente Final

> Como cliente final de uma agência, quero acessar um painel com login próprio para ver os dados das minhas contas de anúncio, sem ter acesso às contas dos demais clientes.

**Acceptance Criteria:**
1. Fluxo de convite: gestor gera convite por email; cliente cria senha e acessa `/cliente`
2. RLS garante acesso apenas ao próprio `client_id` — acesso a outro cliente retorna erro 403 (testado explicitamente)
3. Painel exibe métricas das contas vinculadas, filtro de período e indicadores de saúde por cor
4. Cliente não tem acesso a: ações de pausar/ajustar, configurações de workspace, dados de outros clientes
5. UI simplificada — apenas visualização, sem funcionalidades de gestão
6. Sessão expira em 7 dias sem refresh automático prolongado

---

### Epic 4 — Rastreamento Fase 1: Origem

> ✅ **Pré-requisito:** Story 3.1 (Migração Baileys) com QA gate PASS antes de iniciar qualquer story deste epic.

**Goal:** Habilitar o rastreamento da origem de cada conversa de WhatsApp — desde o clique no anúncio (Meta ou Google Ads) ou em qualquer fonte arbitrária até o registro automático da conversa como rastreada quando a primeira mensagem é recebida. Ao final deste epic, o gestor sabe de onde veio cada lead que entrou no WhatsApp do cliente, sem intervenção manual.

#### Story 4.1 — Schema e Modelo de Dados de Rastreamento

> Como desenvolvedor do Advezo, quero o modelo de dados de rastreamento criado no Supabase com RLS por workspace, para que todas as stories seguintes persistam dados de forma consistente e segura.

**Acceptance Criteria:**
1. Tabela `tracking_links`: `id`, `workspace_id`, `client_id`, `code` (único), `source_type` (meta_ad/google_ad/custom), `source_meta` (JSONB — campaign_id, adset_id, ad_id ou label customizado), `destination_whatsapp`, `active`, `created_at`
2. Tabela `tracked_clicks`: `id`, `link_id`, `clicked_at`, `ip_hash` (HMAC-SHA256 com salt por workspace), `user_agent`, `phone_matched` (boolean), **`gclid` (TEXT, nullable — preenchido quando clique vem de anúncio Google Ads)**
3. Tabela `tracked_conversations`: `id`, `workspace_id`, `client_id`, `link_id`, `click_id`, `phone_number_hash` (HMAC-SHA256 com salt por workspace), `first_message_at`, `origin_confirmed_at`, `status` (tracked/untracked)
4. RLS em todas as tabelas: workspace só acessa seus próprios dados
5. Índices em `tracking_links.code`, `tracked_clicks.link_id`, `tracked_conversations.phone_number_hash`
6. **Nota técnica LGPD (obrigatória):** `phone_number_hash` e `ip_hash` usam HMAC-SHA256 com salt derivado do `workspace_id` + secret de ambiente — pseudonimização com controle de acesso, não anonimização irreversível (LGPD Art. 5º, XII). O sistema retém capacidade de re-identificação para funcionamento interno. Nunca afirmar que os dados são "anônimos".
7. Migration com rollback documentado

---

#### Story 4.2 — Gerador e Gestão de Links Rastreáveis

> Como gestor de tráfego, quero criar links rastreáveis que associam um clique a uma campanha ou fonte de origem e redirecionam para o WhatsApp do cliente, para que eu possa distribuí-los em anúncios, bio ou QR code.

**Acceptance Criteria:**
1. UI na seção Rastreamento → Links: formulário com campos — cliente, fonte de origem (Meta Ads: campanha/conjunto/anúncio via dropdown; Google Ads: idem; Custom: campo de texto livre)
2. `code` único gerado automaticamente (8 caracteres alfanuméricos) e editável pelo usuário
3. URL final: `{domínio}/t/{code}` — exibida e copiável na UI
4. Listagem de links por cliente com: código, fonte, número de cliques, status (ativo/inativo)
5. Toggle ativo/inativo por link sem excluir o histórico de cliques
6. QR code gerado automaticamente para cada link — disponível para download em PNG
7. Edição permitida após criação: `source_meta` (label customizado) e `destination_whatsapp` editáveis; **`code` não editável** após criação (links já distribuídos devem continuar funcionando)

---

#### Story 4.3 — Serviço de Redirect e Log de Cliques (Edge Function)

> Como sistema do Advezo, quero que a rota `/t/[code]` registre o clique, armazene metadados de forma privada e redirecione o usuário para o WhatsApp do cliente.

**Acceptance Criteria:**
1. **Vercel Edge Function** em `/t/[code]` — sem cold start, latência consistente em edge nodes globais
2. Registro em `tracked_clicks`: `link_id`, `clicked_at`, IP hasheado com HMAC-SHA256 por workspace, `user_agent`, **`gclid` extraído do parâmetro de query string `?gclid=` da URL recebida** (nullable — presente apenas em cliques do Google Ads)
3. Redirect 302 para URL do WhatsApp do cliente (`https://wa.me/{número}`) após registro
4. Redirect ocorre mesmo se o log do clique falhar (fire-and-forget com retry em background) — latência < 300ms
5. Link inativo retorna redirect para página de erro customizada — nunca 404 genérico
6. Link inexistente retorna 404 com página de erro customizada

---

#### Story 4.4 — Captura Automática de Origem na Primeira Mensagem

> Como sistema do Advezo, quero que o worker Baileys identifique automaticamente a origem de uma conversa ao receber a primeira mensagem, vinculando o número do remetente a um clique recente em link rastreável.

**Acceptance Criteria:**
1. Worker Baileys, ao receber mensagem de um número novo, calcula HMAC-SHA256 do número (salt por workspace) e consulta `tracked_clicks` dos últimos 7 dias (janela configurável via env var)
2. Se match encontrado: cria registro em `tracked_conversations` com `link_id`, `click_id`, `phone_number_hash`, `first_message_at`, `status = tracked`
3. **Estratégia LIFO cross-link:** se o mesmo número clicou em múltiplos links no período, vincula ao clique mais recente globalmente, independente do link de origem. Comportamento documentado no código e testado com caso de múltiplos links.
4. Se nenhum match: conversa registrada com `status = untracked` — nunca ignorada
5. Matching assíncrono em relação ao recebimento da mensagem — não bloqueia o atendimento (NFR-5)
6. **Aviso ao titular:** ao registrar conversa como `tracked`, envia automaticamente mensagem de aviso ao lead usando o template configurado na Story 3.2. Envio do aviso é requisito para que `classification_status` seja elegível ao processamento do Epic 5 (NFR-8)
7. Logs de debug ativáveis via env var `TRACKING_DEBUG=true`

---

#### Story 4.5 — Dashboard de Origem de Conversas

> Como gestor de tráfego, quero visualizar de onde vieram as conversas rastreadas do WhatsApp de um cliente, para validar o funcionamento do rastreamento e ter dados de origem por campanha.

**Acceptance Criteria:**
1. Tela Rastreamento → [cliente] → Classificações (sub-página): lista de conversas rastreadas com origem, data da primeira mensagem e status (tracked/untracked)
2. Filtros: por período, por link/origem, por status
3. Contador de resumo: total de conversas no período, % rastreadas vs. não rastreadas
4. Conversas untracked exibidas com label "Origem não identificada" — não ocultadas
5. Dados em tempo real: conversas aparecem assim que processadas pelo worker
6. Empty state com CTA "Criar primeiro link rastreável" quando não há links ativos

---

### Epic 5 — Rastreamento Fase 2: Classificação por IA

> ✅ **Pré-requisito:** Epic 4 completo com QA gate PASS — especificamente Stories 4.4 (matching de origem) e 4.1 (schema).

**Goal:** Transformar cada conversa rastreada de "veio do anúncio X" para "veio do anúncio X, está em etapa Y do funil e resultou em venda de R$ Z" — tudo isso sem intervenção manual do atendente. Classificação assíncrona via fila Postgres + worker Railway, com nível de confiança registrado para revisão humana nos casos ambíguos.

#### Story 5.1 — Schema de Classificação e Fila de Processamento

> Como desenvolvedor do Advezo, quero o schema de classificação de conversas e a fila de processamento assíncrono criados no Supabase, para que o worker possa processar mensagens sem bloquear o recebimento via Baileys.

**Acceptance Criteria:**
1. Tabela `conversation_classification_queue`: `id`, `workspace_id`, `conversation_id`, `status` (pending/processing/done/failed), `created_at`, `processed_at`, `error`, `retry_count`
2. Tabela `conversation_classifications`: `id`, `conversation_id`, `funnel_stage` (awareness/interest/consideration/intent/sale), `is_sale` (boolean), `sale_value_estimate` (decimal, nullable), `confidence_score` (0.0–1.0), `classified_at`, `model_version`, `reviewed_by` (nullable)
3. Coluna `classification_status` adicionada em `tracked_conversations`: pending/classified/failed
4. Índice em `conversation_classification_queue` para (`status`, `created_at`)
5. RLS: workspace acessa apenas suas próprias classificações
6. Migration com rollback documentado

---

#### Story 5.2 — Ingestão de Mensagens na Fila de Classificação

> Como sistema do Advezo, quero que cada nova mensagem de uma conversa rastreada seja enfileirada automaticamente para classificação, para que o worker processe sem intervenção manual.

**Acceptance Criteria:**
1. Worker Baileys insere registro em `conversation_classification_queue` com `status = pending` ao receber mensagem de `tracked_conversation`
2. Re-ingestão inteligente: se a conversa já tem classificação recente (< 1h), nova mensagem atualiza a fila em vez de criar duplicata
3. Apenas conversas com `status = tracked` são enfileiradas — conversas `untracked` ignoradas
4. Ingestão fire-and-forget em relação ao recebimento — falha na ingestão não impacta o atendimento (NFR-5)
5. `retry_count` inicializado em 0; incrementado a cada tentativa falha (máx. 3 retries)

---

#### Story 5.3 — Worker de Classificação por IA (Anthropic)

> Como sistema do Advezo, quero um worker Railway que processa a fila usando a API Anthropic para classificar etapa do funil e venda de forma assíncrona.

**Acceptance Criteria:**
1. Worker faz polling em `conversation_classification_queue` onde `status = pending` a cada N minutos (configurável via `CLASSIFICATION_POLL_INTERVAL`, padrão: 5 min)
2. Para cada registro: busca histórico de mensagens da conversa, monta prompt para API Anthropic, envia classificação
3. Prompt retorna JSON estruturado: `{ funnel_stage, is_sale, sale_value_estimate, confidence_score, reasoning }`
4. Resultado salvo em `conversation_classifications`; `status` da fila atualizado para `done`
5. Em caso de erro: `status = failed`, erro registrado, `retry_count` incrementado
6. Após 3 falhas: `status = failed` permanente; alerta para revisão manual
7. `model_version` salvo a cada classificação para rastreabilidade
8. Worker não processa mensagens de conversas `untracked`
9. **Nota LGPD obrigatória (no código e documentação):** Este worker processa conteúdo integral de mensagens de pessoas identificáveis via API de subprocessador (Anthropic). Base legal: legítimo interesse. Retenção de conteúdo bruto: máximo 90 dias após classificação (job de limpeza a implementar). Subprocessamento Anthropic documentado nos termos de uso do produto.

---

#### Story 5.4 — Registro de Confiança e Fila de Revisão Manual

> Como gestor de tráfego, quero ver quais classificações têm baixa confiança e revisá-las manualmente quando necessário, para corrigir falsos positivos/negativos.

**Acceptance Criteria:**
1. Classificações com `confidence_score` abaixo do limiar configurado (Story 5.6) marcadas como `needs_review`
2. UI em Rastreamento → Revisão: lista de conversas com baixa confiança — origem, classificação sugerida, score, trecho da conversa
3. Ações por conversa: confirmar classificação da IA, ou corrigir (etapa do funil + marcar/desmarcar venda + valor manual)
4. Correção manual salva `reviewed_by` (user_id) e `reviewed_at`
5. **Conversões enviadas ao Meta Ads nunca disparadas automaticamente para classificações abaixo do limiar sem revisão manual** — gate obrigatório (NFR-6)
6. Contador de pendentes de revisão visível no menu de Rastreamento (badge numérico)

---

#### Story 5.5 — Dashboard de Classificações e Funil de Vendas

> Como gestor de tráfego, quero ver o funil de conversão das conversas rastreadas para entender onde os leads estão caindo e qual campanha converte mais.

> **Navegação:** Rastreamento → [cliente] → **Classificações** (uso operacional — validar se a IA está funcionando bem). Complementar à tela Resultados (Story 6.3), não substituta.

**Acceptance Criteria:**
1. Funil visual com contagem por etapa (awareness → interest → consideration → intent → sale)
2. Filtros: por período, por campanha/link de origem, por status de revisão
3. Métricas de resumo: total classificadas, % que chegaram a `sale`, taxa de conversão por campanha
4. Conversas classificadas como venda listadas com: origem, valor estimado, data, nível de confiança
5. Indicador de cobertura: % de conversas com origem identificada vs. meta de 70% (objetivo do PRD)
6. Classificações com `confidence_score` abaixo do limiar marcadas com ícone "revisão pendente"

---

#### Story 5.6 — Configuração do Limiar de Confiança via UI

> Como gestor de tráfego, quero configurar o limiar de confiança da classificação por IA diretamente na UI, para calibrar o gate de revisão manual sem exigir redeploy.

**Acceptance Criteria:**
1. UI em Configurações → Rastreamento: campo numérico "Limiar de confiança para revisão manual" (0.0–1.0, padrão: 0.7)
2. Valor salvo em `workspace_settings.classification_confidence_threshold`
3. Worker (Story 5.3) e gate de envio ao Meta (Epic 6) leem o limiar do banco, não de env var
4. Alteração aplica-se apenas a classificações futuras — não reclassifica retroativamente
5. Valor mínimo permitido: 0.5 (abaixo disso, UI exibe aviso de risco de falsos positivos enviados ao Meta Ads)

---

### Epic 6 — Rastreamento Fase 3: Retroalimentação e Dashboards

> ✅ **Pré-requisito:** Epic 5 completo com QA gate PASS — especificamente Stories 5.3 (classificação), 5.4 (gate de confiança ativo) e 5.6 (limiar configurado). Nenhuma conversão enviada ao Meta antes do gate estar operacional.

**Goal:** Fechar o ciclo completo do rastreamento — da origem à venda, da venda de volta ao algoritmo de anúncio. Conversões classificadas com confiança suficiente são enviadas automaticamente à Conversions API do Meta Ads. Para Google Ads, o relatório de conversões é gerado para importação manual. O gestor ganha um dashboard completo de ROI por campanha e pode exportar todos os dados.

#### Story 6.1 — Envio de Conversão ao Meta Ads via Conversions API

> Como sistema do Advezo, quero enviar automaticamente eventos de conversão ao Meta Ads quando uma conversa rastreada é classificada como venda com confiança suficiente, para retroalimentar o algoritmo de otimização com dados de venda real.

**Acceptance Criteria:**
1. Trigger: `is_sale = true` AND `confidence_score >= limiar configurado` (Story 5.6) AND origem vinculada a conta Meta Ads
2. Evento via Meta Conversions API: `event_name = Purchase`, `value`, `currency = BRL`, `event_time`, `user_data.phone` (HMAC-SHA256 conforme padrão Meta), `custom_data.ad_id` e `adset_id` da origem rastreada
3. Deduplicação: `event_id` único por conversão (UUID)
4. Resultado salvo em `conversion_events`: `id`, `conversation_id`, `platform = meta`, `sent_at`, `status`, `meta_event_id`, `error`
5. Conversões com `confidence_score` abaixo do limiar **nunca enviadas automaticamente** — gate obrigatório (NFR-6, Story 5.4)
6. Falhas de envio registradas e visíveis na UI com opção de reenvio manual
7. Token OAuth verificado antes do envio; alerta se expirado (consistente com Story 2.1)

---

#### Story 6.2 — Relatório de Conversões para Google Ads

> Como gestor de tráfego, quero um relatório periódico de conversões de campanhas Google Ads no formato correto para importação manual.

**Acceptance Criteria:**
1. Relatório inclui apenas conversões com `tracked_clicks.gclid IS NOT NULL` — cliques sem GCLID não aparecem no relatório (limitação documentada na UI)
2. Coluna `Google Click ID (GCLID)` no CSV populada diretamente de `tracked_clicks.gclid`
3. Demais colunas: `Conversion Name`, `Conversion Time`, `Conversion Value`, `Conversion Currency`
4. Relatório disponível para download em Rastreamento → Google Ads → Conversões
5. Geração sob demanda (botão "Gerar relatório") e automática semanal (cron Railway)
6. Histórico de relatórios gerados listado com data e número de conversões incluídas
7. Nota orientativa na UI sobre o processo de importação manual no Google Ads

---

#### Story 6.3 — Dashboard Completo de Vendas por WhatsApp

> Como gestor de tráfego, quero um dashboard consolidado de resultados de vendas por WhatsApp — origem, conversões, faturamento e taxa de conversão por cliente e período.

> **Navegação:** Rastreamento → [cliente] → **Resultados** (uso comercial/ROI — apresentar ao cliente). Complementar à tela Classificações (Story 5.5), não substituta.

**Acceptance Criteria:**
1. Métricas de topo: total de conversas rastreadas, % com origem identificada, total de vendas confirmadas, faturamento total estimado, taxa de conversão (conversas → vendas)
2. Tabela de desempenho por campanha/origem: conversas, vendas, faturamento, taxa de conversão — ordenável por qualquer coluna
3. Indicador de meta de rastreamento: % de conversas com origem identificada vs. meta de 70% (objetivo do PRD)
4. Gráfico de tendência: conversas e vendas por semana no período selecionado
5. Filtros: período, campanha/link, status de revisão de confiança
6. Conversões enviadas ao Meta (Story 6.1) marcadas com badge "Enviado ao Meta" na listagem

---

#### Story 6.4 — Exportação de Dados de Conversas Rastreadas em CSV

> Como gestor de tráfego, quero exportar os dados de conversas rastreadas em CSV para análise própria, auditoria ou compartilhamento com o cliente.

**Acceptance Criteria:**
1. Botão "Exportar CSV" disponível no dashboard de Rastreamento e na listagem de conversas
2. CSV inclui: `id`, `origem`, `data_primeira_mensagem`, `etapa_funil`, `is_sale`, `valor_estimado`, `confidence_score`, `status_revisao`, `conversao_enviada_meta` (boolean)
3. Exportação filtrada pelo período e filtros ativos no momento do download
4. **Conteúdo bruto das mensagens não incluído** — apenas dados estruturados da classificação (privacidade)
5. Arquivo nomeado: `advezo-rastreamento-{cliente}-{periodo}.csv`
6. Exportação funciona para até 10.000 registros sem timeout; acima disso, geração assíncrona com download por link

---

### Epic 7 — IA Consultiva

> ✅ **Pré-requisito:** Epics 1 e 2 completos — o chat precisa de dados sincronizados de campanhas para responder perguntas úteis.

**Goal:** Dar ao gestor de tráfego um analista de campanhas disponível a qualquer momento — capaz de responder perguntas em linguagem natural, identificar anomalias e sugerir ações concretas aplicáveis com um clique, sem sair do chat.

#### Story 7.1 — Schema e Infraestrutura do Chat IA

> Como desenvolvedor do Advezo, quero o schema de histórico de conversas do chat e a integração base com a API Anthropic configurada, para que as stories seguintes possam construir a interface e as respostas sobre uma fundação estável.

**Acceptance Criteria:**
1. Tabela `ai_conversations`: `id`, `workspace_id`, `user_id`, `created_at`, `title` (gerado automaticamente da primeira pergunta), `last_message_at`
2. Tabela `ai_messages`: `id`, `conversation_id`, `role` (user/assistant), `content` (TEXT), `created_at`, `action_suggested` (JSONB nullable), `action_applied_at` (nullable)
3. RLS: usuário acessa apenas suas próprias conversas; `workspace_id` garante isolamento
4. Cliente Anthropic configurado como módulo compartilhável (reutilizável por este epic e pelo Epic 5)
5. Variáveis de ambiente: `ANTHROPIC_API_KEY`, `AI_CHAT_MODEL` (padrão: `claude-sonnet-4-6`), `AI_CHAT_MAX_TOKENS`
6. **Nota de retenção:** histórico mantido enquanto workspace ativo; removido em até 30 dias após cancelamento da conta

---

#### Story 7.2 — Interface de Chat com Histórico

> Como gestor de tráfego, quero uma interface de chat onde posso fazer perguntas sobre o desempenho das minhas campanhas e ver o histórico de conversas anteriores.

**Acceptance Criteria:**
1. Tela IA Consultiva: painel lateral esquerdo com lista de conversas (título, data); área principal com thread da conversa ativa
2. Nova conversa iniciada pelo botão "Nova conversa" — conversa anterior preservada no histórico
3. Título gerado automaticamente a partir da primeira mensagem do usuário (truncado em 50 chars)
4. Mensagens em ordem cronológica com distinção visual entre usuário e assistente
5. Loading state durante geração da resposta (streaming visual de tokens, se suportado pela API)
6. Histórico paginado — carrega mais recentes primeiro
7. Conversa vinculada ao `workspace_id` e `user_id` — cada colaborador tem seu próprio histórico

---

#### Story 7.3 — Respostas Contextualizadas com Dados de Campanha

> Como gestor de tráfego, quero que a IA responda perguntas sobre desempenho usando os dados reais sincronizados, não apenas conhecimento genérico.

**Acceptance Criteria:**
1. Antes de chamar a API Anthropic, o sistema injeta no contexto do prompt os dados relevantes: campanhas ativas do workspace, métricas dos últimos 30 dias, status de saúde das contas
2. Contexto injetado dinamicamente com base no cliente/conta selecionado no seletor global — a IA responde sobre o contexto atual
3. Prompt de sistema define: analista de tráfego pago, direto e objetivo, respostas em PT-BR, sugestões baseadas apenas nos dados fornecidos
4. Dados injetados nunca excedem o limite de tokens configurado — sistema trunca métricas mais antigas priorizando os últimos 7 dias
5. Resposta da IA cita explicitamente os dados usados
6. Perguntas fora do escopo respondidas com clareza
7. **Controle de acesso obrigatório (Broken Access Control — OWASP A01):** Antes de injetar qualquer dado, o sistema verifica se o `user_id` logado tem permissão para a conta/cliente selecionado (usando a mesma lógica de FR-E2). Dados de contas sem permissão **nunca chegam ao prompt**, independente da pergunta.
8. Se usuário não tem permissão para a conta selecionada: a IA recebe contexto vazio e responde "Você não tem acesso aos dados desta conta." — sem vazar nenhuma informação
9. **Teste de segurança obrigatório no QA gate:** colaborador sem permissão para Conta X não recebe dado algum de Conta X via chat — nem ao perguntar diretamente por nome de campanha. Teste documentado com dois usuários distintos no mesmo workspace.

---

#### Story 7.4 — Sugestões de Ação com Aplicação de 1 Clique

> Como gestor de tráfego, quero que a IA sugira ações concretas e eu possa aplicá-las diretamente no chat com um clique, sem sair da conversa.

**Acceptance Criteria:**
1. Ações estruturadas em `ai_messages.action_suggested` (JSONB): `{ type: "pause_campaign" | "adjust_budget", target_id, current_value, suggested_value, reason }`
2. UI renderiza ação como card interativo abaixo da mensagem: descrição, valores atual e sugerido, botão "Aplicar"
3. Clique em "Aplicar" chama os mesmos endpoints de ação da Story 2.7 — sem duplicação de lógica
4. Após aplicação: card atualizado com status "Aplicado em {hora}", `action_applied_at` preenchido; botão desabilitado para evitar dupla aplicação
5. Erros de aplicação exibidos inline no card com opção de tentar novamente
6. Ações sugeridas apenas para campanhas do workspace atual — a IA nunca sugere ação sobre campanha de outro cliente

---

#### Story 7.5 — Sugestões Rápidas e Empty State Orientativo

> Como gestor de tráfego iniciando uma nova conversa, quero ver sugestões de perguntas relevantes para o contexto atual, para que eu saiba o que posso perguntar.

**Acceptance Criteria:**
1. Ao iniciar nova conversa, empty state exibe 4–6 sugestões de perguntas contextualizadas no cliente/conta selecionado
2. Sugestões geradas dinamicamente com base nos dados do contexto atual (não hardcoded)
3. Clique em sugestão preenche o campo de input — usuário pode editar antes de enviar
4. Sugestões desaparecem após primeira mensagem enviada na conversa
5. Se não há dados sincronizados: empty state mostra "Conecte uma conta de anúncio para começar a usar a IA Consultiva" com CTA para Configurações

---

## 12. Checklist Results Report

| Categoria | Status | Score |
|-----------|--------|-------|
| 1. Problem Definition & Context | ✅ PASS | 92% |
| 2. MVP Scope Definition | ✅ PASS | 82% |
| 3. User Experience Requirements | ⚠️ PARTIAL | 72% |
| 4. Functional Requirements | ✅ PASS | 95% |
| 5. Non-Functional Requirements | ✅ PASS | 88% |
| 6. Epic & Story Structure | ✅ PASS | 96% |
| 7. Technical Guidance | ✅ PASS | 87% |
| 8. Cross-Functional Requirements | ⚠️ PARTIAL | 74% |
| 9. Clarity & Communication | ⚠️ PARTIAL | 70% |
| **GERAL** | **NEARLY READY FOR ARCHITECT** | **87%** |

**Gaps residuais (não bloqueantes):**
- Sem diagramas de fluxo ou wireframes — `@ux-design-expert` preencherá
- Testes de integração por plataforma (Meta/Google/Anthropic) a detalhar pelo `@architect`
- SLAs de performance apenas parcialmente definidos — `@architect` define no documento de arquitetura

---

## 13. Next Steps

### UX Expert Prompt

> `@ux-design-expert` — Receba o PRD do Advezo v2 (`docs/prd.md`) e inicie o modo de criação de arquitetura UX. Prioridades: design system em tons de azul (tokens, componentes base, StatusBadge), navegação lateral de 7 itens com seletor de cliente/conta fixo, e wireframes das telas core (Dashboard, Clientes → Conta → Campanhas, Rastreamento → Classificações/Resultados). Referência visual principal: Criativivo. Padrão de acessibilidade: WCAG AA.

### Architect Prompt

> `@architect` — Receba o PRD do Advezo v2 (`docs/prd.md`) e inicie o modo de criação de arquitetura técnica. Stack definida: Next.js 16+ (Vercel), Supabase (PostgreSQL + Auth + RLS + Storage), Railway (WhatsApp worker Baileys + cron + fila de classificação). Pontos críticos para investigação: (1) estratégia de sandbox para APIs externas em desenvolvimento (Meta, Google, Anthropic); (2) SLAs de performance para API de sync e chat IA; (3) gestão de salt HMAC-SHA256 por workspace; (4) estratégia de observabilidade (Sentry, Railway metrics, Vercel Analytics); (5) estrutura contratual de subprocessamento Anthropic para NFR-8 (LGPD). Prioridade: favorecer velocidade de entrega nos Epics 1–3 sem comprometer NFRs.
