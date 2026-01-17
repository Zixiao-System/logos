/**
 * Git 服务
 * 在 Electron 主进程中处理 Git 操作
 */

import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/** Git 文件状态 */
export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied'

/** Git 变更文件 */
export interface GitFile {
  path: string
  status: GitFileStatus
  staged: boolean
  oldPath?: string
}

/** Git 分支 */
export interface GitBranch {
  name: string
  current: boolean
  remote?: string
  upstream?: string
  ahead?: number
  behind?: number
}

/** Git 提交 */
export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  authorEmail: string
  date: string
}

/** Git 状态 */
export interface GitStatus {
  branch: string
  staged: GitFile[]
  unstaged: GitFile[]
  hasChanges: boolean
  hasUnpushed: boolean
  remote?: {
    ahead: number
    behind: number
  }
}

/**
 * 执行 Git 命令
 */
async function execGit(repoPath: string, args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB
    })
    return stdout
  } catch (error) {
    const err = error as { stderr?: string; message: string }
    throw new Error(err.stderr || err.message)
  }
}

/**
 * 解析 git status --porcelain=v1 输出
 */
function parseGitStatus(output: string): { staged: GitFile[]; unstaged: GitFile[] } {
  const staged: GitFile[] = []
  const unstaged: GitFile[] = []

  const lines = output.trim().split('\n').filter(Boolean)

  for (const line of lines) {
    if (line.length < 3) continue

    const x = line[0] // 暂存区状态
    const y = line[1] // 工作区状态
    let filePath = line.slice(3)
    let oldPath: string | undefined

    // 处理重命名
    if (filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ')
      oldPath = parts[0]
      filePath = parts[1]
    }

    // 解析状态字符
    const parseStatus = (char: string): GitFileStatus => {
      switch (char) {
        case 'M': return 'modified'
        case 'A': return 'added'
        case 'D': return 'deleted'
        case 'R': return 'renamed'
        case 'C': return 'copied'
        case '?': return 'untracked'
        default: return 'modified'
      }
    }

    // 暂存区有变更
    if (x !== ' ' && x !== '?') {
      staged.push({
        path: filePath,
        status: parseStatus(x),
        staged: true,
        oldPath
      })
    }

    // 工作区有变更或未跟踪文件
    if (y !== ' ' || x === '?') {
      unstaged.push({
        path: filePath,
        status: parseStatus(y === ' ' ? x : y),
        staged: false,
        oldPath
      })
    }
  }

  return { staged, unstaged }
}

/**
 * 解析分支列表
 */
function parseBranches(output: string, currentBranch: string): GitBranch[] {
  const branches: GitBranch[] = []
  const lines = output.trim().split('\n').filter(Boolean)

  for (const line of lines) {
    const isCurrent = line.startsWith('*')
    const name = line.replace(/^\*?\s+/, '').trim()

    // 跳过 HEAD detached 状态
    if (name.startsWith('(HEAD')) continue

    branches.push({
      name,
      current: isCurrent || name === currentBranch
    })
  }

  return branches
}

/**
 * 解析提交日志
 */
function parseLog(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  const entries = output.trim().split('\n\n').filter(Boolean)

  for (const entry of entries) {
    const [hash, shortHash, author, authorEmail, date, ...messageParts] = entry.split('\n')
    commits.push({
      hash,
      shortHash,
      author,
      authorEmail,
      date,
      message: messageParts.join('\n')
    })
  }

  return commits
}

/**
 * 注册 Git IPC 处理程序
 */
export function registerGitHandlers(): void {
  // 检查是否是 Git 仓库
  ipcMain.handle('git:isRepo', async (_, repoPath: string): Promise<boolean> => {
    try {
      await execGit(repoPath, 'rev-parse --git-dir')
      return true
    } catch {
      return false
    }
  })

  // 获取 Git 状态
  ipcMain.handle('git:status', async (_, repoPath: string): Promise<GitStatus> => {
    // 获取当前分支
    let branch = 'HEAD'
    try {
      branch = (await execGit(repoPath, 'branch --show-current')).trim() || 'HEAD'
    } catch {
      // detached HEAD
    }

    // 获取文件状态
    const statusOutput = await execGit(repoPath, 'status --porcelain=v1')
    const { staged, unstaged } = parseGitStatus(statusOutput)

    // 获取远程状态
    let remote: { ahead: number; behind: number } | undefined
    let hasUnpushed = false

    try {
      const aheadBehind = await execGit(repoPath, 'rev-list --left-right --count HEAD...@{u}')
      const [ahead, behind] = aheadBehind.trim().split(/\s+/).map(Number)
      remote = { ahead, behind }
      hasUnpushed = ahead > 0
    } catch {
      // 没有上游分支
    }

    return {
      branch,
      staged,
      unstaged,
      hasChanges: staged.length > 0 || unstaged.length > 0,
      hasUnpushed,
      remote
    }
  })

  // 暂存文件
  ipcMain.handle('git:stage', async (_, repoPath: string, filePath: string) => {
    await execGit(repoPath, `add "${filePath}"`)
  })

  // 取消暂存文件
  ipcMain.handle('git:unstage', async (_, repoPath: string, filePath: string) => {
    await execGit(repoPath, `reset HEAD "${filePath}"`)
  })

  // 暂存所有文件
  ipcMain.handle('git:stageAll', async (_, repoPath: string) => {
    await execGit(repoPath, 'add -A')
  })

  // 取消暂存所有文件
  ipcMain.handle('git:unstageAll', async (_, repoPath: string) => {
    await execGit(repoPath, 'reset HEAD')
  })

  // 提交
  ipcMain.handle('git:commit', async (_, repoPath: string, message: string) => {
    // 转义反斜杠和引号，防止破坏 shell 字符串
    const escapedMessage = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execGit(repoPath, `commit -m "${escapedMessage}"`)
  })

  // 放弃更改
  ipcMain.handle('git:discard', async (_, repoPath: string, filePath: string) => {
    await execGit(repoPath, `checkout -- "${filePath}"`)
  })

  // 放弃所有更改
  ipcMain.handle('git:discardAll', async (_, repoPath: string) => {
    await execGit(repoPath, 'checkout -- .')
  })

  // 获取分支列表
  ipcMain.handle('git:branches', async (_, repoPath: string): Promise<GitBranch[]> => {
    const currentBranch = (await execGit(repoPath, 'branch --show-current')).trim()
    const output = await execGit(repoPath, 'branch -a')
    return parseBranches(output, currentBranch)
  })

  // 切换分支
  ipcMain.handle('git:checkout', async (_, repoPath: string, branchName: string) => {
    await execGit(repoPath, `checkout "${branchName}"`)
  })

  // 创建分支
  ipcMain.handle('git:createBranch', async (_, repoPath: string, branchName: string, checkout: boolean = true) => {
    if (checkout) {
      await execGit(repoPath, `checkout -b "${branchName}"`)
    } else {
      await execGit(repoPath, `branch "${branchName}"`)
    }
  })

  // 删除分支
  ipcMain.handle('git:deleteBranch', async (_, repoPath: string, branchName: string, force: boolean = false) => {
    const flag = force ? '-D' : '-d'
    await execGit(repoPath, `branch ${flag} "${branchName}"`)
  })

  // 获取文件差异
  ipcMain.handle('git:diff', async (_, repoPath: string, filePath: string, staged: boolean): Promise<string> => {
    const stagedFlag = staged ? '--staged' : ''
    return await execGit(repoPath, `diff ${stagedFlag} "${filePath}"`)
  })

  // 获取文件内容 (某个提交版本)
  ipcMain.handle('git:showFile', async (_, repoPath: string, filePath: string, ref: string = 'HEAD'): Promise<string> => {
    return await execGit(repoPath, `show "${ref}:${filePath}"`)
  })

  // 获取提交历史
  ipcMain.handle('git:log', async (_, repoPath: string, limit: number = 50): Promise<GitCommit[]> => {
    const format = '%H%n%h%n%an%n%ae%n%ci%n%s'
    const output = await execGit(repoPath, `log --format="${format}" -n ${limit}`)
    return parseLog(output)
  })

  // 获取文件的提交历史
  ipcMain.handle('git:logFile', async (_, repoPath: string, filePath: string, limit: number = 20): Promise<GitCommit[]> => {
    const format = '%H%n%h%n%an%n%ae%n%ci%n%s'
    const output = await execGit(repoPath, `log --format="${format}" -n ${limit} --follow -- "${filePath}"`)
    return parseLog(output)
  })

  // 推送
  ipcMain.handle('git:push', async (_, repoPath: string, remote: string = 'origin', branch?: string) => {
    const branchArg = branch ? ` "${branch}"` : ''
    await execGit(repoPath, `push "${remote}"${branchArg}`)
  })

  // 拉取
  ipcMain.handle('git:pull', async (_, repoPath: string, remote: string = 'origin', branch?: string) => {
    const branchArg = branch ? ` "${branch}"` : ''
    await execGit(repoPath, `pull "${remote}"${branchArg}`)
  })

  // 获取远程仓库列表
  ipcMain.handle('git:remotes', async (_, repoPath: string): Promise<string[]> => {
    const output = await execGit(repoPath, 'remote')
    return output.trim().split('\n').filter(Boolean)
  })

  // 初始化仓库
  ipcMain.handle('git:init', async (_, repoPath: string) => {
    await execGit(repoPath, 'init')
  })

  // 克隆仓库
  ipcMain.handle('git:clone', async (_, url: string, targetPath: string) => {
    await execAsync(`git clone "${url}" "${targetPath}"`)
  })

  // 获取当前用户配置
  ipcMain.handle('git:getConfig', async (_, repoPath: string, key: string): Promise<string | null> => {
    try {
      const output = await execGit(repoPath, `config --get ${key}`)
      return output.trim()
    } catch {
      return null
    }
  })

  // 设置配置
  ipcMain.handle('git:setConfig', async (_, repoPath: string, key: string, value: string) => {
    await execGit(repoPath, `config ${key} "${value}"`)
  })

  // 获取 blame 信息
  ipcMain.handle('git:blame', async (_, repoPath: string, filePath: string): Promise<string> => {
    return await execGit(repoPath, `blame "${filePath}"`)
  })

  // Stash 操作
  ipcMain.handle('git:stash', async (_, repoPath: string, message?: string) => {
    const msgArg = message ? ` -m "${message}"` : ''
    await execGit(repoPath, `stash${msgArg}`)
  })

  ipcMain.handle('git:stashPop', async (_, repoPath: string) => {
    await execGit(repoPath, 'stash pop')
  })

  ipcMain.handle('git:stashList', async (_, repoPath: string): Promise<string[]> => {
    const output = await execGit(repoPath, 'stash list')
    return output.trim().split('\n').filter(Boolean)
  })

  // ============ GitLens 扩展功能 ============

  // 获取结构化 blame 信息 (使用 --porcelain 格式)
  ipcMain.handle('git:blameStructured', async (_, repoPath: string, filePath: string): Promise<BlameInfoResult[]> => {
    try {
      const output = await execGit(repoPath, `blame --porcelain "${filePath}"`)
      return parseBlamePortcelain(output)
    } catch (error) {
      // 文件可能未被跟踪
      return []
    }
  })

  // 获取完整 commit 详情
  ipcMain.handle('git:getCommit', async (_, repoPath: string, hash: string): Promise<CommitDetailsResult | null> => {
    try {
      // 使用自定义格式获取 commit 详情
      const format = '%H%n%h%n%an%n%ae%n%ai%n%cn%n%ce%n%ci%n%P%n%s%n%b%x00'
      const output = await execGit(repoPath, `show --format="${format}" --stat --stat-width=1000 "${hash}"`)
      return parseCommitDetails(output)
    } catch {
      return null
    }
  })

  // 获取文件历史 (支持 --follow 跟踪重命名)
  ipcMain.handle('git:getFileHistory', async (
    _,
    repoPath: string,
    filePath: string,
    options?: { limit?: number; skip?: number; follow?: boolean }
  ): Promise<GitCommit[]> => {
    const limit = options?.limit || 50
    const skip = options?.skip || 0
    const followFlag = options?.follow !== false ? '--follow' : ''
    const format = '%H%n%h%n%an%n%ae%n%ci%n%s'
    const output = await execGit(repoPath, `log --format="${format}" -n ${limit} --skip=${skip} ${followFlag} -- "${filePath}"`)
    return parseLog(output)
  })

  // 获取行历史 (git log -L)
  ipcMain.handle('git:getLineHistory', async (
    _,
    repoPath: string,
    filePath: string,
    startLine: number,
    endLine: number,
    options?: { limit?: number }
  ): Promise<LineHistoryResult[]> => {
    try {
      const limit = options?.limit || 20
      const output = await execGit(repoPath, `log -L ${startLine},${endLine}:"${filePath}" -n ${limit} --no-patch --format="%H%n%h%n%an%n%ae%n%ci%n%s%x00"`)
      return parseLineHistory(output)
    } catch {
      return []
    }
  })

  // 获取指定 commit 的文件内容
  ipcMain.handle('git:getFileAtCommit', async (_, repoPath: string, filePath: string, commitHash: string): Promise<string> => {
    return await execGit(repoPath, `show "${commitHash}:${filePath}"`)
  })

  // 比较两个 commit
  ipcMain.handle('git:diffCommits', async (
    _,
    repoPath: string,
    fromCommit: string,
    toCommit: string,
    options?: { path?: string }
  ): Promise<string> => {
    const pathArg = options?.path ? `-- "${options.path}"` : ''
    return await execGit(repoPath, `diff "${fromCommit}" "${toCommit}" ${pathArg}`)
  })

  // ============ Git Graph 扩展功能 ============

  // 获取 Graph 数据
  ipcMain.handle('git:getGraph', async (
    _,
    repoPath: string,
    options?: GraphOptions
  ): Promise<GraphDataResult> => {
    const limit = options?.limit || 500
    const skip = options?.skip || 0
    const branchFilter = options?.branches?.length ? options.branches.map(b => `"${b}"`).join(' ') : '--all'
    const authorFilter = options?.author ? `--author="${options.author}"` : ''
    const sinceFilter = options?.since ? `--since="${options.since.toISOString()}"` : ''
    const untilFilter = options?.until ? `--until="${options.until.toISOString()}"` : ''
    const pathFilter = options?.path ? `-- "${options.path}"` : ''
    const searchFilter = options?.search ? `--grep="${options.search}"` : ''

    // 获取 commits 和 refs
    const format = '%H|%P|%an|%ae|%ai|%cn|%ce|%ci|%s|%D'
    const logArgs = [
      `log`,
      `--format="${format}"`,
      `-n ${limit}`,
      `--skip=${skip}`,
      branchFilter,
      authorFilter,
      sinceFilter,
      untilFilter,
      searchFilter,
      pathFilter
    ].filter(Boolean).join(' ')

    const [logOutput, branchOutput, tagOutput, headOutput] = await Promise.all([
      execGit(repoPath, logArgs),
      execGit(repoPath, 'branch -a --format="%(refname:short)|%(objectname)|%(upstream:short)|%(upstream:trackshort)"'),
      execGit(repoPath, 'tag --format="%(refname:short)|%(objectname)"'),
      execGit(repoPath, 'rev-parse HEAD').catch(() => '')
    ])

    // 获取当前分支
    const currentBranch = await execGit(repoPath, 'branch --show-current').then(s => s.trim()).catch(() => '')

    return parseGraphData(logOutput, branchOutput, tagOutput, headOutput.trim(), currentBranch)
  })

  // 获取所有 refs
  ipcMain.handle('git:getRefs', async (_, repoPath: string): Promise<GitRefResult[]> => {
    const [branchOutput, tagOutput, headOutput] = await Promise.all([
      execGit(repoPath, 'branch -a --format="%(refname:short)|%(objectname)|%(upstream:short)|%(upstream:trackshort)"'),
      execGit(repoPath, 'tag --format="%(refname:short)|%(objectname)"'),
      execGit(repoPath, 'rev-parse HEAD').catch(() => '')
    ])

    const currentBranch = await execGit(repoPath, 'branch --show-current').then(s => s.trim()).catch(() => '')

    return parseRefs(branchOutput, tagOutput, headOutput.trim(), currentBranch)
  })

  // 获取所有 tags
  ipcMain.handle('git:getTags', async (_, repoPath: string): Promise<GitTagResult[]> => {
    const output = await execGit(repoPath, 'tag --format="%(refname:short)|%(objectname)|%(creatordate:iso)|%(subject)" --sort=-creatordate')
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [name, hash, date, message] = line.split('|')
      return { name, hash, date, message: message || '' }
    })
  })

  // Cherry-pick commit
  ipcMain.handle('git:cherryPick', async (
    _,
    repoPath: string,
    commitHash: string,
    options?: { noCommit?: boolean; recordOrigin?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const noCommitFlag = options?.noCommit ? '-n' : ''
      const originFlag = options?.recordOrigin ? '-x' : ''
      await execGit(repoPath, `cherry-pick ${noCommitFlag} ${originFlag} "${commitHash}"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Revert commit
  ipcMain.handle('git:revert', async (
    _,
    repoPath: string,
    commitHash: string,
    options?: { noCommit?: boolean; parentNumber?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const noCommitFlag = options?.noCommit ? '-n' : ''
      const parentFlag = options?.parentNumber ? `-m ${options.parentNumber}` : ''
      await execGit(repoPath, `revert ${noCommitFlag} ${parentFlag} "${commitHash}"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 创建 tag
  ipcMain.handle('git:createTag', async (
    _,
    repoPath: string,
    name: string,
    options?: { target?: string; message?: string; sign?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const target = options?.target || 'HEAD'
      if (options?.message) {
        const signFlag = options?.sign ? '-s' : '-a'
        await execGit(repoPath, `tag ${signFlag} -m "${options.message}" "${name}" "${target}"`)
      } else {
        await execGit(repoPath, `tag "${name}" "${target}"`)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 删除 tag
  ipcMain.handle('git:deleteTag', async (_, repoPath: string, name: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await execGit(repoPath, `tag -d "${name}"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Reset 操作
  ipcMain.handle('git:reset', async (
    _,
    repoPath: string,
    target: string,
    mode: 'soft' | 'mixed' | 'hard'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await execGit(repoPath, `reset --${mode} "${target}"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Merge 操作
  ipcMain.handle('git:merge', async (
    _,
    repoPath: string,
    branch: string,
    options?: { message?: string; noFastForward?: boolean; squash?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const noFFFlag = options?.noFastForward ? '--no-ff' : ''
      const squashFlag = options?.squash ? '--squash' : ''
      const messageFlag = options?.message ? `-m "${options.message}"` : ''
      await execGit(repoPath, `merge ${noFFFlag} ${squashFlag} ${messageFlag} "${branch}"`)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取 commit 的变更文件列表
  ipcMain.handle('git:getCommitFiles', async (_, repoPath: string, commitHash: string): Promise<CommitFileResult[]> => {
    const output = await execGit(repoPath, `diff-tree --no-commit-id --name-status -r "${commitHash}"`)
    return output.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split('\t')
      const status = parts[0]
      let path = parts[1]
      let oldPath: string | undefined

      // 处理重命名
      if (status.startsWith('R')) {
        oldPath = parts[1]
        path = parts[2]
      }

      return {
        path,
        oldPath,
        status: parseFileStatus(status)
      }
    })
  })

  // 获取提交统计
  ipcMain.handle('git:getCommitStats', async (_, repoPath: string, commitHash: string): Promise<{ additions: number; deletions: number; filesChanged: number }> => {
    const output = await execGit(repoPath, `diff-tree --no-commit-id --stat --stat-width=1000 -r "${commitHash}"`)
    const lines = output.trim().split('\n')
    const lastLine = lines[lines.length - 1] || ''

    // 解析统计行: "3 files changed, 10 insertions(+), 5 deletions(-)"
    const match = lastLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/)
    if (match) {
      return {
        filesChanged: parseInt(match[1]) || 0,
        additions: parseInt(match[2]) || 0,
        deletions: parseInt(match[3]) || 0
      }
    }
    return { additions: 0, deletions: 0, filesChanged: 0 }
  })
}

// ============ 辅助类型 ============

interface BlameInfoResult {
  commitHash: string
  shortHash: string
  author: string
  authorEmail: string
  authorTime: string
  summary: string
  lineNumber: number
  lineContent: string
  isUncommitted: boolean
}

interface CommitDetailsResult {
  hash: string
  shortHash: string
  author: { name: string; email: string; date: string }
  committer: { name: string; email: string; date: string }
  message: string
  body: string
  parents: string[]
  stats: { additions: number; deletions: number; filesChanged: number }
}

interface LineHistoryResult {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: string
  message: string
}

interface GraphOptions {
  limit?: number
  skip?: number
  branches?: string[]
  includeRemotes?: boolean
  search?: string
  author?: string
  since?: Date
  until?: Date
  path?: string
}

interface GraphDataResult {
  commits: Array<{
    hash: string
    shortHash: string
    parents: string[]
    author: { name: string; email: string; date: string }
    committer: { name: string; email: string; date: string }
    message: string
    refs: string[]
  }>
  branches: GitRefResult[]
  tags: GitTagResult[]
  currentBranch: string
  headCommit: string
}

interface GitRefResult {
  name: string
  type: 'branch' | 'remote-branch' | 'tag' | 'head'
  commitHash: string
  isHead?: boolean
  upstream?: string
  ahead?: number
  behind?: number
}

interface GitTagResult {
  name: string
  hash: string
  date?: string
  message?: string
}

interface CommitFileResult {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
}

// ============ 解析函数 ============

function parseBlamePortcelain(output: string): BlameInfoResult[] {
  const results: BlameInfoResult[] = []
  const lines = output.split('\n')
  let i = 0

  while (i < lines.length) {
    const headerLine = lines[i]
    if (!headerLine) {
      i++
      continue
    }

    // 头部行: <sha1> <original-line> <final-line> [<num-lines>]
    const headerMatch = headerLine.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/)
    if (!headerMatch) {
      i++
      continue
    }

    const commitHash = headerMatch[1]
    const lineNumber = parseInt(headerMatch[3])
    const isUncommitted = commitHash === '0000000000000000000000000000000000000000'

    // 读取元数据行
    let author = ''
    let authorEmail = ''
    let authorTime = ''
    let summary = ''

    i++
    while (i < lines.length && !lines[i].startsWith('\t')) {
      const line = lines[i]
      if (line.startsWith('author ')) {
        author = line.substring(7)
      } else if (line.startsWith('author-mail ')) {
        authorEmail = line.substring(12).replace(/[<>]/g, '')
      } else if (line.startsWith('author-time ')) {
        const timestamp = parseInt(line.substring(12))
        authorTime = new Date(timestamp * 1000).toISOString()
      } else if (line.startsWith('summary ')) {
        summary = line.substring(8)
      }
      i++
    }

    // 读取行内容
    let lineContent = ''
    if (i < lines.length && lines[i].startsWith('\t')) {
      lineContent = lines[i].substring(1)
      i++
    }

    results.push({
      commitHash,
      shortHash: commitHash.substring(0, 7),
      author,
      authorEmail,
      authorTime,
      summary,
      lineNumber,
      lineContent,
      isUncommitted
    })
  }

  return results
}

function parseCommitDetails(output: string): CommitDetailsResult {
  const parts = output.split('\x00')
  const metaLines = parts[0].split('\n')

  const hash = metaLines[0]
  const shortHash = metaLines[1]
  const authorName = metaLines[2]
  const authorEmail = metaLines[3]
  const authorDate = metaLines[4]
  const committerName = metaLines[5]
  const committerEmail = metaLines[6]
  const committerDate = metaLines[7]
  const parents = metaLines[8].split(' ').filter(Boolean)
  const message = metaLines[9]
  const body = metaLines.slice(10).join('\n').trim()

  // 解析 stat 输出
  const statPart = parts[1] || ''
  const statMatch = statPart.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/)
  const stats = statMatch ? {
    filesChanged: parseInt(statMatch[1]) || 0,
    additions: parseInt(statMatch[2]) || 0,
    deletions: parseInt(statMatch[3]) || 0
  } : { additions: 0, deletions: 0, filesChanged: 0 }

  return {
    hash,
    shortHash,
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: { name: committerName, email: committerEmail, date: committerDate },
    message,
    body,
    parents,
    stats
  }
}

function parseLineHistory(output: string): LineHistoryResult[] {
  const entries = output.split('\x00').filter(Boolean)
  return entries.map(entry => {
    const lines = entry.trim().split('\n')
    return {
      hash: lines[0] || '',
      shortHash: lines[1] || '',
      author: lines[2] || '',
      authorEmail: lines[3] || '',
      date: lines[4] || '',
      message: lines[5] || ''
    }
  })
}

function parseGraphData(
  logOutput: string,
  branchOutput: string,
  tagOutput: string,
  headHash: string,
  currentBranch: string
): GraphDataResult {
  // 解析 commits
  const commits = logOutput.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.split('|')
    return {
      hash: parts[0],
      shortHash: parts[0].substring(0, 7),
      parents: (parts[1] || '').split(' ').filter(Boolean),
      author: { name: parts[2], email: parts[3], date: parts[4] },
      committer: { name: parts[5], email: parts[6], date: parts[7] },
      message: parts[8],
      refs: (parts[9] || '').split(', ').filter(Boolean)
    }
  })

  // 解析 refs
  const refs = parseRefs(branchOutput, tagOutput, headHash, currentBranch)
  const branches = refs.filter(r => r.type === 'branch' || r.type === 'remote-branch')
  const tags = refs.filter(r => r.type === 'tag').map(t => ({
    name: t.name,
    hash: t.commitHash
  }))

  return {
    commits,
    branches,
    tags,
    currentBranch,
    headCommit: headHash
  }
}

function parseRefs(
  branchOutput: string,
  tagOutput: string,
  headHash: string,
  currentBranch: string
): GitRefResult[] {
  const refs: GitRefResult[] = []

  // 解析分支
  branchOutput.trim().split('\n').filter(Boolean).forEach(line => {
    const [name, hash, upstream, trackShort] = line.split('|')
    const isRemote = name.startsWith('remotes/') || name.includes('/')

    // 解析 ahead/behind
    let ahead: number | undefined
    let behind: number | undefined
    if (trackShort) {
      const aheadMatch = trackShort.match(/>(\d+)/)
      const behindMatch = trackShort.match(/<(\d+)/)
      if (aheadMatch) ahead = parseInt(aheadMatch[1])
      if (behindMatch) behind = parseInt(behindMatch[1])
    }

    refs.push({
      name: name.replace('remotes/', ''),
      type: isRemote ? 'remote-branch' : 'branch',
      commitHash: hash,
      isHead: name === currentBranch,
      upstream: upstream || undefined,
      ahead,
      behind
    })
  })

  // 解析 tags
  tagOutput.trim().split('\n').filter(Boolean).forEach(line => {
    const [name, hash] = line.split('|')
    refs.push({
      name,
      type: 'tag',
      commitHash: hash
    })
  })

  // 添加 HEAD 引用
  if (headHash) {
    refs.push({
      name: 'HEAD',
      type: 'head',
      commitHash: headHash,
      isHead: true
    })
  }

  return refs
}

function parseFileStatus(status: string): 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' {
  switch (status[0]) {
    case 'A': return 'added'
    case 'M': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    default: return 'modified'
  }
}
