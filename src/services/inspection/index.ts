/**
 * 代码检查服务导出
 */

export { InspectionEngine, getInspectionEngine, destroyInspectionEngine } from './InspectionEngine'
export { allRules, rulesById, getRulesForLanguage, getRulesByCategory } from './rules'
export type {
  InspectionConfig,
  InspectionResult,
  InspectionContext,
  InspectionRule,
  InspectionStats,
  InspectionSeverity,
  InspectionCategory,
  InspectionRange,
  QuickFix,
  TextEdit
} from '@/types/inspection'
