/**
 * 文件历史状态管理
 * 管理文件的 commit 历史、行历史等
 */

import { defineStore } from 'pinia'
import type { CommitDetails, LineHistory, FileHistoryOptions } from '@/types'

/** Git Commit 简化类型 */
interface GitCommit {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: Date
  message: string
}

/** 文件历史状态 */
interface FileHistoryState {
  /** 当前查看的文件路径 */
  currentFilePath: string | null
  /** 文件历史列表 */
  commits: GitCommit[]
  /** 是否有更多数据可加载 */
  hasMore: boolean
  /** 当前加载的页数 */
  currentPage: number
  /** 每页数量 */
  pageSize: number
  /** 是否正在加载 */
  isLoading: boolean
  /** 选中的 commit */
  selectedCommit: CommitDetails | null
  /** 行历史数据 */
  lineHistory: LineHistory[]
  /** 行历史的起始行 */
  lineHistoryStart: number
  /** 行历史的结束行 */
  lineHistoryEnd: number
  /** 是否显示文件历史面板 */
  showPanel: boolean
  /** 面板模式 */
  panelMode: 'file' | 'line'
  /** 比较视图的两个 commit */
  compareCommits: { from: string; to: string } | null
  /** 文件在某个 commit 时的内容 */
  fileContent: string | null
  /** 文件内容加载中 */
  fileContentLoading: boolean
}

export const useFileHistoryStore = defineStore('fileHistory', {
  state: (): FileHistoryState => ({
    currentFilePath: null,
    commits: [],
    hasMore: true,
    currentPage: 0,
    pageSize: 50,
    isLoading: false,
    selectedCommit: null,
    lineHistory: [],
    lineHistoryStart: 0,
    lineHistoryEnd: 0,
    showPanel: false,
    panelMode: 'file',
    compareCommits: null,
    fileContent: null,
    fileContentLoading: false
  }),

  getters: {
    /** 是否有历史数据 */
    hasHistory: (state): boolean => state.commits.length > 0,

    /** 获取选中 commit 的索引 */
    selectedIndex: (state): number => {
      if (!state.selectedCommit) return -1
      return state.commits.findIndex(c => c.hash === state.selectedCommit?.hash)
    },

    /** 获取上一个 commit */
    previousCommit(): GitCommit | null {
      const index = this.selectedIndex
      if (index < 0 || index >= this.commits.length - 1) return null
      return this.commits[index + 1]
    },

    /** 获取下一个 commit */
    nextCommit(): GitCommit | null {
      const index = this.selectedIndex
      if (index <= 0) return null
      return this.commits[index - 1]
    }
  },

  actions: {
    /**
     * 加载文件历史
     */
    async loadFileHistory(
      repoPath: string,
      filePath: string,
      options?: FileHistoryOptions
    ): Promise<void> {
      // 如果是新文件，重置状态
      if (this.currentFilePath !== filePath) {
        this.resetState()
        this.currentFilePath = filePath
      }

      this.isLoading = true
      this.panelMode = 'file'

      try {
        const skip = options?.skip ?? this.currentPage * this.pageSize
        const limit = options?.limit ?? this.pageSize

        const commits = await window.electronAPI.git.getFileHistory(
          repoPath,
          filePath,
          { limit, skip, follow: options?.follow ?? true }
        )

        // 转换为 GitCommit 类型
        const newCommits: GitCommit[] = commits.map(c => ({
          hash: c.hash,
          shortHash: c.hash.substring(0, 7),
          author: c.author,
          authorEmail: c.authorEmail || '',
          date: new Date(c.date),
          message: c.message
        }))

        if (skip === 0) {
          this.commits = newCommits
        } else {
          // 追加到现有列表
          this.commits = [...this.commits, ...newCommits]
        }

        this.hasMore = commits.length === limit
        this.currentPage = Math.floor((skip + commits.length) / this.pageSize)
      } catch (error) {
        console.error('Failed to load file history:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 加载更多历史记录
     */
    async loadMore(repoPath: string): Promise<void> {
      if (!this.currentFilePath || !this.hasMore || this.isLoading) return

      await this.loadFileHistory(repoPath, this.currentFilePath, {
        skip: this.commits.length
      })
    },

    /**
     * 加载行历史
     */
    async loadLineHistory(
      repoPath: string,
      filePath: string,
      startLine: number,
      endLine: number,
      options?: { limit?: number }
    ): Promise<void> {
      this.isLoading = true
      this.panelMode = 'line'
      this.lineHistoryStart = startLine
      this.lineHistoryEnd = endLine
      this.currentFilePath = filePath

      try {
        const history = await window.electronAPI.git.getLineHistory(
          repoPath,
          filePath,
          startLine,
          endLine,
          { limit: options?.limit ?? 20 }
        )

        this.lineHistory = history.map(h => ({
          hash: h.hash,
          shortHash: h.shortHash,
          author: h.author,
          authorEmail: h.authorEmail,
          date: new Date(h.date),
          message: h.message,
          lineContent: '',
          lineNumber: startLine
        }))
      } catch (error) {
        console.error('Failed to load line history:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 选择一个 commit 查看详情
     */
    async selectCommit(repoPath: string, hash: string): Promise<void> {
      try {
        const commitData = await window.electronAPI.git.getCommit(repoPath, hash)
        if (commitData) {
          this.selectedCommit = {
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
        }
      } catch (error) {
        console.error('Failed to get commit details:', error)
      }
    },

    /**
     * 清除选中的 commit
     */
    clearSelection(): void {
      this.selectedCommit = null
      this.compareCommits = null
    },

    /**
     * 获取指定 commit 时的文件内容
     */
    async loadFileAtCommit(
      repoPath: string,
      filePath: string,
      commitHash: string
    ): Promise<string> {
      this.fileContentLoading = true

      try {
        const content = await window.electronAPI.git.getFileAtCommit(
          repoPath,
          filePath,
          commitHash
        )
        this.fileContent = content
        return content
      } catch (error) {
        console.error('Failed to get file at commit:', error)
        this.fileContent = null
        throw error
      } finally {
        this.fileContentLoading = false
      }
    },

    /**
     * 设置比较的两个 commit
     */
    setCompareCommits(from: string, to: string): void {
      this.compareCommits = { from, to }
    },

    /**
     * 比较两个 commit
     */
    async compareWithCommit(
      repoPath: string,
      fromCommit: string,
      toCommit: string
    ): Promise<string> {
      this.setCompareCommits(fromCommit, toCommit)
      return await window.electronAPI.git.diffCommits(
        repoPath,
        fromCommit,
        toCommit,
        { path: this.currentFilePath || undefined }
      )
    },

    /**
     * 显示文件历史面板
     */
    openPanel(filePath?: string): void {
      if (filePath) {
        this.currentFilePath = filePath
      }
      this.showPanel = true
    },

    /**
     * 隐藏文件历史面板
     */
    closePanel(): void {
      this.showPanel = false
    },

    /**
     * 切换面板显示
     */
    togglePanel(): void {
      this.showPanel = !this.showPanel
    },

    /**
     * 重置状态
     */
    resetState(): void {
      this.currentFilePath = null
      this.commits = []
      this.hasMore = true
      this.currentPage = 0
      this.isLoading = false
      this.selectedCommit = null
      this.lineHistory = []
      this.lineHistoryStart = 0
      this.lineHistoryEnd = 0
      this.compareCommits = null
      this.fileContent = null
    },

    /**
     * 刷新当前文件历史
     */
    async refresh(repoPath: string): Promise<void> {
      if (!this.currentFilePath) return

      this.commits = []
      this.currentPage = 0
      this.hasMore = true

      await this.loadFileHistory(repoPath, this.currentFilePath)
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

      if (years > 0) return `${years} 年前`
      if (months > 0) return `${months} 个月前`
      if (days > 0) return `${days} 天前`
      if (hours > 0) return `${hours} 小时前`
      if (minutes > 0) return `${minutes} 分钟前`
      return '刚刚'
    }
  }
})
