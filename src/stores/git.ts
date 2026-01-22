/**
 * Git 状态管理
 */

import { defineStore } from 'pinia'
import type { GitState } from '@/types'
import { useNotificationStore } from './notification'
import { useBottomPanelStore } from './bottomPanel'

// 防抖函数
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      func.apply(this, args)
    }, wait)
  }
}

// 防抖刷新函数存储（在 store 外部）
let debouncedRefresh: ((repoPath: string) => void) | null = null

// 初始化防抖刷新函数（延迟初始化，避免循环依赖）
function initDebouncedRefresh(store: ReturnType<typeof useGitStore>) {
  if (!debouncedRefresh) {
    debouncedRefresh = debounce((repoPath: string) => {
      store.refresh(repoPath, true)
    }, 500) // 500ms 防抖
  }
}

export const useGitStore = defineStore('git', {
  state: (): GitState => ({
    isRepo: false,
    currentBranch: '',
    branches: [],
    stagedFiles: [],
    unstagedFiles: [],
    commitMessage: '',
    loading: false,
    lastRefresh: 0,
    error: null
  }),

  getters: {
    /** 是否有变更 */
    hasChanges: (state) => state.stagedFiles.length > 0 || state.unstagedFiles.length > 0,

    /** 已暂存的文件数量 */
    stagedCount: (state) => state.stagedFiles.length,

    /** 未暂存的文件数量 */
    unstagedCount: (state) => state.unstagedFiles.length,

    /** 总变更数量 */
    totalChanges: (state) => state.stagedFiles.length + state.unstagedFiles.length,

    /** 可以提交 (有暂存文件且有提交信息) */
    canCommit: (state) => state.stagedFiles.length > 0 && state.commitMessage.trim().length > 0,

    /** 当前分支对象 */
    currentBranchInfo: (state) => state.branches.find(b => b.current),

    /** 本地分支列表 */
    localBranches: (state) => state.branches.filter(b => !b.remote),

    /** 远程分支列表 */
    remoteBranches: (state) => state.branches.filter(b => b.remote)
  },

  actions: {
    /**
     * 初始化 Git 状态 (检查是否是仓库)
     */
    async init(repoPath: string) {
      this.loading = true
      this.error = null

      try {
        const isRepo = await window.electronAPI.git.isRepo(repoPath)
        this.isRepo = isRepo

        if (isRepo) {
          initDebouncedRefresh(this)
          await this.refresh(repoPath, true)
        } else {
          this.$reset()
        }
      } catch (error) {
        this.error = (error as Error).message
        this.isRepo = false
      } finally {
        this.loading = false
      }
    },

    /**
     * 刷新 Git 状态（立即执行）
     */
    async refresh(repoPath: string, immediate: boolean = false) {
      if (!this.isRepo) return

      // 如果立即执行或没有防抖函数，直接执行
      if (immediate || !debouncedRefresh) {
        this.loading = true
        this.error = null

        try {
          // 并行获取状态和分支
          const [status, branches] = await Promise.all([
            window.electronAPI.git.status(repoPath),
            window.electronAPI.git.branches(repoPath)
          ])

          this.currentBranch = status.branch
          this.stagedFiles = status.staged
          this.unstagedFiles = status.unstaged
          this.branches = branches
          this.lastRefresh = Date.now()
        } catch (error) {
          this.error = (error as Error).message
        } finally {
          this.loading = false
        }
      } else {
        // 使用防抖刷新
        if (debouncedRefresh) {
          debouncedRefresh(repoPath)
        }
      }
    },

    /**
     * 暂存文件
     */
    async stageFile(repoPath: string, filePath: string) {
      const notificationStore = useNotificationStore()
      const bottomPanelStore = useBottomPanelStore()
      try {
        bottomPanelStore.logInfo('Git', `暂存文件: ${filePath}`)
        await window.electronAPI.git.stage(repoPath, filePath)
        // 使用防抖刷新，避免频繁刷新
        this.refresh(repoPath)
        notificationStore.success(`已暂存: ${filePath.split('/').pop()}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        bottomPanelStore.logError('Git', `暂存失败: ${errorMessage}`)
        notificationStore.error(`暂存失败: ${errorMessage}`)
        throw error
      }
    },

    /**
     * 取消暂存文件
     */
    async unstageFile(repoPath: string, filePath: string) {
      const notificationStore = useNotificationStore()
      try {
        await window.electronAPI.git.unstage(repoPath, filePath)
        this.refresh(repoPath)
        notificationStore.success(`已取消暂存: ${filePath.split('/').pop()}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`取消暂存失败: ${errorMessage}`)
        throw error
      }
    },

    /**
     * 暂存所有文件
     */
    async stageAll(repoPath: string) {
      const notificationStore = useNotificationStore()
      try {
        await window.electronAPI.git.stageAll(repoPath)
        this.refresh(repoPath)
        notificationStore.success('已暂存所有文件')
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`暂存失败: ${errorMessage}`)
        throw error
      }
    },

    /**
     * 取消暂存所有文件
     */
    async unstageAll(repoPath: string) {
      const notificationStore = useNotificationStore()
      try {
        await window.electronAPI.git.unstageAll(repoPath)
        this.refresh(repoPath)
        notificationStore.success('已取消暂存所有文件')
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`取消暂存失败: ${errorMessage}`)
        throw error
      }
    },

    /**
     * 放弃文件更改
     */
    async discardFile(repoPath: string, filePath: string) {
      const notificationStore = useNotificationStore()
      try {
        await window.electronAPI.git.discard(repoPath, filePath)
        this.refresh(repoPath)
        notificationStore.warning(`已放弃更改: ${filePath.split('/').pop()}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`放弃更改失败: ${errorMessage}`)
        throw error
      }
    },

    /**
     * 提交
     */
    async commit(repoPath: string) {
      if (!this.canCommit) return

      const notificationStore = useNotificationStore()
      const bottomPanelStore = useBottomPanelStore()
      this.loading = true
      this.error = null

      try {
        const message = this.commitMessage.trim()
        bottomPanelStore.logInfo('Git', `提交更改: ${message}`)
        await window.electronAPI.git.commit(repoPath, message)
        this.commitMessage = ''
        // 提交后立即刷新
        await this.refresh(repoPath, true)
        bottomPanelStore.logInfo('Git', '提交成功')
        notificationStore.success(`提交成功: ${message}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        bottomPanelStore.logError('Git', `提交失败: ${errorMessage}`)
        notificationStore.error(`提交失败: ${errorMessage}`)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 获取文件差异
     */
    async getDiff(repoPath: string, filePath: string, staged: boolean): Promise<string> {
      try {
        return await window.electronAPI.git.diff(repoPath, filePath, staged)
      } catch (error) {
        this.error = (error as Error).message
        throw error
      }
    },

    /**
     * 切换分支
     */
    async checkout(repoPath: string, branchName: string) {
      const notificationStore = useNotificationStore()
      this.loading = true
      this.error = null

      try {
        await window.electronAPI.git.checkout(repoPath, branchName)
        await this.refresh(repoPath)
        notificationStore.success(`已切换到分支: ${branchName}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`切换分支失败: ${errorMessage}`)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 创建分支
     */
    async createBranch(repoPath: string, branchName: string) {
      const notificationStore = useNotificationStore()
      this.loading = true
      this.error = null

      try {
        await window.electronAPI.git.createBranch(repoPath, branchName)
        await this.refresh(repoPath)
        notificationStore.success(`已创建分支: ${branchName}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`创建分支失败: ${errorMessage}`)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 删除分支
     */
    async deleteBranch(repoPath: string, branchName: string) {
      const notificationStore = useNotificationStore()
      this.loading = true
      this.error = null

      try {
        await window.electronAPI.git.deleteBranch(repoPath, branchName)
        await this.refresh(repoPath)
        notificationStore.warning(`已删除分支: ${branchName}`)
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`删除分支失败: ${errorMessage}`)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 推送
     */
    async push(repoPath: string) {
      const notificationStore = useNotificationStore()
      const bottomPanelStore = useBottomPanelStore()
      this.loading = true
      this.error = null

      try {
        bottomPanelStore.logInfo('Git', `正在推送到远程仓库...`)
        await window.electronAPI.git.push(repoPath)
        await this.refresh(repoPath)
        bottomPanelStore.logInfo('Git', '推送成功')
        notificationStore.success('推送成功')
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        bottomPanelStore.logError('Git', `推送失败: ${errorMessage}`)
        
        // 检测推送被拒的情况（通常包含 "rejected" 或 "non-fast-forward"）
        if (errorMessage.includes('rejected') || errorMessage.includes('non-fast-forward')) {
          bottomPanelStore.logInfo('Git', '检测到推送被拒，尝试 pull --rebase...')
          notificationStore.info('推送被拒，正在尝试 pull --rebase...')
          
          try {
            // 尝试 pull --rebase
            await window.electronAPI.git.pullRebase(repoPath)
            bottomPanelStore.logInfo('Git', 'pull --rebase 成功')
            
            // 检查是否有冲突
            const hasConflicts = await window.electronAPI.git.hasConflicts(repoPath)
            
            if (hasConflicts) {
              bottomPanelStore.logWarn('Git', '检测到合并冲突，请解决冲突后继续')
              notificationStore.warning('检测到合并冲突，请解决冲突后继续')
              // 触发冲突处理界面显示（通过事件或直接导航）
              // 由于store中不能直接使用router，我们通过window事件通知
              window.dispatchEvent(new CustomEvent('git:conflict-detected'))
              return
            }
            
            // 没有冲突，再次尝试推送
            bottomPanelStore.logInfo('Git', '重新尝试推送...')
            await window.electronAPI.git.push(repoPath)
            await this.refresh(repoPath)
            bottomPanelStore.logInfo('Git', '推送成功')
            notificationStore.success('推送成功（已自动 rebase）')
          } catch (rebaseError) {
            const rebaseErrorMessage = (rebaseError as Error).message
            bottomPanelStore.logError('Git', `pull --rebase 失败: ${rebaseErrorMessage}`)
            
            // 检查是否有冲突
            const hasConflicts = await window.electronAPI.git.hasConflicts(repoPath)
            if (hasConflicts) {
              bottomPanelStore.logWarn('Git', '检测到合并冲突，请解决冲突后继续')
              notificationStore.warning('检测到合并冲突，请解决冲突后继续')
              // 触发冲突处理界面显示
              window.dispatchEvent(new CustomEvent('git:conflict-detected'))
              return
            }
            
            notificationStore.error(`pull --rebase 失败: ${rebaseErrorMessage}`)
            throw rebaseError
          }
        } else {
          notificationStore.error(`推送失败: ${errorMessage}`)
          throw error
        }
      } finally {
        this.loading = false
      }
    },

    /**
     * 拉取
     */
    async pull(repoPath: string) {
      const notificationStore = useNotificationStore()
      this.loading = true
      this.error = null

      try {
        await window.electronAPI.git.pull(repoPath)
        await this.refresh(repoPath)
        notificationStore.success('拉取成功')
      } catch (error) {
        const errorMessage = (error as Error).message
        this.error = errorMessage
        notificationStore.error(`拉取失败: ${errorMessage}`)
        throw error
      } finally {
        this.loading = false
      }
    },

    /**
     * 获取提交历史
     */
    async getLog(repoPath: string, limit = 50) {
      try {
        return await window.electronAPI.git.log(repoPath, limit)
      } catch (error) {
        this.error = (error as Error).message
        throw error
      }
    },

    /**
     * 更新提交信息
     */
    setCommitMessage(message: string) {
      this.commitMessage = message
    },

    /**
     * 重置状态
     */
    reset() {
      this.$reset()
    }
  }
})