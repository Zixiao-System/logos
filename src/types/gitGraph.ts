/**
 * Git Graph 类型定义
 * 用于 Git 可视化图和交互式操作
 */

import type { CommitDetails } from './gitLens'

/** Git 引用类型 */
export type GitRefType = 'branch' | 'remote-branch' | 'tag' | 'head' | 'stash'

/** Git 引用 */
export interface GitRef {
  /** 引用名称 (如 main, origin/main, v1.0.0) */
  name: string
  /** 引用类型 */
  type: GitRefType
  /** 指向的 commit hash */
  commitHash: string
  /** 是否为当前 HEAD */
  isHead?: boolean
  /** 上游分支名 (仅本地分支) */
  upstream?: string
  /** 领先上游的 commit 数 */
  ahead?: number
  /** 落后上游的 commit 数 */
  behind?: number
}

/** Graph 中的 Commit (扩展自 CommitDetails) */
export interface GraphCommit extends CommitDetails {
  /** 分配的泳道编号 */
  lane: number
  /** 泳道颜色 */
  color: string
  /** 在图中的行号 */
  row: number
  /** 父 commit hashes */
  parentHashes: string[]
  /** 子 commit hashes */
  childHashes: string[]
  /** 关联的分支名列表 */
  branches: string[]
  /** 关联的 tag 列表 */
  tags: string[]
  /** 是否为当前 HEAD */
  isHead: boolean
  /** 是否为合并提交 (有多个父节点) */
  isMerge: boolean
}

/** 图形连线 */
export interface GraphConnection {
  /** 起点 */
  from: {
    row: number
    lane: number
  }
  /** 终点 */
  to: {
    row: number
    lane: number
  }
  /** 连线颜色 */
  color: string
  /** 连线类型 */
  type: 'straight' | 'merge' | 'branch'
}

/** Graph 数据 */
export interface GitGraphData {
  /** Commit 列表 (按时间排序) */
  commits: GraphCommit[]
  /** 连线列表 */
  connections: GraphConnection[]
  /** 所有分支 */
  branches: GitRef[]
  /** 所有远程分支 */
  remoteBranches: GitRef[]
  /** 所有 tag */
  tags: GitRef[]
  /** 当前分支名 */
  currentBranch: string
  /** HEAD 指向的 commit */
  headCommit: string
  /** 总 commit 数 (用于分页) */
  totalCommits: number
}

/** Graph 加载选项 */
export interface GitGraphOptions {
  /** 最大加载数量 */
  limit?: number
  /** 跳过数量 (分页用) */
  skip?: number
  /** 要包含的分支 (空表示所有) */
  branches?: string[]
  /** 是否包含远程分支 */
  includeRemotes?: boolean
  /** 搜索关键词 */
  search?: string
  /** 作者过滤 */
  author?: string
  /** 开始日期 */
  since?: Date
  /** 结束日期 */
  until?: Date
  /** 路径过滤 (只显示修改过该路径的 commit) */
  path?: string
}

/** 泳道颜色配置 */
export const LANE_COLORS = [
  '#e91e63', // Pink
  '#2196f3', // Blue
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
  '#ff5722', // Deep Orange
  '#795548', // Brown
  '#607d8b', // Blue Grey
  '#f44336', // Red
  '#3f51b5', // Indigo
  '#009688', // Teal
]

/** 获取泳道颜色 */
export function getLaneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length]
}

/** Cherry-pick 选项 */
export interface CherryPickOptions {
  /** 是否自动提交 (默认 true) */
  commit?: boolean
  /** 是否启用 -x 选项 (在消息中记录来源) */
  recordOrigin?: boolean
  /** 合并策略 */
  strategy?: 'recursive' | 'resolve' | 'ours' | 'theirs'
}

/** Revert 选项 */
export interface RevertOptions {
  /** 是否自动提交 (默认 true) */
  commit?: boolean
  /** 父节点编号 (用于 revert merge commit, 从 1 开始) */
  parentNumber?: number
}

/** Tag 创建选项 */
export interface CreateTagOptions {
  /** Tag 名称 */
  name: string
  /** 目标 commit (默认 HEAD) */
  target?: string
  /** Tag 消息 (annotated tag) */
  message?: string
  /** 是否签名 */
  sign?: boolean
}

/** 分支操作选项 */
export interface BranchOptions {
  /** 强制删除 */
  force?: boolean
  /** 上游分支 */
  upstream?: string
}

/** Merge 选项 */
export interface MergeOptions {
  /** 合并消息 */
  message?: string
  /** 是否创建 merge commit (即使可以 fast-forward) */
  noFastForward?: boolean
  /** 只进行 fast-forward */
  fastForwardOnly?: boolean
  /** 合并策略 */
  strategy?: 'recursive' | 'resolve' | 'ours' | 'theirs'
  /** 是否 squash */
  squash?: boolean
}

/** Rebase 选项 */
export interface RebaseOptions {
  /** 目标分支/commit */
  onto: string
  /** 是否交互式 */
  interactive?: boolean
  /** 是否保留 merge commits */
  preserveMerges?: boolean
}

/** Graph 视图状态 */
export interface GitGraphViewState {
  /** 可见区域起始行 */
  visibleStart: number
  /** 可见区域行数 */
  visibleCount: number
  /** 选中的 commit hash */
  selectedCommit: string | null
  /** 展开的 commit hash 列表 (显示详情) */
  expandedCommits: string[]
  /** 搜索关键词 */
  searchQuery: string
  /** 过滤的分支 */
  filteredBranches: string[]
  /** 是否显示远程分支 */
  showRemotes: boolean
  /** 是否显示 tags */
  showTags: boolean
}

/** Commit 上下文菜单操作 */
export type CommitAction =
  | 'checkout'
  | 'cherryPick'
  | 'revert'
  | 'createTag'
  | 'createBranch'
  | 'copyHash'
  | 'copyMessage'
  | 'viewDiff'
  | 'viewFiles'
  | 'resetHard'
  | 'resetSoft'
  | 'resetMixed'

/** 分支上下文菜单操作 */
export type BranchAction =
  | 'checkout'
  | 'merge'
  | 'rebase'
  | 'delete'
  | 'rename'
  | 'setUpstream'
  | 'push'
  | 'pull'
  | 'copyName'
