# Bases Legais LGPD — Advezo v2

> Documento de conformidade legal. Descreve as bases legais que justificam o
> tratamento de dados pessoais (em especial, email) no Advezo v2. Mantido pela
> equipe de desenvolvimento em conjunto com a equipe jurídica.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-30 | 1.0 | Criação inicial — Epic 8 (Qualificação de Leads): documentadas as duas bases legais distintas para tratamento de email em leads (LGPD Art. 7º I vs. termos da Meta) e implicações práticas para desenvolvedores. | Dex (@dev) |

---

## Epic 8 — Qualificação de Leads

O módulo de leads do Advezo captura dados de potenciais clientes a partir de **duas
fontes distintas**, e cada fonte se apoia em uma **base legal diferente** para o
tratamento do email do titular. Tratar essa distinção como única seria um erro de
conformidade: o comportamento do sistema (gate de consentimento, disparo de CAPI,
badge na UI) **deve** divergir conforme a fonte do lead.

A coluna `source` da tabela `leads` (`CHECK (source IN ('landing_page','lead_ads'))`)
é o discriminador técnico que separa as duas bases legais.

### A. Formulário de Landing Page (`source='landing_page'`)

**Base legal:** Art. 7º, I da LGPD — **consentimento do titular**.

O titular preenche um formulário hospedado/embedado pelo gestor de tráfego. Quando o
formulário inclui um campo de email, o consentimento explícito é obrigatório e é a
única base legal que autoriza o tratamento desse email.

- **Evidência técnica (audit trail):** o campo `consent_given_at timestamptz` da
  tabela `leads` registra o momento exato em que o consentimento foi dado. Um valor
  não-nulo é a prova auditável de que o titular consentiu. O email cifrado
  (`email_encrypted`) só é gravado quando `consent_given_at` também é gravado — ambos
  são preenchidos na mesma operação, condicionados a `consent === true`.

- **Obrigação — rejeição ativa:** o servidor **rejeita** (HTTP 422) qualquer submissão
  que contenha email sem consentimento explícito. **Não** existe o padrão "aceitar a
  submissão e silenciosamente ignorar o email". A submissão inteira é recusada com a
  mensagem *"Consentimento obrigatório para compartilhamento de email (LGPD Art. 7º I)"*.
  Essa verificação ocorre **antes** de qualquer processamento do dado (sem hash, sem
  cifragem, sem lookup), em `POST /api/leads/submit` (referência: `FR-LP3`).

- **Disparo de CAPI:** o campo `user_data.em` (email hasheado) é incluído no evento
  Meta Conversions API **somente se** `consent_given_at IS NOT NULL`. Não há email para
  enviar quando não houve consentimento — porque, sem consentimento, o email sequer foi
  armazenado (referência: `FR-CAPI3`).

- **Responsabilidade do gestor:** ao adicionar um campo de email ao formulário, o gestor
  é responsável por incluir o `consent_checkbox` obrigatório, com o texto pré-definido
  *"Concordo em compartilhar meus dados para fins de publicidade e marketing"*.
  Formulários com email e sem `consent_checkbox` são inválidos e bloqueados no save
  (referência: `FR-LP2`). A plataforma reforça essa regra; a redação e a captura do
  consentimento são responsabilidade do gestor.

### B. Meta Lead Ads Nativo (`source='lead_ads'`)

**Base legal:** **termos de serviço da Meta** — o dado é coletado pela Meta sob os
termos da plataforma e devolvido ao originador (o anunciante) via Graph API.

Esta base legal é **diferente** do consentimento LGPD da subseção A. O titular consentiu
no momento em que preencheu o formulário **nativo** dentro do Facebook/Instagram, sob os
termos de uso da Meta. O Advezo, como originador da campanha, recebe esse dado já
coletado — não é o Advezo quem capta o consentimento.

- **`consent_given_at IS NULL` é correto, não uma falha:** para leads de Lead Ads, a
  coluna `consent_given_at` fica nula. **Isso não significa ausência de consentimento** —
  significa que a base legal é distinta e o registro de consentimento vive na Meta, não
  no Advezo. Interpretar esse `NULL` como "lead sem consentimento" seria um erro.

- **Disparo de CAPI:** o campo `user_data.em` é incluído **sempre** que o email estiver
  disponível, **sem** o gate adicional de `consent_given_at`. Adicionalmente, inclui-se
  `user_data.lead_id = meta_lead_id` como sinal forte de deduplicação da Meta
  (referência: `FR-CAPI4`).

- **Badge na UI:** para esses leads, a interface exibe o badge **"Meta Terms"**
  (e **não** "Consentimento LGPD"). A distinção visual deixa claro para o gestor de qual
  base legal aquele email depende.

---

## Implicações Práticas para Desenvolvedores

Esta seção explica decisões de design que, à primeira vista, parecem inconsistências —
mas são intencionais e exigidas pela combinação de LGPD + requisitos da Meta.

### 1. Por que `FR-CAPI3` e `FR-CAPI4` têm lógicas diferentes (gate por fonte)

O gate de inclusão do email no payload CAPI é **diferenciado por `source`** porque as
bases legais são diferentes:

- `source='landing_page'` → inclui `em` **apenas se** `consent_given_at IS NOT NULL`
  (base legal: consentimento LGPD explícito).
- `source='lead_ads'` → inclui `em` **sempre** que houver email (base legal: termos da
  Meta).

No código, isso vive em uma única expressão de gate (`apps/web/src/lib/capi/leads.ts`,
função `buildUserData`):

```ts
const includeEmail =
  lead.source === 'lead_ads' ||
  (lead.source === 'landing_page' && lead.consent_given_at !== null)
```

Um gate único e indiferenciado por fonte **violaria** a LGPD (enviando email de LP sem
consentimento) ou **desperdiçaria** sinal de conversão legítimo (segurando email de Lead
Ads que já tem base legal válida).

### 2. Por que `consent_given_at IS NULL` para Lead Ads é comportamento correto, não bug

Ver subseção B. Resumindo para quem vai ler o banco ou os testes: a ausência de
`consent_given_at` em um lead `source='lead_ads'` é o **estado esperado**. A base legal
desse lead é o termo de serviço da Meta, registrado na plataforma da Meta — não há um
`consent_given_at` correspondente no Advezo porque o Advezo não captou esse consentimento.
Não escreva código (nem teste) que trate esse `NULL` como erro de integridade.

### 3. Por que `phone_hash` usa HMAC-SHA256 (com salt) enquanto o `user_data.em` de CAPI usa SHA256 puro

Estes dois hashes parecem semelhantes, mas servem a finalidades opostas e por isso usam
algoritmos diferentes:

- **`phone_hash`** (coluna persistida em `leads`): `HMAC-SHA256(normalizePhone(phone),
  workspace_salt)`. É **dado interno** do Advezo, usado para deduplicação
  (`leads_active_dedup` em `(client_id, phone_hash)`) e nunca precisa fazer matching com
  terceiros. O salt por workspace existe **para proteger contra rainbow tables**: como o
  espaço de telefones é pequeno e previsível, um SHA256 simples seria reversível por força
  bruta. O salt torna o hash inútil fora do contexto daquele workspace.

- **`user_data.em`** (CAPI — calculado em memória, nunca persistido): `SHA256(lowercase(
  trim(email)))`, **sem salt**. Isto é **requisito da Meta Conversions API**: a Meta
  precisa fazer matching desse hash contra os hashes que ela própria calcula a partir dos
  seus registros de usuários. Se aplicássemos HMAC com salt, o hash **nunca daria match**
  com o lado da Meta, e o evento de conversão seria inútil. Por isso ele é calculado em
  memória no momento do disparo e descartado imediatamente — **nunca** gravado como coluna
  (referência: `NFR-SEC-4`).

Regra de ouro: **salt onde controlamos os dois lados (dado interno); sem salt onde um
terceiro precisa reproduzir o hash (Meta).**

### 4. Por que `email_encrypted` usa AES-256-GCM e não SHA256

`email_encrypted` é a forma como o email é **persistido** em `leads`. Ele usa
**AES-256-GCM** (via `TOKEN_ENCRYPTION_KEY`, formato `<iv>:<authTag>:<ciphertext>`) e
**não** um hash, pela razão da **reversibilidade**:

- O gestor precisa **ver o email em claro** na UI (descriptografado server-side) para
  qualificar e contatar o lead. Um hash SHA256 é **one-way** — irreversível — e tornaria
  o email impossível de exibir.
- AES-256-GCM oferece **confidencialidade** (o email nunca trafega nem é gravado em claro)
  **e integridade** (o `authTag` detecta adulteração). O IV por registro garante que dois
  emails iguais produzam ciphertexts diferentes.

Em resumo, três finalidades → três técnicas:

| Campo | Técnica | Reversível? | Por quê |
|-------|---------|-------------|---------|
| `phone_hash` | HMAC-SHA256 + `workspace_salt` | Não | Dedup interna; salt previne rainbow table |
| `user_data.em` (CAPI) | SHA256 puro, em memória | Não | Matching com a Meta exige hash sem salt; nunca persistido |
| `email_encrypted` | AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) | Sim | Gestor precisa ver o email em claro na UI |

---

## Referências

- SPEC do Epic 8: `docs/stories/epics/epic-08-qualificacao-leads/SPEC.md`
  (`NFR-LGPD-1`, `NFR-LGPD-2`, `NFR-SEC-3`, `NFR-SEC-4`, `FR-LP2/3/4`, `FR-CAPI3/4`)
- Implementação do gate de consentimento (LP): `apps/web/src/app/api/leads/submit/route.ts`
- Implementação do gate de CAPI por fonte: `apps/web/src/lib/capi/leads.ts` (`buildUserData`)
