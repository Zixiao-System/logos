/**
 * 代码检查状态管理
 */

import { defineStore } from 'pinia'
import { getInspectionEngine } from '@/services/inspection'
import type { InspectionResult, InspectionStats, InspectionConfig, InspectionSeverity } from '@/types/inspection'

interface InspectionState {
  /** 按文件路径存储的检查结果 */
  resultsByFile: Record<string, InspectionResult[]>
  /** 是否正在检查 */
  isInspecting: boolean
  /** 最后检查时间 */
  lastInspectionTime: number | null
  /** 检查配置 */
  config: InspectionConfig
  /** 过滤设置 */
  filter: {
    severity: InspectionSeverity | 'all'
    category: string | 'all'
    searchText: string
  }
}

export const useInspectionStore = defineStore('inspection', {
  state: (): InspectionState => ({
    resultsByFile: {},
    isInspecting: false,
    lastInspectionTime: null,
    config: getInspectionEngine().getConfig(),
    filter: {
      severity: 'all',
      category: 'all',
      searchText: ''
    }
  }),

  getters: {
    /** 所有检查结果 */
    allResults: (state): InspectionResult[] => {
      return Object.values(state.resultsByFile).flat()
    },

    /** 过滤后的结果 */
    filteredResults(state): InspectionResult[] {
      let results = this.allResults

      // 按严重性过滤
      if (state.filter.severity !== 'all') {
        results = results.filter(r => r.severity === state.filter.severity)
      }

      // 按类别过滤
      if (state.filter.category !== 'all') {
        results = results.filter(r => r.category === state.filter.category)
      }

      // 按搜索文本过滤
      if (state.filter.searchText) {
        const searchLower = state.filter.searchText.toLowerCase()
        results = results.filter(r =>
          r.message.toLowerCase().includes(searchLower) ||
          r.ruleName.toLowerCase().includes(searchLower) ||
          r.ruleId.toLowerCase().includes(searchLower)
        )
      }

      return results
    },

    /** 检查统计 */
    stats(): InspectionStats {
      const engine = getInspectionEngine()
      return engine.calculateStats(this.allResults)
    },

    /** 获取指定文件的检查结果 */
    getResultsForFile: (state) => (filePath: string): InspectionResult[] => {
      return state.resultsByFile[filePath] || []
    },

    /** 错误数量 */
    errorCount(): number {
      return this.allResults.filter(r => r.severity === 'error').length
    },

    /** 警告数量 */
    warningCount(): number {
      return this.allResults.filter(r => r.severity === 'warning').length
    },

    /** 提示数量 */
    hintCount(): number {
      return this.allResults.filter(r => r.severity === 'hint' || r.severity === 'info').length
    }
  },

  actions: {
    /**
     * 检查单个文件
     */
    inspectFile(filePath: string, content: string, languageId: string): InspectionResult[] {
      const engine = getInspectionEngine()
      const results = engine.inspect(filePath, content, languageId)

      if (results.length > 0) {
        this.resultsByFile[filePath] = results
      } else {
        delete this.resultsByFile[filePath]
      }

      this.lastInspectionTime = Date.now()
      return results
    },

    /**
     * 检查多个文件
     */
    inspectFiles(files: Array<{ path: string; content: string; languageId: string }>) {
      this.isInspecting = true
      const engine = getInspectionEngine()

      try {
        const results = engine.inspectFiles(files)
        for (const [path, fileResults] of results) {
          this.resultsByFile[path] = fileResults
        }
        this.lastInspectionTime = Date.now()
      } finally {
        this.isInspecting = false
      }
    },

    /**
     * 清除指定文件的检查结果
     */
    clearFileResults(filePath: string) {
      delete this.resultsByFile[filePath]
    },

    /**
     * 清除所有检查结果
     */
    clearAllResults() {
      this.resultsByFile = {}
    },

    /**
     * 更新配置
     */
    updateConfig(config: Partial<InspectionConfig>) {
      const engine = getInspectionEngine()
      engine.updateConfig(config)
      this.config = engine.getConfig()
    },

    /**
     * 更新过滤器
     */
    setFilter(filter: Partial<InspectionState['filter']>) {
      this.filter = { ...this.filter, ...filter }
    },

    /**
     * 重置过滤器
     */
    resetFilter() {
      this.filter = {
        severity: 'all',
        category: 'all',
        searchText: ''
      }
    },

    /**
     * 禁用规则
     */
    disableRule(ruleId: string) {
      if (!this.config.disabled.includes(ruleId)) {
        this.config.disabled.push(ruleId)
        this.updateConfig(this.config)
      }
    },

    /**
     * 启用规则
     */
    enableRule(ruleId: string) {
      const index = this.config.disabled.indexOf(ruleId)
      if (index !== -1) {
        this.config.disabled.splice(index, 1)
        this.updateConfig(this.config)
      }
    },

    /**
     * 设置规则严重性
     */
    setRuleSeverity(ruleId: string, severity: InspectionSeverity) {
      this.config.severityOverrides[ruleId] = severity
      this.updateConfig(this.config)
    }
  }
})
