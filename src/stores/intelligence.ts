/**
 * 智能模式状态管理
 * 负责管理 Basic/Smart 模式切换、索引进度、服务器状态
 */

import { defineStore } from 'pinia'
import type { IndexingProgress, LanguageServerStatus, ServerStatus } from '@/types/intelligence'
import { getIntelligenceManager } from '@/services/lsp'

/** 智能模式类型 */
export type IntelligenceMode = 'basic' | 'smart'

/** 内存压力级别 */
export type MemoryPressure = 'low' | 'moderate' | 'high' | 'critical'

/** 内存使用信息 */
export interface MemoryUsageInfo {
  heapUsedMB: number
  heapTotalMB: number
  rssMB: number
  usagePercent: number
}

/** 内存压力事件 */
export interface MemoryPressureEvent {
  pressure: MemoryPressure
  usage: MemoryUsageInfo
  timestamp: number
  recommendation?: 'switch-to-basic' | 'gc' | 'none'
}

/** 项目分析结果 */
export interface ProjectAnalysis {
  /** 文件数量 */
  fileCount: number
  /** 总大小 (bytes) */
  totalSize: number
  /** 预估内存需求 (MB) */
  estimatedMemory: number
  /** 是否有复杂依赖 */
  hasComplexDependencies: boolean
  /** 检测到的语言 */
  languages: string[]
}

/** Smart Mode 阈值配置 */
export interface SmartModeThreshold {
  /** 最大文件数 */
  maxFiles: number
  /** 最大内存使用 (MB) */
  maxMemoryMB: number
}

/** 智能模式状态 */
interface IntelligenceState {
  /** 当前模式 */
  mode: IntelligenceMode
  /** 是否自动选择模式 */
  autoSelect: boolean
  /** 索引进度 */
  indexingProgress: IndexingProgress | null
  /** LSP 服务器状态 */
  serverStatus: Record<string, LanguageServerStatus>
  /** 模式切换中 */
  isSwitching: boolean
  /** 项目分析结果 */
  projectAnalysis: ProjectAnalysis | null
  /** Smart Mode 阈值 */
  smartModeThreshold: SmartModeThreshold
  /** 是否有待切换到 Smart Mode */
  pendingSmartSwitch: boolean
  /** 内存压力级别 */
  memoryPressure: MemoryPressure
  /** 内存使用信息 */
  memoryUsage: MemoryUsageInfo | null
  /** 是否启用内存监控 */
  memoryMonitorEnabled: boolean
  /** 是否自动降级 (内存压力大时) */
  autoDowngradeEnabled: boolean
  /** 最后一次内存检查时间 */
  lastMemoryCheck: number | null
}

/** 默认索引进度 */
const DEFAULT_INDEXING_PROGRESS: IndexingProgress = {
  phase: 'idle',
  message: '',
  processedFiles: 0,
  totalFiles: 0,
  percentage: 0
}

/** 默认阈值 */
const DEFAULT_THRESHOLD: SmartModeThreshold = {
  maxFiles: 5000,
  maxMemoryMB: 2048
}

export const useIntelligenceStore = defineStore('intelligence', {
  state: (): IntelligenceState => ({
    mode: 'basic',
    autoSelect: true,
    indexingProgress: null,
    serverStatus: {},
    isSwitching: false,
    projectAnalysis: null,
    smartModeThreshold: { ...DEFAULT_THRESHOLD },
    pendingSmartSwitch: false,
    memoryPressure: 'low',
    memoryUsage: null,
    memoryMonitorEnabled: true,
    autoDowngradeEnabled: true,
    lastMemoryCheck: null,
  }),

  getters: {
    /** 是否为 Smart Mode */
    isSmartMode: (state): boolean => state.mode === 'smart',

    /** 是否为 Basic Mode */
    isBasicMode: (state): boolean => state.mode === 'basic',

    /** 是否正在索引 */
    isIndexing: (state): boolean => {
      const phase = state.indexingProgress?.phase
      return phase === 'scanning' || phase === 'parsing' || phase === 'indexing'
    },

    /** 索引是否就绪 */
    isReady: (state): boolean => {
      if (state.mode === 'basic') return true
      return state.indexingProgress?.phase === 'ready'
    },

    /** 获取模式图标 */
    modeIcon(): string {
      if (this.isIndexing) return 'sync'
      return this.isSmartMode ? 'flash_on' : 'flash_off'
    },

    /** 获取模式标签 */
    modeLabel(): string {
      if (this.isIndexing && this.indexingProgress) {
        return `Indexing ${this.indexingProgress.percentage}%`
      }
      return this.isSmartMode ? 'Smart' : 'Basic'
    },

    /** 获取模式完整描述 */
    modeDescription(): string {
      if (this.isSmartMode) {
        return 'Smart Mode - Full indexing, advanced refactoring'
      }
      return 'Basic Mode - Standard LSP, fast & lightweight'
    },

    /** 获取所有活跃的服务器 */
    activeServers: (state): LanguageServerStatus[] => {
      return Object.values(state.serverStatus).filter(
        s => s.status === 'ready' || s.status === 'starting'
      )
    },

    /** 获取错误的服务器 */
    errorServers: (state): LanguageServerStatus[] => {
      return Object.values(state.serverStatus).filter(s => s.status === 'error')
    },

    /** 是否所有服务器就绪 */
    allServersReady: (state): boolean => {
      const servers = Object.values(state.serverStatus)
      if (servers.length === 0) return true
      return servers.every(s => s.status === 'ready' || s.status === 'stopped')
    },

    /** 是否内存压力高 */
    isHighMemoryPressure: (state): boolean => {
      return state.memoryPressure === 'high' || state.memoryPressure === 'critical'
    },

    /** 获取内存压力颜色 */
    memoryPressureColor: (state): string => {
      switch (state.memoryPressure) {
        case 'critical': return 'var(--mdui-color-error)'
        case 'high': return 'var(--mdui-color-warning, #ff9800)'
        case 'moderate': return 'var(--mdui-color-tertiary, #ffc107)'
        default: return 'var(--mdui-color-primary)'
      }
    },

    /** 获取内存使用百分比 */
    memoryUsagePercent: (state): number => {
      return state.memoryUsage ? Math.round(state.memoryUsage.usagePercent * 100) : 0
    },
  },

  actions: {
    /**
     * 切换智能模式
     */
    async setMode(mode: IntelligenceMode) {
      if (this.mode === mode) return
      if (this.isSwitching) return

      this.isSwitching = true

      try {
        // 通知主进程切换模式
        if (window.electronAPI?.intelligence?.setMode) {
          await window.electronAPI.intelligence.setMode(mode)
        }

        // 切换 IntelligenceManager 的模式 (注册/注销 Monaco providers)
        const manager = getIntelligenceManager()
        await manager.setMode(mode)

        this.mode = mode

        // Smart Mode 开始时重置索引进度
        if (mode === 'smart') {
          this.indexingProgress = { ...DEFAULT_INDEXING_PROGRESS }
        } else {
          this.indexingProgress = null
        }
      } catch (error) {
        console.error('Failed to switch intelligence mode:', error)
        throw error
      } finally {
        this.isSwitching = false
      }
    },

    /**
     * 切换模式 (Basic <-> Smart)
     */
    async toggleMode() {
      await this.setMode(this.mode === 'basic' ? 'smart' : 'basic')
    },

    /**
     * 更新索引进度
     */
    setIndexingProgress(progress: IndexingProgress) {
      this.indexingProgress = progress

      // 索引完成且有待切换，自动切换到 Smart Mode
      if (progress.phase === 'ready' && this.pendingSmartSwitch) {
        this.pendingSmartSwitch = false
        // Mode 已经是 smart，无需再切换
      }
    },

    /**
     * 更新服务器状态
     */
    setServerStatus(language: string, status: ServerStatus, message?: string) {
      const existing = this.serverStatus[language]
      this.serverStatus[language] = {
        language,
        status,
        message,
        capabilities: existing?.capabilities
      }
    },

    /**
     * 更新服务器完整状态
     */
    updateServerStatus(status: LanguageServerStatus) {
      this.serverStatus[status.language] = status
    },

    /**
     * 设置自动选择模式
     */
    async setAutoSelect(enabled: boolean) {
      this.autoSelect = enabled
      if (enabled) {
        await this.autoDetectMode()
      }
    },

    /**
     * 根据项目自动选择模式
     */
    async autoDetectMode() {
      const analysis = await this.analyzeProject()
      this.projectAnalysis = analysis

      if (
        analysis.fileCount > this.smartModeThreshold.maxFiles ||
        analysis.estimatedMemory > this.smartModeThreshold.maxMemoryMB
      ) {
        // 大型项目默认使用 Basic
        await this.setMode('basic')
      } else if (analysis.hasComplexDependencies) {
        // 复杂依赖关系的项目使用 Smart
        await this.setMode('smart')
      } else {
        // 默认使用 Basic (快速启动)
        await this.setMode('basic')
      }
    },

    /**
     * 分析项目
     */
    async analyzeProject(): Promise<ProjectAnalysis> {
      try {
        if (window.electronAPI?.intelligence?.analyzeProject) {
          return await window.electronAPI.intelligence.analyzeProject()
        }
      } catch (error) {
        console.error('Failed to analyze project:', error)
      }

      // 返回默认值
      return {
        fileCount: 0,
        totalSize: 0,
        estimatedMemory: 0,
        hasComplexDependencies: false,
        languages: []
      }
    },

    /**
     * 更新 Smart Mode 阈值
     */
    setSmartModeThreshold(threshold: Partial<SmartModeThreshold>) {
      this.smartModeThreshold = {
        ...this.smartModeThreshold,
        ...threshold
      }
    },

    /**
     * 重置状态
     */
    reset() {
      this.mode = 'basic'
      this.indexingProgress = null
      this.serverStatus = {}
      this.isSwitching = false
      this.projectAnalysis = null
      this.pendingSmartSwitch = false
      this.memoryPressure = 'low'
      this.memoryUsage = null
    },

    /**
     * 从设置初始化
     * 在应用启动时调用，从 settings store 同步模式
     */
    async initFromSettings(mode: IntelligenceMode) {
      this.mode = mode
      if (mode === 'smart') {
        this.indexingProgress = { ...DEFAULT_INDEXING_PROGRESS }
      }

      // 启动内存监控
      if (this.memoryMonitorEnabled) {
        await this.startMemoryMonitor()
      }
    },

    // ============ 内存监控相关 ============

    /**
     * 启动内存监控
     */
    async startMemoryMonitor() {
      try {
        if (window.electronAPI?.memory?.start) {
          await window.electronAPI.memory.start()
          this.memoryMonitorEnabled = true
          console.log('[Intelligence] Memory monitor started')
        }
      } catch (error) {
        console.error('Failed to start memory monitor:', error)
      }
    },

    /**
     * 停止内存监控
     */
    async stopMemoryMonitor() {
      try {
        if (window.electronAPI?.memory?.stop) {
          await window.electronAPI.memory.stop()
          this.memoryMonitorEnabled = false
          console.log('[Intelligence] Memory monitor stopped')
        }
      } catch (error) {
        console.error('Failed to stop memory monitor:', error)
      }
    },

    /**
     * 获取内存使用信息
     */
    async checkMemory() {
      try {
        if (window.electronAPI?.memory?.getUsage) {
          const usage = await window.electronAPI.memory.getUsage()
          this.memoryUsage = {
            heapUsedMB: usage.heapUsedMB,
            heapTotalMB: usage.heapTotalMB,
            rssMB: usage.rssMB,
            usagePercent: usage.usagePercent,
          }
          this.lastMemoryCheck = Date.now()
          return usage
        }
      } catch (error) {
        console.error('Failed to check memory:', error)
      }
      return null
    },

    /**
     * 处理内存压力事件
     */
    handleMemoryPressure(event: MemoryPressureEvent) {
      this.memoryPressure = event.pressure
      this.memoryUsage = {
        heapUsedMB: event.usage.heapUsedMB,
        heapTotalMB: event.usage.heapTotalMB,
        rssMB: event.usage.rssMB,
        usagePercent: event.usage.usagePercent,
      }
      this.lastMemoryCheck = event.timestamp

      // 自动降级处理
      if (this.autoDowngradeEnabled && event.recommendation === 'switch-to-basic') {
        this.handleAutoDowngrade()
      }
    },

    /**
     * 自动降级到 Basic 模式
     */
    async handleAutoDowngrade() {
      if (this.mode !== 'smart') return
      if (this.isSwitching) return

      console.warn('[Intelligence] High memory pressure detected, switching to Basic mode')

      try {
        await this.setMode('basic')

        // 发送通知事件给 UI
        const event = new CustomEvent('intelligence:auto-downgrade', {
          detail: {
            reason: 'high-memory-pressure',
            pressure: this.memoryPressure,
            usage: this.memoryUsage,
          },
        })
        window.dispatchEvent(event)
      } catch (error) {
        console.error('Failed to auto-downgrade:', error)
      }
    },

    /**
     * 设置自动降级开关
     */
    setAutoDowngrade(enabled: boolean) {
      this.autoDowngradeEnabled = enabled
    },

    /**
     * 更新内存监控配置
     */
    async updateMemoryConfig(config: {
      interval?: number
      moderateThreshold?: number
      highThreshold?: number
      criticalThreshold?: number
      autoGC?: boolean
      autoSuggestDowngrade?: boolean
    }) {
      try {
        if (window.electronAPI?.memory?.updateConfig) {
          await window.electronAPI.memory.updateConfig(config)
        }
      } catch (error) {
        console.error('Failed to update memory config:', error)
      }
    },
  }
})
