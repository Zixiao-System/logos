/**
 * GitLens 类型定义
 * 用于 inline blame、文件历史等功能
 */

/** Blame 信息 - 单行的 blame 数据 */
export interface BlameInfo {
  /** 完整 commit hash */
  commitHash: string
  /** 短 hash (7位) */
  shortHash: string
  /** 作者名称 */
  author: string
  /** 作者邮箱 */
  authorEmail: string
  /** 作者提交时间 */
  authorTime: Date
  /** 提交摘要 (首行) */
  summary: string
  /** 行号 (1-based) */
  lineNumber: number
  /** 行内容 */
  lineContent: string
  /** 是否为未提交的更改 */
  isUncommitted?: boolean
}

/** Commit 详情 */
export interface CommitDetails {
  /** 完整 commit hash */
  hash: string
  /** 短 hash (7位) */
  shortHash: string
  /** 作者信息 */
  author: {
    name: string
    email: string
    date: Date
  }
  /** 提交者信息 */
  committer: {
    name: string
    email: string
    date: Date
  }
  /** 提交消息首行 */
  message: string
  /** 提交消息正文 */
  body?: string
  /** 父 commit hash 列表 */
  parents: string[]
  /** 统计信息 */
  stats: {
    additions: number
    deletions: number
    filesChanged: number
  }
  /** 变更的文件列表 */
  files?: CommitFileChange[]
}

/** Commit 中的文件变更 */
export interface CommitFileChange {
  /** 文件路径 */
  path: string
  /** 旧路径 (重命名时使用) */
  oldPath?: string
  /** 变更状态 */
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
  /** 新增行数 */
  additions: number
  /** 删除行数 */
  deletions: number
}

/** 文件历史选项 */
export interface FileHistoryOptions {
  /** 最大数量 */
  limit?: number
  /** 跳过数量 (用于分页) */
  skip?: number
  /** 是否跟随重命名 */
  follow?: boolean
}

/** 行历史信息 */
export interface LineHistory {
  /** commit hash */
  hash: string
  /** 短 hash */
  shortHash: string
  /** 作者 */
  author: string
  /** 作者邮箱 */
  authorEmail: string
  /** 提交时间 */
  date: Date
  /** 提交消息 */
  message: string
  /** 行内容 (在该 commit 时的内容) */
  lineContent: string
  /** 行号 (在该 commit 时的行号) */
  lineNumber: number
}

/** Blame 缓存条目 */
export interface BlameCacheEntry {
  /** 文件路径 */
  filePath: string
  /** Blame 数据 */
  blameData: BlameInfo[]
  /** 缓存时间 */
  cachedAt: number
  /** 文件内容 hash (用于失效检测) */
  contentHash?: string
}

/** Diff 比较选项 */
export interface DiffOptions {
  /** 是否忽略空白变化 */
  ignoreWhitespace?: boolean
  /** 上下文行数 */
  contextLines?: number
}

/** Diff Hunk */
export interface DiffHunk {
  /** 旧文件起始行 */
  oldStart: number
  /** 旧文件行数 */
  oldLines: number
  /** 新文件起始行 */
  newStart: number
  /** 新文件行数 */
  newLines: number
  /** Hunk 头部 (如 @@ -1,5 +1,6 @@) */
  header: string
  /** Hunk 内容行 */
  lines: DiffLine[]
}

/** Diff 行 */
export interface DiffLine {
  /** 行类型 */
  type: 'context' | 'addition' | 'deletion'
  /** 行内容 */
  content: string
  /** 旧文件行号 (删除/上下文行) */
  oldLineNumber?: number
  /** 新文件行号 (新增/上下文行) */
  newLineNumber?: number
}

/** 两个 commit 之间的 diff 结果 */
export interface CommitDiff {
  /** 基准 commit */
  fromCommit: string
  /** 目标 commit */
  toCommit: string
  /** 文件差异列表 */
  files: FileDiff[]
}

/** 文件 diff */
export interface FileDiff {
  /** 文件路径 */
  path: string
  /** 旧路径 */
  oldPath?: string
  /** 文件状态 */
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  /** 是否为二进制文件 */
  isBinary: boolean
  /** Diff hunks */
  hunks: DiffHunk[]
  /** 新增行数 */
  additions: number
  /** 删除行数 */
  deletions: number
}
