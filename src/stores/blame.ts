/**
 * Blame 状态管理
 * 管理文件的 git blame 数据、缓存和显示状态
 */

import { defineStore } from 'pinia'
import type { BlameInfo, BlameCacheEntry, CommitDetails } from '@/types'

/** Blame store 状态 */
interface BlameState {
  /** 文件级 blame 缓存 */
  cache: Map<string, BlameCacheEntry>
  /** 缓存 TTL (毫秒) - 默认 5 分钟 */
  cacheTTL: number
  /** 是否显示 inline blame */
  showInlineBlame: boolean
  /** 当前光标所在行的 blame 信息 */
  currentLineBlame: BlameInfo | null
  /** 当前文件路径 */
  currentFilePath: string | null
  /** 正在加载的文件 */
  loadingFiles: Set<string>
  /** 悬停显示的 commit 详情 */
  hoveredCommit: CommitDetails | null
  /** 是否显示 blame hover 卡片 */
  showHoverCard: boolean
  /** Hover 卡片位置 */
  hoverCardPosition: { x: number; y: number } | null
}

export const useBlameStore = defineStore('blame', {
  state: (): BlameState => ({
    cache: new Map(),
    cacheTTL: 5 * 60 * 1000, // 5 分钟
    showInlineBlame: true,
    currentLineBlame: null,
    currentFilePath: null,
    loadingFiles: new Set(),
    hoveredCommit: null,
    showHoverCard: false,
    hoverCardPosition: null
  }),

  getters: {
    /** 获取指定文件的 blame 数据 */
    getBlameData: (state) => (filePath: string): BlameInfo[] | null => {
      const entry = state.cache.get(filePath)
      if (!entry) return null

      // 检查是否过期
      if (Date.now() - entry.cachedAt > state.cacheTTL) {
        state.cache.delete(filePath)
        return null
      }

      return entry.blameData
    },

    /** 获取指定行的 blame 信息 */
    getBlameForLine: (state) => (filePath: string, lineNumber: number): BlameInfo | null => {
      const entry = state.cache.get(filePath)
      if (!entry) return null

      // 检查是否过期
      if (Date.now() - entry.cachedAt > state.cacheTTL) {
        state.cache.delete(filePath)
        return null
      }

      return entry.blameData.find(b => b.lineNumber === lineNumber) || null
    },

    /** 检查文件是否正在加载 */
    isLoading: (state) => (filePath: string): boolean => {
      return state.loadingFiles.has(filePath)
    },

    /** 检查文件是否有缓存 (且未过期) */
    hasCachedData: (state) => (filePath: string): boolean => {
      const entry = state.cache.get(filePath)
      if (!entry) return false
      return Date.now() - entry.cachedAt <= state.cacheTTL
    }
  },

  actions: {
    /**
     * 加载文件的 blame 数据
     */
    async loadBlame(repoPath: string, filePath: string, force: boolean = false): Promise<BlameInfo[]> {
      // 如果已有缓存且不强制刷新，直接返回
      if (!force && this.hasCachedData(filePath)) {
        return this.cache.get(filePath)!.blameData
      }

      // 如果正在加载，等待
      if (this.loadingFiles.has(filePath)) {
        // 等待加载完成
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (!this.loadingFiles.has(filePath)) {
              clearInterval(checkInterval)
              resolve(this.cache.get(filePath)?.blameData || [])
            }
          }, 100)
        })
      }

      this.loadingFiles.add(filePath)

      try {
        const blameData = await window.electronAPI.git.blameStructured(repoPath, filePath)

        // 转换为 BlameInfo 类型
        const blameInfos: BlameInfo[] = blameData.map(b => ({
          commitHash: b.commitHash,
          shortHash: b.shortHash,
          author: b.author,
          authorEmail: b.authorEmail,
          authorTime: new Date(b.authorTime),
          summary: b.summary,
          lineNumber: b.lineNumber,
          lineContent: b.lineContent,
          isUncommitted: b.isUncommitted
        }))

        // 缓存数据
        this.cache.set(filePath, {
          filePath,
          blameData: blameInfos,
          cachedAt: Date.now()
        })

        return blameInfos
      } catch (error) {
        console.error('Failed to load blame:', error)
        return []
      } finally {
        this.loadingFiles.delete(filePath)
      }
    },

    /**
     * 更新当前行的 blame 信息
     */
    async updateCurrentLineBlame(repoPath: string, filePath: string, lineNumber: number): Promise<void> {
      this.currentFilePath = filePath

      // 获取缓存数据或加载
      let blameData = this.getBlameData(filePath)
      if (!blameData) {
        blameData = await this.loadBlame(repoPath, filePath)
      }

      // 查找当前行的 blame 信息
      this.currentLineBlame = blameData.find(b => b.lineNumber === lineNumber) || null
    },

    /**
     * 清除当前行 blame 信息
     */
    clearCurrentLineBlame(): void {
      this.currentLineBlame = null
      this.currentFilePath = null
    },

    /**
     * 失效指定文件的缓存
     */
    invalidateCache(filePath: string): void {
      this.cache.delete(filePath)
    },

    /**
     * 失效所有缓存
     */
    invalidateAllCache(): void {
      this.cache.clear()
    },

    /**
     * 清理过期缓存
     */
    cleanupExpiredCache(): void {
      const now = Date.now()
      for (const [filePath, entry] of this.cache) {
        if (now - entry.cachedAt > this.cacheTTL) {
          this.cache.delete(filePath)
        }
      }
    },

    /**
     * 切换 inline blame 显示
     */
    toggleInlineBlame(): void {
      this.showInlineBlame = !this.showInlineBlame
    },

    /**
     * 设置 inline blame 显示状态
     */
    setInlineBlameVisible(visible: boolean): void {
      this.showInlineBlame = visible
    },

    /**
     * 显示 commit hover 卡片
     */
    async showCommitHoverCard(
      repoPath: string,
      commitHash: string,
      position: { x: number; y: number }
    ): Promise<void> {
      // 不显示未提交更改的卡片
      if (commitHash === '0000000000000000000000000000000000000000') {
        return
      }

      try {
        const commitData = await window.electronAPI.git.getCommit(repoPath, commitHash)
        if (commitData) {
          this.hoveredCommit = {
            hash: commitData.hash,
            shortHash: commitData.shortHash,
            author: {
              name: commitData.author.name,
              email: commitData.author.email,
              date: new Date(commitData.author.date)
            },
            committer: {
              name: commitData.committer.name,
              email: commitData.committer.email,
              date: new Date(commitData.committer.date)
            },
            message: commitData.message,
            body: commitData.body,
            parents: commitData.parents,
            stats: commitData.stats
          }
          this.hoverCardPosition = position
          this.showHoverCard = true
        }
      } catch (error) {
        console.error('Failed to load commit details:', error)
      }
    },

    /**
     * 隐藏 commit hover 卡片
     */
    hideCommitHoverCard(): void {
      this.showHoverCard = false
      this.hoveredCommit = null
      this.hoverCardPosition = null
    },

    /**
     * 更新缓存 TTL
     */
    setCacheTTL(ttl: number): void {
      this.cacheTTL = ttl
    },

    /**
     * 格式化 blame 显示文本
     */
    formatBlameText(blame: BlameInfo): string {
      if (blame.isUncommitted) {
        return 'Not Committed Yet'
      }

      const relativeTime = this.formatRelativeTime(blame.authorTime)
      return `${blame.author}, ${relativeTime} • ${blame.summary}`
    },

    /**
     * 格式化相对时间
     */
    formatRelativeTime(date: Date): string {
      const now = new Date()
      const diff = now.getTime() - date.getTime()

      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)
      const months = Math.floor(days / 30)
      const years = Math.floor(days / 365)

      if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`
      if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`
      if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
      if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
      if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
      return 'just now'
    }
  }
})
