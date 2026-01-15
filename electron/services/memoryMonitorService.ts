/**
 * 内存监控服务
 * 监控应用内存使用，在内存压力过大时触发自动降级
 */

import { ipcMain, BrowserWindow } from 'electron'
import * as v8 from 'v8'

/** 内存使用信息 */
export interface MemoryUsageInfo {
  heapUsed: number      // 已使用堆内存 (bytes)
  heapTotal: number     // 总堆内存 (bytes)
  external: number      // 外部内存 (bytes)
  rss: number           // 常驻集大小 (bytes)
  heapUsedMB: number    // 已使用堆内存 (MB)
  heapTotalMB: number   // 总堆内存 (MB)
  rssMB: number         // 常驻集大小 (MB)
  usagePercent: number  // 使用率百分比
}

/** 内存压力级别 */
export type MemoryPressure = 'low' | 'moderate' | 'high' | 'critical'

/** 内存监控事件 */
export interface MemoryPressureEvent {
  pressure: MemoryPressure
  usage: MemoryUsageInfo
  timestamp: number
  recommendation?: 'switch-to-basic' | 'gc' | 'none'
}

/** 内存监控配置 */
export interface MemoryMonitorConfig {
  /** 监控间隔 (ms) */
  interval: number
  /** 中等压力阈值 (0-1) */
  moderateThreshold: number
  /** 高压力阈值 (0-1) */
  highThreshold: number
  /** 危险压力阈值 (0-1) */
  criticalThreshold: number
  /** 是否自动触发 GC */
  autoGC: boolean
  /** 是否自动建议降级 */
  autoSuggestDowngrade: boolean
}

/** 默认配置 */
const DEFAULT_CONFIG: MemoryMonitorConfig = {
  interval: 30000, // 30 秒
  moderateThreshold: 0.6,
  highThreshold: 0.75,
  criticalThreshold: 0.85,
  autoGC: true,
  autoSuggestDowngrade: true,
}

/**
 * 内存监控器类
 */
class MemoryMonitor {
  private config: MemoryMonitorConfig
  private intervalId: NodeJS.Timeout | null = null
  private mainWindow: (() => BrowserWindow | null) | null = null
  private lastPressure: MemoryPressure = 'low'
  private consecutiveHighPressure: number = 0
  private isEnabled: boolean = false

  constructor(config: Partial<MemoryMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 设置主窗口获取函数
   */
  setMainWindow(getMainWindow: () => BrowserWindow | null): void {
    this.mainWindow = getMainWindow
  }

  /**
   * 启动监控
   */
  start(): void {
    if (this.isEnabled) return
    this.isEnabled = true

    // 立即检查一次
    this.checkMemory()

    // 启动定期检查
    this.intervalId = setInterval(() => {
      this.checkMemory()
    }, this.config.interval)

    console.log('[MemoryMonitor] Started with interval:', this.config.interval, 'ms')
  }

  /**
   * 停止监控
   */
  stop(): void {
    this.isEnabled = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    console.log('[MemoryMonitor] Stopped')
  }

  /**
   * 获取当前内存使用情况
   */
  getMemoryUsage(): MemoryUsageInfo {
    const usage = process.memoryUsage()
    const heapStats = v8.getHeapStatistics()

    const heapUsed = usage.heapUsed
    const heapTotal = heapStats.heap_size_limit || usage.heapTotal

    return {
      heapUsed,
      heapTotal,
      external: usage.external,
      rss: usage.rss,
      heapUsedMB: Math.round(heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(heapTotal / (1024 * 1024)),
      rssMB: Math.round(usage.rss / (1024 * 1024)),
      usagePercent: heapUsed / heapTotal,
    }
  }

  /**
   * 计算内存压力级别
   */
  private calculatePressure(usagePercent: number): MemoryPressure {
    if (usagePercent >= this.config.criticalThreshold) {
      return 'critical'
    }
    if (usagePercent >= this.config.highThreshold) {
      return 'high'
    }
    if (usagePercent >= this.config.moderateThreshold) {
      return 'moderate'
    }
    return 'low'
  }

  /**
   * 检查内存状态
   */
  private checkMemory(): void {
    const usage = this.getMemoryUsage()
    const pressure = this.calculatePressure(usage.usagePercent)

    // 检测压力变化
    const pressureChanged = pressure !== this.lastPressure

    // 追踪连续高压力
    if (pressure === 'high' || pressure === 'critical') {
      this.consecutiveHighPressure++
    } else {
      this.consecutiveHighPressure = 0
    }

    // 构建事件
    const event: MemoryPressureEvent = {
      pressure,
      usage,
      timestamp: Date.now(),
      recommendation: this.getRecommendation(pressure),
    }

    // 日志输出
    if (pressureChanged || pressure !== 'low') {
      console.log(
        `[MemoryMonitor] Pressure: ${pressure}, ` +
          `Heap: ${usage.heapUsedMB}MB/${usage.heapTotalMB}MB (${Math.round(usage.usagePercent * 100)}%)`
      )
    }

    // 自动 GC
    if (this.config.autoGC && (pressure === 'high' || pressure === 'critical')) {
      this.triggerGC()
    }

    // 通知前端
    if (pressureChanged || pressure === 'critical') {
      this.notifyRenderer(event)
    }

    this.lastPressure = pressure
  }

  /**
   * 获取建议操作
   */
  private getRecommendation(pressure: MemoryPressure): MemoryPressureEvent['recommendation'] {
    if (!this.config.autoSuggestDowngrade) {
      return 'none'
    }

    // 连续 3 次高压力或 1 次危险压力时建议降级
    if (pressure === 'critical' || (pressure === 'high' && this.consecutiveHighPressure >= 3)) {
      return 'switch-to-basic'
    }

    if (pressure === 'high') {
      return 'gc'
    }

    return 'none'
  }

  /**
   * 触发垃圾回收
   */
  private triggerGC(): void {
    if (global.gc) {
      console.log('[MemoryMonitor] Triggering garbage collection')
      global.gc()
    }
  }

  /**
   * 通知渲染进程
   */
  private notifyRenderer(event: MemoryPressureEvent): void {
    if (this.mainWindow) {
      const win = this.mainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('memory:pressure', event)
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MemoryMonitorConfig>): void {
    this.config = { ...this.config, ...config }

    // 如果正在运行，重启以应用新配置
    if (this.isEnabled) {
      this.stop()
      this.start()
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): MemoryMonitorConfig {
    return { ...this.config }
  }
}

// 全局内存监控实例
const memoryMonitor = new MemoryMonitor()

/**
 * 注册内存监控 IPC 处理程序
 */
export function registerMemoryMonitorHandlers(getMainWindow: () => BrowserWindow | null): void {
  memoryMonitor.setMainWindow(getMainWindow)

  // 启动内存监控
  ipcMain.handle('memory:start', () => {
    memoryMonitor.start()
    return { success: true }
  })

  // 停止内存监控
  ipcMain.handle('memory:stop', () => {
    memoryMonitor.stop()
    return { success: true }
  })

  // 获取当前内存使用
  ipcMain.handle('memory:getUsage', () => {
    return memoryMonitor.getMemoryUsage()
  })

  // 更新配置
  ipcMain.handle('memory:updateConfig', (_, config: Partial<MemoryMonitorConfig>) => {
    memoryMonitor.updateConfig(config)
    return { success: true }
  })

  // 获取配置
  ipcMain.handle('memory:getConfig', () => {
    return memoryMonitor.getConfig()
  })

  // 手动触发检查
  ipcMain.handle('memory:check', () => {
    const usage = memoryMonitor.getMemoryUsage()
    return usage
  })
}

/**
 * 获取内存监控实例
 */
export function getMemoryMonitor(): MemoryMonitor {
  return memoryMonitor
}

/**
 * 启动内存监控（在应用启动时调用）
 */
export function startMemoryMonitoring(getMainWindow: () => BrowserWindow | null): void {
  memoryMonitor.setMainWindow(getMainWindow)
  memoryMonitor.start()
}
