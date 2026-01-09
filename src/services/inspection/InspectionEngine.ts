/**
 * 代码检查引擎
 * 负责管理和执行检查规则
 */

import type {
  InspectionConfig,
  InspectionResult,
  InspectionContext,
  InspectionRule,
  InspectionStats,
  InspectionSeverity,
  InspectionCategory
} from '@/types/inspection'
import { DEFAULT_INSPECTION_CONFIG } from '@/types/inspection'
import { allRules, rulesById, getRulesForLanguage } from './rules'

/** 检查引擎 */
export class InspectionEngine {
  private config: InspectionConfig
  private customRules: InspectionRule[] = []

  constructor(config?: Partial<InspectionConfig>) {
    this.config = { ...DEFAULT_INSPECTION_CONFIG, ...config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<InspectionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): InspectionConfig {
    return { ...this.config }
  }

  /**
   * 注册自定义规则
   */
  registerRule(rule: InspectionRule): void {
    this.customRules.push(rule)
  }

  /**
   * 获取所有规则（内置 + 自定义）
   */
  getAllRules(): InspectionRule[] {
    return [...allRules, ...this.customRules]
  }

  /**
   * 获取启用的规则
   */
  getEnabledRules(languageId: string): InspectionRule[] {
    const allApplicable = [...getRulesForLanguage(languageId), ...this.customRules.filter(r => r.languages.includes(languageId))]

    return allApplicable.filter(rule => {
      // 检查是否在禁用列表中
      if (this.config.disabled.includes(rule.id)) {
        return false
      }

      // 检查是否匹配启用模式
      for (const [pattern, enabled] of Object.entries(this.config.enabled)) {
        if (this.matchPattern(rule.id, pattern)) {
          return enabled !== false
        }
      }

      // 默认启用
      return true
    })
  }

  /**
   * 检查单个文件
   */
  inspect(filePath: string, content: string, languageId: string): InspectionResult[] {
    // 检查文件是否被排除
    if (this.isExcluded(filePath)) {
      return []
    }

    const lines = content.split('\n')
    const context: InspectionContext = {
      filePath,
      content,
      languageId,
      lines
    }

    const enabledRules = this.getEnabledRules(languageId)
    const results: InspectionResult[] = []

    for (const rule of enabledRules) {
      try {
        // 获取规则特定配置
        const ruleConfig = this.getRuleConfig(rule.id)
        const contextWithOptions: InspectionContext = {
          ...context,
          options: ruleConfig
        }

        const ruleResults = rule.check(contextWithOptions)

        // 应用严重性覆盖
        for (const result of ruleResults) {
          if (this.config.severityOverrides[rule.id]) {
            result.severity = this.config.severityOverrides[rule.id]
          }
          results.push(result)
        }
      } catch (error) {
        console.error(`Rule ${rule.id} failed:`, error)
      }
    }

    return results
  }

  /**
   * 检查多个文件
   */
  inspectFiles(files: Array<{ path: string; content: string; languageId: string }>): Map<string, InspectionResult[]> {
    const results = new Map<string, InspectionResult[]>()

    for (const file of files) {
      const fileResults = this.inspect(file.path, file.content, file.languageId)
      if (fileResults.length > 0) {
        results.set(file.path, fileResults)
      }
    }

    return results
  }

  /**
   * 计算检查统计
   */
  calculateStats(results: InspectionResult[]): InspectionStats {
    const stats: InspectionStats = {
      totalIssues: results.length,
      byCategory: {} as Record<InspectionCategory, number>,
      bySeverity: {} as Record<InspectionSeverity, number>,
      byRule: {}
    }

    for (const result of results) {
      // 按类别统计
      stats.byCategory[result.category] = (stats.byCategory[result.category] || 0) + 1

      // 按严重性统计
      stats.bySeverity[result.severity] = (stats.bySeverity[result.severity] || 0) + 1

      // 按规则统计
      stats.byRule[result.ruleId] = (stats.byRule[result.ruleId] || 0) + 1
    }

    return stats
  }

  /**
   * 获取规则信息
   */
  getRuleInfo(ruleId: string): InspectionRule | undefined {
    return rulesById.get(ruleId) || this.customRules.find(r => r.id === ruleId)
  }

  /**
   * 检查文件是否被排除
   */
  private isExcluded(filePath: string): boolean {
    for (const pattern of this.config.excludePatterns) {
      if (this.matchGlob(filePath, pattern)) {
        return true
      }
    }
    return false
  }

  /**
   * 匹配规则模式 (如 'security/*')
   */
  private matchPattern(ruleId: string, pattern: string): boolean {
    if (pattern === ruleId) return true
    if (pattern.endsWith('/*')) {
      const category = pattern.slice(0, -2)
      return ruleId.startsWith(category + '/')
    }
    return false
  }

  /**
   * 简单的 glob 匹配
   */
  private matchGlob(path: string, pattern: string): boolean {
    // 将 glob 转换为正则
    const regex = pattern
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
      .replace(/\?/g, '.')

    return new RegExp(`^${regex}$`).test(path)
  }

  /**
   * 获取规则特定配置
   */
  private getRuleConfig(ruleId: string): Record<string, unknown> | undefined {
    const config = this.config.enabled[ruleId]
    if (typeof config === 'object') {
      return config
    }
    return undefined
  }
}

/** 单例实例 */
let instance: InspectionEngine | null = null

/**
 * 获取检查引擎单例
 */
export function getInspectionEngine(): InspectionEngine {
  if (!instance) {
    instance = new InspectionEngine()
  }
  return instance
}

/**
 * 销毁检查引擎单例
 */
export function destroyInspectionEngine(): void {
  instance = null
}
