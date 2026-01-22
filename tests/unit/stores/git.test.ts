/**
 * Git Store 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGitStore } from '@/stores/git'
import { useNotificationStore } from '@/stores/notification'
import { useBottomPanelStore } from '@/stores/bottomPanel'

// Mock window.electronAPI
const mockElectronAPI = {
  git: {
    isRepo: vi.fn(),
    status: vi.fn(),
    branches: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    stageAll: vi.fn(),
    unstageAll: vi.fn(),
    commit: vi.fn(),
    discard: vi.fn(),
    checkout: vi.fn(),
    createBranch: vi.fn(),
    deleteBranch: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    pullRebase: vi.fn(),
    hasConflicts: vi.fn(),
    log: vi.fn()
  }
}

// @ts-ignore
global.window = {
  electronAPI: mockElectronAPI,
  dispatchEvent: vi.fn()
}

describe('Git Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('初始化', () => {
    it('应该正确初始化仓库', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      mockElectronAPI.git.isRepo.mockResolvedValue(true)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([
        { name: 'main', current: true }
      ])

      await gitStore.init(repoPath)

      expect(gitStore.isRepo).toBe(true)
      expect(mockElectronAPI.git.isRepo).toHaveBeenCalledWith(repoPath)
    })

    it('应该处理非Git仓库', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      mockElectronAPI.git.isRepo.mockResolvedValue(false)

      await gitStore.init(repoPath)

      expect(gitStore.isRepo).toBe(false)
    })
  })

  describe('文件操作', () => {
    it('应该能够暂存文件', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'
      const filePath = 'test.ts'

      gitStore.isRepo = true
      mockElectronAPI.git.stage.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [{ path: filePath, status: 'modified', staged: true }],
        unstaged: [],
        hasChanges: true,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.stageFile(repoPath, filePath)

      expect(mockElectronAPI.git.stage).toHaveBeenCalledWith(repoPath, filePath)
    })

    it('应该能够取消暂存文件', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'
      const filePath = 'test.ts'

      gitStore.isRepo = true
      mockElectronAPI.git.unstage.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [{ path: filePath, status: 'modified', staged: false }],
        hasChanges: true,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.unstageFile(repoPath, filePath)

      expect(mockElectronAPI.git.unstage).toHaveBeenCalledWith(repoPath, filePath)
    })

    it('应该能够暂存所有文件', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      gitStore.isRepo = true
      mockElectronAPI.git.stageAll.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.stageAll(repoPath)

      expect(mockElectronAPI.git.stageAll).toHaveBeenCalledWith(repoPath)
    })
  })

  describe('提交操作', () => {
    it('应该能够提交更改', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'
      const message = 'test commit'

      gitStore.isRepo = true
      gitStore.stagedFiles = [{ path: 'test.ts', status: 'modified', staged: true }]
      gitStore.commitMessage = message

      mockElectronAPI.git.commit.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: true
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.commit(repoPath)

      expect(mockElectronAPI.git.commit).toHaveBeenCalledWith(repoPath, message)
      expect(gitStore.commitMessage).toBe('')
    })

    it('不应该在没有暂存文件时提交', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      gitStore.isRepo = true
      gitStore.stagedFiles = []
      gitStore.commitMessage = 'test'

      await gitStore.commit(repoPath)

      expect(mockElectronAPI.git.commit).not.toHaveBeenCalled()
    })
  })

  describe('推送操作', () => {
    it('应该能够推送', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      gitStore.isRepo = true
      mockElectronAPI.git.push.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.push(repoPath)

      expect(mockElectronAPI.git.push).toHaveBeenCalledWith(repoPath)
    })

    it('应该在推送被拒时自动pull --rebase', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      gitStore.isRepo = true
      
      // 第一次推送失败（被拒）
      mockElectronAPI.git.push
        .mockRejectedValueOnce(new Error('rejected: non-fast-forward'))
      
      // pull --rebase 成功
      mockElectronAPI.git.pullRebase.mockResolvedValue(undefined)
      mockElectronAPI.git.hasConflicts.mockResolvedValue(false)
      
      // 第二次推送成功
      mockElectronAPI.git.push.mockResolvedValueOnce(undefined)
      
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.push(repoPath)

      expect(mockElectronAPI.git.pullRebase).toHaveBeenCalledWith(repoPath)
      expect(mockElectronAPI.git.push).toHaveBeenCalledTimes(2)
    })

    it('应该在pull --rebase后检测到冲突时触发冲突事件', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      gitStore.isRepo = true
      
      mockElectronAPI.git.push.mockRejectedValueOnce(
        new Error('rejected: non-fast-forward')
      )
      mockElectronAPI.git.pullRebase.mockResolvedValue(undefined)
      mockElectronAPI.git.hasConflicts.mockResolvedValue(true)

      await gitStore.push(repoPath)

      expect(mockElectronAPI.git.hasConflicts).toHaveBeenCalledWith(repoPath)
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'git:conflict-detected' })
      )
    })
  })

  describe('分支操作', () => {
    it('应该能够切换分支', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'
      const branchName = 'feature'

      gitStore.isRepo = true
      mockElectronAPI.git.checkout.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: branchName,
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([
        { name: branchName, current: true }
      ])

      await gitStore.checkout(repoPath, branchName)

      expect(mockElectronAPI.git.checkout).toHaveBeenCalledWith(repoPath, branchName)
    })

    it('应该能够创建分支', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'
      const branchName = 'new-feature'

      gitStore.isRepo = true
      mockElectronAPI.git.createBranch.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([
        { name: 'main', current: true },
        { name: branchName, current: false }
      ])

      await gitStore.createBranch(repoPath, branchName)

      // createBranch 方法只传递两个参数，第三个参数 checkout 使用默认值
      expect(mockElectronAPI.git.createBranch).toHaveBeenCalledWith(
        repoPath,
        branchName
      )
    })
  })

  describe('防抖刷新', () => {
    it('应该使用防抖刷新', async () => {
      const gitStore = useGitStore()
      const repoPath = '/test/repo'

      gitStore.isRepo = true
      gitStore.initDebouncedRefresh()

      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      // 快速调用多次刷新
      gitStore.refresh(repoPath)
      gitStore.refresh(repoPath)
      gitStore.refresh(repoPath)

      // 等待防抖时间
      await new Promise(resolve => setTimeout(resolve, 600))

      // 应该只调用一次（防抖后）
      expect(mockElectronAPI.git.status).toHaveBeenCalledTimes(1)
    })
  })

  describe('输出日志', () => {
    it('应该在操作时记录日志', async () => {
      const gitStore = useGitStore()
      const bottomPanelStore = useBottomPanelStore()
      const repoPath = '/test/repo'
      const filePath = 'test.ts'

      gitStore.isRepo = true
      mockElectronAPI.git.stage.mockResolvedValue(undefined)
      mockElectronAPI.git.status.mockResolvedValue({
        branch: 'main',
        staged: [],
        unstaged: [],
        hasChanges: false,
        hasUnpushed: false
      })
      mockElectronAPI.git.branches.mockResolvedValue([])

      await gitStore.stageFile(repoPath, filePath)

      // 检查是否有Git日志
      const gitLogs = bottomPanelStore.outputLogs.filter(
        log => log.source === 'Git'
      )
      expect(gitLogs.length).toBeGreaterThan(0)
    })
  })
})
