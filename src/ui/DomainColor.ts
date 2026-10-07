import type { GoalDomain } from '@/db/types'

export const DOMAIN_VAR: Record<GoalDomain, string> = {
  spiritual: 'var(--dom-spiritual)',
  body:      'var(--dom-body)',
  business:  'var(--dom-business)',
  personal:  'var(--dom-personal)',
  work:      'var(--dom-work)',
}

export const DOMAIN_LABEL: Record<GoalDomain, string> = {
  spiritual: 'Spirituel',
  body:      'Corps',
  business:  'Business',
  personal:  'Personnel',
  work:      'Travail',
}
