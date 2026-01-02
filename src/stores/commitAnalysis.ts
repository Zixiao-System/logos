/**
 * Commit Analysis 状态管理
 */

import { defineStore } from 'pinia'
import type {
  CommitAnalysis,
  ReviewSuggestion,
  SuggestionCategory,
  SuggestionSeverity
} from '@/types/commitAnalysis'

export interface CommitAnalysisState {
  /** 当前分析结果 */
  currentAnalysis: CommitAnalysis | null
  /** 分析历史 */
  analysisHistory: CommitAnalysis[]
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息 */
  error: string | null
  /** 选中的提交哈希 */
  selectedCommit: string | null
  /** 筛选的类别 */
  filterCategory: SuggestionCategory | null
  /** 筛选的严重程度 */
  filterSeverity: SuggestionSeverity | null
  /** 是否显示已暂存分析 */
  showStagedAnalysis: boolean
}

export const useCommitAnalysisStore = defineStore('commitAnalysis', {
  state: (): CommitAnalysisState => ({
    currentAnalysis: null,
    analysisHistory: [],
    loading: false,
    error: null,
    selectedCommit: null,
    filterCategory: null,
    filterSeverity: null,
    showStagedAnalysis: false
  }),

  getters: {
    /** 是否有分析结果 */
    hasAnalysis: (state) => state.currentAnalysis !== null,

    /** 总问题数 */
    totalIssues: (state) => state.currentAnalysis?.reviewSuggestions.length ?? 0,

    /** 错误数量 */
    errorCount: (state) =>
      state.currentAnalysis?.reviewSuggestions.filter(s => s.severity === 'error').length ?? 0,

    /** 警告数量 */
    warningCount: (state) =>
      state.currentAnalysis?.reviewSuggestions.filter(s => s.severity === 'warning').length ?? 0,

    /** 信息数量 */
    infoCount: (state) =>
      state.currentAnalysis?.reviewSuggestions.filter(s => s.severity === 'info').length ?? 0,

    /** 按类别分组的建议 */
    suggestionsByCategory: (state): Record<SuggestionCategory, ReviewSuggestion[]> => {
      const result: Record<SuggestionCategory, ReviewSuggestion[]> = {
        security: [],
        performance: [],
        style: [],
        complexity: [],
        testing: [],
        documentation: []
      }

      if (!state.currentAnalysis) return result

      for (const suggestion of state.currentAnalysis.reviewSuggestions) {
        result[suggestion.category].push(suggestion)
      }

      return result
    },

    /** 按严重程度分组的建议 */
    suggestionsBySeverity: (state): Record<SuggestionSeverity, ReviewSuggestion[]> => {
      const result: Record<SuggestionSeverity, ReviewSuggestion[]> = {
        error: [],
        warning: [],
        info: []
      }

      if (!state.currentAnalysis) return result

      for (const suggestion of state.currentAnalysis.reviewSuggestions) {
        result[suggestion.severity].push(suggestion)
      }

      return result
    },

    /** 筛选后的建议 */
    filteredSuggestions: (state): ReviewSuggestion[] => {
      if (!state.currentAnalysis) return []

      let suggestions = state.currentAnalysis.reviewSuggestions

      if (state.filterCategory) {
        suggestions = suggestions.filter(s => s.category === state.filterCategory)
      }

      if (state.filterSeverity) {
        suggestions = suggestions.filter(s => s.severity === state.filterSeverity)
      }

      return suggestions
    },

    /** 按文件分组的建议 */
    suggestionsByFile: (state): Record<string, ReviewSuggestion[]> => {
      const result: Record<string, ReviewSuggestion[]> = {}

      if (!state.currentAnalysis) return result

      for (const suggestion of state.currentAnalysis.reviewSuggestions) {
        if (!result[suggestion.file]) {
          result[suggestion.file] = []
        }
        result[suggestion.file].push(suggestion)
      }

      return result
    }
  },

  actions: {
    /**
     * 分析指定提交
     */
    async analyzeCommit(repoPath: string, commitHash: string) {
      this.loading = true
      this.error = null
      this.selectedCommit = commitHash
      this.showStagedAnalysis = false

      try {
        const analysis = await window.electronAPI.commitAnalysis.analyze(repoPath, commitHash)
        this.currentAnalysis = analysis

        // 添加到历史记录 (最多保留10条)
        const existingIndex = this.analysisHistory.findIndex(
          a => a.commitHash === analysis.commitHash
        )
        if (existingIndex >= 0) {
          this.analysisHistory.splice(existingIndex, 1)
        }
        this.analysisHistory.unshift(analysis)
        if (this.analysisHistory.length > 10) {
          this.analysisHistory.pop()
        }
      } catch (error) {
        this.error = (error as Error).message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 分析暂存区变更
     */
    async analyzeStagedChanges(repoPath: string) {
      this.loading = true
      this.error = null
      this.selectedCommit = null
      this.showStagedAnalysis = true

      try {
        const analysis = await window.electronAPI.commitAnalysis.analyzeStaged(repoPath)
        this.currentAnalysis = analysis
      } catch (error) {
        this.error = (error as Error).message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 分析提交范围
     */
    async analyzeRange(repoPath: string, fromHash: string, toHash: string) {
      this.loading = true
      this.error = null

      try {
        const analyses = await window.electronAPI.commitAnalysis.analyzeRange(
          repoPath,
          fromHash,
          toHash
        )

        // 添加到历史记录
        for (const analysis of analyses) {
          const existingIndex = this.analysisHistory.findIndex(
            a => a.commitHash === analysis.commitHash
          )
          if (existingIndex >= 0) {
            this.analysisHistory.splice(existingIndex, 1)
          }
          this.analysisHistory.unshift(analysis)
        }

        // 限制历史记录数量
        if (this.analysisHistory.length > 20) {
          this.analysisHistory = this.analysisHistory.slice(0, 20)
        }

        // 设置当前分析为最新的提交
        if (analyses.length > 0) {
          this.currentAnalysis = analyses[0]
          this.selectedCommit = analyses[0].commitHash
        }

        return analyses
      } catch (error) {
        this.error = (error as Error).message
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 获取提交差异
     */
    async getCommitDiff(repoPath: string, commitHash: string): Promise<string> {
      try {
        return await window.electronAPI.commitAnalysis.getCommitDiff(repoPath, commitHash)
      } catch (error) {
        this.error = (error as Error).message
        throw error
      }
    },

    /**
     * 获取指定提交时的文件内容
     */
    async getFileAtCommit(
      repoPath: string,
      commitHash: string,
      filePath: string
    ): Promise<string> {
      try {
        return await window.electronAPI.commitAnalysis.getFileAtCommit(
          repoPath,
          commitHash,
          filePath
        )
      } catch (error) {
        this.error = (error as Error).message
        throw error
      }
    },

    /**
     * 从历史记录中选择分析
     */
    selectFromHistory(commitHash: string) {
      const analysis = this.analysisHistory.find(a => a.commitHash === commitHash)
      if (analysis) {
        this.currentAnalysis = analysis
        this.selectedCommit = commitHash
        this.showStagedAnalysis = false
      }
    },

    /**
     * 设置类别筛选
     */
    setFilterCategory(category: SuggestionCategory | null) {
      this.filterCategory = category
    },

    /**
     * 设置严重程度筛选
     */
    setFilterSeverity(severity: SuggestionSeverity | null) {
      this.filterSeverity = severity
    },

    /**
     * 清除筛选
     */
    clearFilters() {
      this.filterCategory = null
      this.filterSeverity = null
    },

    /**
     * 清除当前分析
     */
    clearAnalysis() {
      this.currentAnalysis = null
      this.selectedCommit = null
      this.showStagedAnalysis = false
      this.error = null
    },

    /**
     * 清除历史记录
     */
    clearHistory() {
      this.analysisHistory = []
    },

    /**
     * 重置状态
     */
    reset() {
      this.currentAnalysis = null
      this.analysisHistory = []
      this.loading = false
      this.error = null
      this.selectedCommit = null
      this.filterCategory = null
      this.filterSeverity = null
      this.showStagedAnalysis = false
    }
  }
})
