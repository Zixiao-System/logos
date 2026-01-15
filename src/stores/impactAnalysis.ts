/**
 * Impact Analysis 状态管理
 * 管理影响分析视图的状态
 */

import { defineStore } from 'pinia'
import type { CallHierarchyItem } from './callHierarchy'

/** 影响级别 */
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical'

/** 影响类别 */
export type ImpactCategory = 'direct' | 'indirect' | 'test' | 'documentation'

/** 影响项 */
export interface ImpactItem {
  symbol: CallHierarchyItem
  category: ImpactCategory
  level: ImpactLevel
  distance: number // 距离原始符号的调用距离
  path: string[] // 从原始符号到此符号的调用路径
}

/** 影响统计 */
export interface ImpactStats {
  totalAffected: number
  directImpact: number
  indirectImpact: number
  affectedTests: number
  affectedFiles: number
  riskLevel: ImpactLevel
}

/** 影响分析结果 */
export interface ImpactAnalysisResult {
  symbol: CallHierarchyItem
  impacts: ImpactItem[]
  stats: ImpactStats
  timestamp: number
}

/** 影响分析状态 */
interface ImpactAnalysisState {
  /** 当前分析的符号 */
  targetSymbol: CallHierarchyItem | null
  /** 影响列表 */
  impacts: ImpactItem[]
  /** 影响统计 */
  stats: ImpactStats | null
  /** 是否正在分析 */
  isAnalyzing: boolean
  /** 错误信息 */
  error: string | null
  /** 面板是否可见 */
  isPanelVisible: boolean
  /** 分组方式 */
  groupBy: 'category' | 'file' | 'level'
  /** 展开的分组 */
  expandedGroups: Set<string>
  /** 选中的影响项 */
  selectedItem: ImpactItem | null
  /** 历史分析记录 */
  history: ImpactAnalysisResult[]
  /** 最大历史记录数 */
  maxHistory: number
}

/** 默认统计 */
const DEFAULT_STATS: ImpactStats = {
  totalAffected: 0,
  directImpact: 0,
  indirectImpact: 0,
  affectedTests: 0,
  affectedFiles: 0,
  riskLevel: 'low',
}

/** 计算风险级别 */
function calculateRiskLevel(stats: ImpactStats): ImpactLevel {
  if (stats.totalAffected > 50 || stats.affectedTests > 10) return 'critical'
  if (stats.totalAffected > 20 || stats.affectedTests > 5) return 'high'
  if (stats.totalAffected > 5 || stats.affectedTests > 2) return 'medium'
  return 'low'
}

/** 获取风险级别颜色 */
export function getRiskLevelColor(level: ImpactLevel): string {
  switch (level) {
    case 'critical': return 'var(--mdui-color-error)'
    case 'high': return 'var(--mdui-color-warning, #ff9800)'
    case 'medium': return 'var(--mdui-color-tertiary, #ffc107)'
    case 'low': return 'var(--mdui-color-primary)'
  }
}

/** 获取风险级别图标 */
export function getRiskLevelIcon(level: ImpactLevel): string {
  switch (level) {
    case 'critical': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    case 'low': return 'check-circle'
  }
}

/** 获取类别图标 */
export function getCategoryIcon(category: ImpactCategory): string {
  switch (category) {
    case 'direct': return 'arrow-forward'
    case 'indirect': return 'subdirectory-arrow-right'
    case 'test': return 'science'
    case 'documentation': return 'description'
  }
}

/** 获取类别标签 */
export function getCategoryLabel(category: ImpactCategory): string {
  switch (category) {
    case 'direct': return 'Direct Impact'
    case 'indirect': return 'Indirect Impact'
    case 'test': return 'Affected Tests'
    case 'documentation': return 'Documentation'
  }
}

export const useImpactAnalysisStore = defineStore('impactAnalysis', {
  state: (): ImpactAnalysisState => ({
    targetSymbol: null,
    impacts: [],
    stats: null,
    isAnalyzing: false,
    error: null,
    isPanelVisible: false,
    groupBy: 'category',
    expandedGroups: new Set(['direct', 'indirect', 'test']),
    selectedItem: null,
    history: [],
    maxHistory: 10,
  }),

  getters: {
    /** 是否有数据 */
    hasData: (state): boolean => {
      return state.targetSymbol !== null && state.impacts.length > 0
    },

    /** 按分组方式获取影响列表 */
    groupedImpacts: (state): Record<string, ImpactItem[]> => {
      const groups: Record<string, ImpactItem[]> = {}

      for (const impact of state.impacts) {
        let key: string

        switch (state.groupBy) {
          case 'category':
            key = impact.category
            break
          case 'file':
            key = impact.symbol.uri.replace('file://', '').split('/').slice(-1)[0] || 'Unknown'
            break
          case 'level':
            key = impact.level
            break
          default:
            key = 'other'
        }

        if (!groups[key]) {
          groups[key] = []
        }
        groups[key].push(impact)
      }

      return groups
    },

    /** 获取直接影响数量 */
    directImpactCount: (state): number => {
      return state.impacts.filter(i => i.category === 'direct').length
    },

    /** 获取间接影响数量 */
    indirectImpactCount: (state): number => {
      return state.impacts.filter(i => i.category === 'indirect').length
    },

    /** 获取受影响测试数量 */
    testImpactCount: (state): number => {
      return state.impacts.filter(i => i.category === 'test').length
    },

    /** 是否分组已展开 */
    isGroupExpanded: (state) => (group: string): boolean => {
      return state.expandedGroups.has(group)
    },
  },

  actions: {
    /**
     * 执行影响分析
     */
    async analyzeImpact(uri: string, line: number, column: number) {
      this.isAnalyzing = true
      this.error = null

      try {
        // 调用后端 API
        const result = await window.electronAPI?.daemon?.impactAnalysis?.(uri, line, column)

        if (result && typeof result === 'object') {
          const analysisResult = result as {
            symbol: CallHierarchyItem
            impacts: ImpactItem[]
          }

          this.targetSymbol = analysisResult.symbol
          this.impacts = analysisResult.impacts || []

          // 计算统计
          this.calculateStats()

          // 保存到历史
          this.addToHistory()

          this.isPanelVisible = true
        } else {
          this.error = 'No impact analysis available for this symbol'
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to analyze impact'
      } finally {
        this.isAnalyzing = false
      }
    },

    /**
     * 从调用层级数据生成影响分析
     */
    async analyzeFromCallHierarchy(rootItem: CallHierarchyItem, incomingCalls: ImpactItem[]) {
      this.targetSymbol = rootItem
      this.impacts = incomingCalls
      this.calculateStats()
      this.addToHistory()
      this.isPanelVisible = true
    },

    /**
     * 计算统计数据
     */
    calculateStats() {
      const stats: ImpactStats = { ...DEFAULT_STATS }

      // 统计各类影响
      const fileSet = new Set<string>()
      for (const impact of this.impacts) {
        stats.totalAffected++
        fileSet.add(impact.symbol.uri)

        switch (impact.category) {
          case 'direct':
            stats.directImpact++
            break
          case 'indirect':
            stats.indirectImpact++
            break
          case 'test':
            stats.affectedTests++
            break
        }
      }

      stats.affectedFiles = fileSet.size
      stats.riskLevel = calculateRiskLevel(stats)

      this.stats = stats
    },

    /**
     * 添加到历史记录
     */
    addToHistory() {
      if (!this.targetSymbol || !this.stats) return

      const result: ImpactAnalysisResult = {
        symbol: this.targetSymbol,
        impacts: [...this.impacts],
        stats: { ...this.stats },
        timestamp: Date.now(),
      }

      this.history.unshift(result)

      // 限制历史记录数量
      if (this.history.length > this.maxHistory) {
        this.history.pop()
      }
    },

    /**
     * 从历史记录恢复
     */
    restoreFromHistory(result: ImpactAnalysisResult) {
      this.targetSymbol = result.symbol
      this.impacts = result.impacts
      this.stats = result.stats
      this.isPanelVisible = true
    },

    /**
     * 设置分组方式
     */
    setGroupBy(groupBy: 'category' | 'file' | 'level') {
      this.groupBy = groupBy
    },

    /**
     * 切换分组展开状态
     */
    toggleGroup(group: string) {
      if (this.expandedGroups.has(group)) {
        this.expandedGroups.delete(group)
      } else {
        this.expandedGroups.add(group)
      }
    },

    /**
     * 选择影响项
     */
    selectItem(item: ImpactItem | null) {
      this.selectedItem = item
    },

    /**
     * 导航到符号位置
     */
    navigateToSymbol(item: ImpactItem) {
      this.selectedItem = item

      const event = new CustomEvent('impact-analysis:navigate', {
        detail: {
          uri: item.symbol.uri,
          range: item.symbol.selectionRange,
        },
      })
      window.dispatchEvent(event)
    },

    /**
     * 显示面板
     */
    showPanel() {
      this.isPanelVisible = true
    },

    /**
     * 隐藏面板
     */
    hidePanel() {
      this.isPanelVisible = false
    },

    /**
     * 清除状态
     */
    clear() {
      this.targetSymbol = null
      this.impacts = []
      this.stats = null
      this.selectedItem = null
      this.error = null
    },

    /**
     * 清除历史
     */
    clearHistory() {
      this.history = []
    },
  },
})
