/**
 * 检查规则索引
 */

import { securityRules } from './security'
import { performanceRules } from './performance'
import { styleRules } from './style'
import { correctnessRules } from './correctness'
import type { InspectionRule } from '@/types/inspection'

/** 所有内置检查规则 */
export const allRules: InspectionRule[] = [
  ...securityRules,
  ...performanceRules,
  ...styleRules,
  ...correctnessRules
]

/** 按 ID 获取规则 */
export const rulesById: Map<string, InspectionRule> = new Map(
  allRules.map(rule => [rule.id, rule])
)

/** 按类别获取规则 */
export function getRulesByCategory(category: string): InspectionRule[] {
  return allRules.filter(rule => rule.category === category)
}

/** 按语言获取规则 */
export function getRulesForLanguage(languageId: string): InspectionRule[] {
  return allRules.filter(rule => rule.languages.includes(languageId))
}

// 导出各类别规则
export { securityRules } from './security'
export { performanceRules } from './performance'
export { styleRules } from './style'
export { correctnessRules } from './correctness'
