import { QualificationRule } from '@advezo/types'

/**
 * Motor de qualificação automática de leads (Story 8.4 — AC 8.4.1).
 *
 * Avalia `lead_forms.qualification_rules` contra os campos do lead (`field_data`).
 * Operadores suportados (QualificationOperator, Story 8.1):
 *   - `eq`         — valor do campo igual ao valor da regra (comparação por string);
 *   - `not_eq`     — valor do campo diferente do valor da regra;
 *   - `contains`   — campo é string e inclui o valor da regra;
 *   - `filled`     — campo presente e não vazio;
 *   - `not_filled` — campo ausente ou vazio.
 *
 * Semântica AND-logic (`Array.every`): TODAS as regras devem ser satisfeitas para
 * qualificar. Array de regras vazio → `false` (sem qualificação automática — um
 * formulário sem regras nunca qualifica leads automaticamente, eles permanecem `novo`).
 *
 * Função pura, sem efeitos colaterais: usada tanto no handler de LP (POST
 * /api/leads/submit) quanto no processamento de Lead Ads (process-queue).
 */
export function evaluateQualificationRules(
  fieldData: Record<string, unknown>,
  rules: QualificationRule[]
): boolean {
  if (!rules || rules.length === 0) return false

  return rules.every((rule) => {
    const fieldValue = fieldData[rule.field]

    switch (rule.operator) {
      case 'eq':
        return String(fieldValue) === String(rule.value)
      case 'not_eq':
        return String(fieldValue) !== String(rule.value)
      case 'contains':
        return (
          typeof fieldValue === 'string' && fieldValue.includes(rule.value ?? '')
        )
      case 'filled':
        return (
          fieldValue !== undefined && fieldValue !== null && fieldValue !== ''
        )
      case 'not_filled':
        return (
          fieldValue === undefined || fieldValue === null || fieldValue === ''
        )
      default:
        return false
    }
  })
}
