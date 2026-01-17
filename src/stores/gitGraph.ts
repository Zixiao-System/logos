/**
 * Git Graph 状态管理
 * 管理 Git DAG 图的数据、渲染状态和交互
 */

import { defineStore } from 'pinia'
import type {
  GraphCommit,
  GraphConnection,
  GitRef,
  GitGraphOptions,
  GitGraphViewState
} from '@/types/gitGraph'
import type { CommitDetails } from '@/types/gitLens'

/** Git Graph 状态 */
interface GitGraphState {
  /** 仓库路径 */
  repoPath: string | null
  /** Commits 列表 */
  commits: GraphCommit[]
  /** 连线列表 */
  connections: GraphConnection[]
  /** 分支列表 */
  branches: GitRef[]
  /** 远程分支列表 */
  remoteBranches: GitRef[]
  /** Tags 列表 */
  tags: GitRef[]
  /** 当前分支 */
  currentBranch: string
  /** HEAD commit hash */
  headCommit: string
  /** 总 commit 数 */
  totalCommits: number
  /** 是否正在加载 */
  isLoading: boolean
  /** 加载错误 */
  error: string | null
  /** 加载选项 */
  loadOptions: GitGraphOptions
  /** 视图状态 */
  viewState: GitGraphViewState
  /** 选中的 commit 详情 */
  selectedCommitDetails: CommitDetails | null
  /** 最大泳道数 */
  maxLanes: number
}

/** 默认视图状态 */
const DEFAULT_VIEW_STATE: GitGraphViewState = {
  visibleStart: 0,
  visibleCount: 100,
  selectedCommit: null,
  expandedCommits: [],
  searchQuery: '',
  filteredBranches: [],
  showRemotes: true,
  showTags: true
}

/** 泳道颜色 */
const LANE_COLORS_INTERNAL = [
  '#e91e63', '#2196f3', '#4caf50', '#ff9800',
  '#9c27b0', '#00bcd4', '#ff5722', '#795548',
  '#607d8b', '#f44336', '#3f51b5', '#009688'
]

export const useGitGraphStore = defineStore('gitGraph', {
  state: (): GitGraphState => ({
    repoPath: null,
    commits: [],
    connections: [],
    branches: [],
    remoteBranches: [],
    tags: [],
    currentBranch: '',
    headCommit: '',
    totalCommits: 0,
    isLoading: false,
    error: null,
    loadOptions: {
      limit: 500,
      skip: 0,
      includeRemotes: true
    },
    viewState: { ...DEFAULT_VIEW_STATE },
    selectedCommitDetails: null,
    maxLanes: 0
  }),

  getters: {
    /** 获取可见的 commits */
    visibleCommits(): GraphCommit[] {
      const { visibleStart, visibleCount } = this.viewState
      return this.commits.slice(visibleStart, visibleStart + visibleCount)
    },

    /** 获取可见的连线 */
    visibleConnections(): GraphConnection[] {
      const { visibleStart, visibleCount } = this.viewState
      const endRow = visibleStart + visibleCount
      return this.connections.filter(c =>
        (c.from.row >= visibleStart && c.from.row < endRow) ||
        (c.to.row >= visibleStart && c.to.row < endRow)
      )
    },

    /** 获取选中的 commit */
    selectedCommit(): GraphCommit | null {
      if (!this.viewState.selectedCommit) return null
      return this.commits.find(c => c.hash === this.viewState.selectedCommit) || null
    },

    /** 是否有更多数据 */
    hasMore(): boolean {
      return this.commits.length < this.totalCommits
    },

    /** 获取所有本地分支 */
    localBranches(): GitRef[] {
      return this.branches.filter(b => b.type === 'branch')
    },

    /** 根据 hash 获取 commit */
    getCommitByHash: (state) => (hash: string): GraphCommit | null => {
      return state.commits.find(c => c.hash === hash || c.hash.startsWith(hash)) || null
    },

    /** 获取泳道颜色 */
    getLaneColor: () => (lane: number): string => {
      return LANE_COLORS_INTERNAL[lane % LANE_COLORS_INTERNAL.length]
    }
  },

  actions: {
    /**
     * 加载 Git Graph 数据
     */
    async loadGraph(repoPath: string, options?: GitGraphOptions): Promise<void> {
      this.repoPath = repoPath
      this.isLoading = true
      this.error = null

      const mergedOptions = { ...this.loadOptions, ...options }

      try {
        const data = await window.electronAPI.git.getGraph(repoPath, mergedOptions)

        // 处理 commits
        const processedCommits = this.processCommits(data.commits)

        // 计算泳道和连线
        const { commits, connections, maxLanes } = this.computeGraphLayout(processedCommits)

        // 如果是分页加载，追加数据
        if (mergedOptions.skip && mergedOptions.skip > 0) {
          this.commits = [...this.commits, ...commits]
          this.connections = [...this.connections, ...connections]
        } else {
          this.commits = commits
          this.connections = connections
        }

        this.maxLanes = maxLanes

        // 处理分支和 tags
        this.branches = data.branches.filter(b => b.type === 'branch')
        this.remoteBranches = data.branches.filter(b => b.type === 'remote-branch')
        this.tags = data.tags.map(t => ({
          name: t.name,
          type: 'tag' as const,
          commitHash: t.hash
        }))

        this.currentBranch = data.currentBranch
        this.headCommit = data.headCommit

        // 估算总数 (如果返回满页数据，说明可能还有更多)
        if (data.commits.length === (mergedOptions.limit || 500)) {
          this.totalCommits = (mergedOptions.skip || 0) + data.commits.length + 1
        } else {
          this.totalCommits = (mergedOptions.skip || 0) + data.commits.length
        }

        this.loadOptions = mergedOptions
      } catch (error) {
        this.error = (error as Error).message
        console.error('Failed to load git graph:', error)
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 处理原始 commits 数据
     */
    processCommits(rawCommits: Array<{
      hash: string
      shortHash: string
      parents: string[]
      author: { name: string; email: string; date: string }
      committer: { name: string; email: string; date: string }
      message: string
      refs: string[]
    }>): GraphCommit[] {
      // 构建 hash -> index 映射
      const hashToIndex = new Map<string, number>()
      rawCommits.forEach((c, i) => hashToIndex.set(c.hash, i))

      // 构建子节点映射
      const childMap = new Map<string, string[]>()
      rawCommits.forEach(commit => {
        commit.parents.forEach(parentHash => {
          if (!childMap.has(parentHash)) {
            childMap.set(parentHash, [])
          }
          childMap.get(parentHash)!.push(commit.hash)
        })
      })

      return rawCommits.map((commit, index) => {
        // 解析 refs
        const branches: string[] = []
        const tagsList: string[] = []
        commit.refs.forEach(ref => {
          if (ref.startsWith('tag: ')) {
            tagsList.push(ref.substring(5))
          } else if (ref === 'HEAD') {
            // Skip HEAD
          } else {
            branches.push(ref)
          }
        })

        return {
          hash: commit.hash,
          shortHash: commit.shortHash,
          author: {
            name: commit.author.name,
            email: commit.author.email,
            date: new Date(commit.author.date)
          },
          committer: {
            name: commit.committer.name,
            email: commit.committer.email,
            date: new Date(commit.committer.date)
          },
          message: commit.message,
          parents: commit.parents,
          stats: { additions: 0, deletions: 0, filesChanged: 0 },
          lane: 0,
          color: LANE_COLORS_INTERNAL[0],
          row: index,
          parentHashes: commit.parents,
          childHashes: childMap.get(commit.hash) || [],
          branches,
          tags: tagsList,
          isHead: commit.hash === this.headCommit,
          isMerge: commit.parents.length > 1
        }
      })
    },

    /**
     * 计算图形布局 (泳道分配)
     */
    computeGraphLayout(commits: GraphCommit[]): {
      commits: GraphCommit[]
      connections: GraphConnection[]
      maxLanes: number
    } {
      if (commits.length === 0) {
        return { commits: [], connections: [], maxLanes: 0 }
      }

      const connections: GraphConnection[] = []
      const activeLanes: (string | null)[] = [] // 当前活跃的泳道
      let maxLanes = 0

      // 为每个 commit 分配泳道
      for (let i = 0; i < commits.length; i++) {
        const commit = commits[i]

        // 找到这个 commit 应该在的泳道 (继承父泳道或新开)
        let lane = activeLanes.findIndex(h => h === commit.hash)

        if (lane === -1) {
          // 没有预留泳道，找一个空闲的或新开一个
          lane = activeLanes.findIndex(l => l === null)
          if (lane === -1) {
            lane = activeLanes.length
            activeLanes.push(null)
          }
        }

        commit.lane = lane
        commit.color = this.getLaneColor(lane)

        // 更新最大泳道数
        maxLanes = Math.max(maxLanes, activeLanes.length)

        // 处理父节点
        const parents = commit.parentHashes
        if (parents.length === 0) {
          // 根 commit，关闭当前泳道
          activeLanes[lane] = null
        } else {
          // 第一个父节点继承当前泳道
          activeLanes[lane] = parents[0]

          // 添加到第一个父节点的连线
          const parentIndex = commits.findIndex(c => c.hash === parents[0])
          if (parentIndex > i) {
            connections.push({
              from: { row: i, lane },
              to: { row: parentIndex, lane },
              color: commit.color,
              type: 'straight'
            })
          }

          // 其他父节点 (merge)
          for (let j = 1; j < parents.length; j++) {
            const parentHash = parents[j]
            const parentIndex = commits.findIndex(c => c.hash === parentHash)

            if (parentIndex > i) {
              // 找或创建父节点的泳道
              let parentLane = activeLanes.findIndex(h => h === parentHash)
              if (parentLane === -1) {
                parentLane = activeLanes.findIndex(l => l === null)
                if (parentLane === -1) {
                  parentLane = activeLanes.length
                  activeLanes.push(parentHash)
                } else {
                  activeLanes[parentLane] = parentHash
                }
              }

              connections.push({
                from: { row: i, lane },
                to: { row: parentIndex, lane: parentLane },
                color: this.getLaneColor(parentLane),
                type: 'merge'
              })
            }
          }
        }

        // 清理不再使用的泳道
        while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
          activeLanes.pop()
        }
      }

      return { commits, connections, maxLanes }
    },

    /**
     * 加载更多 commits
     */
    async loadMore(): Promise<void> {
      if (!this.repoPath || !this.hasMore || this.isLoading) return

      await this.loadGraph(this.repoPath, {
        ...this.loadOptions,
        skip: this.commits.length
      })
    },

    /**
     * 刷新图形
     */
    async refresh(): Promise<void> {
      if (!this.repoPath) return

      this.commits = []
      this.connections = []
      await this.loadGraph(this.repoPath, {
        ...this.loadOptions,
        skip: 0
      })
    },

    /**
     * 选择 commit
     */
    async selectCommit(hash: string): Promise<void> {
      this.viewState.selectedCommit = hash

      // 加载详情
      if (this.repoPath) {
        try {
          const details = await window.electronAPI.git.getCommit(this.repoPath, hash)
          if (details) {
            this.selectedCommitDetails = {
              hash: details.hash,
              shortHash: details.shortHash,
              author: {
                name: details.author.name,
                email: details.author.email,
                date: new Date(details.author.date)
              },
              committer: {
                name: details.committer.name,
                email: details.committer.email,
                date: new Date(details.committer.date)
              },
              message: details.message,
              body: details.body,
              parents: details.parents,
              stats: details.stats
            }
          }
        } catch (error) {
          console.error('Failed to load commit details:', error)
        }
      }
    },

    /**
     * 清除选择
     */
    clearSelection(): void {
      this.viewState.selectedCommit = null
      this.selectedCommitDetails = null
    },

    /**
     * 设置搜索关键词
     */
    setSearchQuery(query: string): void {
      this.viewState.searchQuery = query
    },

    /**
     * 过滤分支
     */
    setFilteredBranches(branches: string[]): void {
      this.viewState.filteredBranches = branches
    },

    /**
     * 切换远程分支显示
     */
    toggleShowRemotes(): void {
      this.viewState.showRemotes = !this.viewState.showRemotes
    },

    /**
     * 切换 tags 显示
     */
    toggleShowTags(): void {
      this.viewState.showTags = !this.viewState.showTags
    },

    /**
     * 设置可见区域
     */
    setVisibleArea(start: number, count: number): void {
      this.viewState.visibleStart = start
      this.viewState.visibleCount = count
    },

    /**
     * 滚动到指定 commit
     */
    scrollToCommit(hash: string): void {
      const index = this.commits.findIndex(c => c.hash === hash)
      if (index >= 0) {
        const newStart = Math.max(0, index - Math.floor(this.viewState.visibleCount / 2))
        this.viewState.visibleStart = newStart
      }
    },

    /**
     * Cherry-pick commit
     */
    async cherryPick(hash: string, options?: { noCommit?: boolean }): Promise<{ success: boolean; error?: string }> {
      if (!this.repoPath) return { success: false, error: 'No repo path' }
      return await window.electronAPI.git.cherryPick(this.repoPath, hash, options)
    },

    /**
     * Revert commit
     */
    async revert(hash: string, options?: { noCommit?: boolean }): Promise<{ success: boolean; error?: string }> {
      if (!this.repoPath) return { success: false, error: 'No repo path' }
      return await window.electronAPI.git.revert(this.repoPath, hash, options)
    },

    /**
     * 创建 tag
     */
    async createTag(name: string, target?: string, message?: string): Promise<{ success: boolean; error?: string }> {
      if (!this.repoPath) return { success: false, error: 'No repo path' }
      return await window.electronAPI.git.createTag(this.repoPath, name, { target, message })
    },

    /**
     * Reset 到指定 commit
     */
    async reset(target: string, mode: 'soft' | 'mixed' | 'hard'): Promise<{ success: boolean; error?: string }> {
      if (!this.repoPath) return { success: false, error: 'No repo path' }
      return await window.electronAPI.git.reset(this.repoPath, target, mode)
    },

    /**
     * 重置状态
     */
    resetState(): void {
      this.repoPath = null
      this.commits = []
      this.connections = []
      this.branches = []
      this.remoteBranches = []
      this.tags = []
      this.currentBranch = ''
      this.headCommit = ''
      this.totalCommits = 0
      this.error = null
      this.viewState = { ...DEFAULT_VIEW_STATE }
      this.selectedCommitDetails = null
      this.maxLanes = 0
    }
  }
})
