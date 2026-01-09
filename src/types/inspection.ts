/**
 * 代码检查系统类型定义
 */

/** 检查严重级别 */
export type InspectionSeverity = 'error' | 'warning' | 'info' | 'hint'

/** 检查类别 */
export type InspectionCategory =
  | 'security'      // 安全问题
  | 'performance'   // 性能问题
  | 'style'         // 代码风格
  | 'complexity'    // 复杂度问题
  | 'correctness'   // 正确性问题
  | 'maintainability' // 可维护性
  | 'deprecated'    // 废弃用法
  | 'best-practice' // 最佳实践

/** 代码位置范围 */
export interface InspectionRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/** 快速修复 */
export interface QuickFix {
  title: string
  edits: TextEdit[]
  isPreferred?: boolean
}

/** 文本编辑 */
export interface TextEdit {
  range: InspectionRange
  newText: string
}

/** 检查结果 */
export interface InspectionResult {
  /** 检查规则 ID */
  ruleId: string
  /** 检查规则名称 */
  ruleName: string
  /** 严重级别 */
  severity: InspectionSeverity
  /** 类别 */
  category: InspectionCategory
  /** 问题描述 */
  message: string
  /** 代码位置 */
  range: InspectionRange
  /** 详细说明 */
  description?: string
  /** 相关链接 */
  helpUrl?: string
  /** 快速修复 */
  quickFixes?: QuickFix[]
}

/** 检查规则接口 */
export interface InspectionRule {
  /** 规则 ID */
  id: string
  /** 规则名称 */
  name: string
  /** 规则描述 */
  description: string
  /** 类别 */
  category: InspectionCategory
  /** 默认严重级别 */
  defaultSeverity: InspectionSeverity
  /** 支持的语言 */
  languages: string[]
  /** 规则配置 */
  options?: Record<string, unknown>
  /** 检查函数 */
  check(context: InspectionContext): InspectionResult[]
}

/** 检查上下文 */
export interface InspectionContext {
  /** 文件路径 */
  filePath: string
  /** 文件内容 */
  content: string
  /** 语言 ID */
  languageId: string
  /** 按行拆分的内容 */
  lines: string[]
  /** 规则配置 */
  options?: Record<string, unknown>
}

/** 检查配置 */
export interface InspectionConfig {
  /** 启用的规则 */
  enabled: Record<string, boolean | Record<string, unknown>>
  /** 禁用的规则 */
  disabled: string[]
  /** 严重级别覆盖 */
  severityOverrides: Record<string, InspectionSeverity>
  /** 排除的文件模式 */
  excludePatterns: string[]
}

/** 默认检查配置 */
export const DEFAULT_INSPECTION_CONFIG: InspectionConfig = {
  enabled: {
    'security/*': true,
    'performance/*': true,
    'style/*': true,
    'correctness/*': true
  },
  disabled: [],
  severityOverrides: {},
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**'
  ]
}

/** 检查统计 */
export interface InspectionStats {
  totalIssues: number
  byCategory: Record<InspectionCategory, number>
  bySeverity: Record<InspectionSeverity, number>
  byRule: Record<string, number>
}
