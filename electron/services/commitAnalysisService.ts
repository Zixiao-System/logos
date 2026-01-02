/**
 * Commit Analysis Service
 * Analyzes Git commits for code review suggestions
 */

import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ==================== Types ====================

/** Diff hunk representing a contiguous block of changes */
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
  addedLines: string[]
  removedLines: string[]
}

/** A file change in a commit */
export interface FileChange {
  path: string
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  linesAdded: number
  linesRemoved: number
  hunks: DiffHunk[]
}

/** Severity levels for review suggestions */
export type SuggestionSeverity = 'error' | 'warning' | 'info'

/** Categories of review suggestions */
export type SuggestionCategory =
  | 'security'
  | 'performance'
  | 'style'
  | 'complexity'
  | 'testing'
  | 'documentation'

/** A code review suggestion */
export interface ReviewSuggestion {
  file: string
  line: number
  severity: SuggestionSeverity
  category: SuggestionCategory
  message: string
  suggestion?: string
  code?: string
}

/** Metrics about the commit */
export interface CommitMetrics {
  totalFilesChanged: number
  totalLinesAdded: number
  totalLinesRemoved: number
  largestFile: string
  largestFileChanges: number
  testFilesChanged: number
  configFilesChanged: number
}

/** Full commit analysis result */
export interface CommitAnalysis {
  commitHash: string
  commitMessage: string
  author: string
  date: string
  changedFiles: FileChange[]
  reviewSuggestions: ReviewSuggestion[]
  metrics: CommitMetrics
}

// ==================== Git Commands ====================

async function execGit(repoPath: string, args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024 // 50MB for large diffs
    })
    return stdout
  } catch (error) {
    const err = error as { stderr?: string; message: string }
    throw new Error(err.stderr || err.message)
  }
}

// ==================== Diff Parsing ====================

/**
 * Parse unified diff output into structured file changes
 */
function parseDiff(diffOutput: string): FileChange[] {
  const files: FileChange[] = []
  const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split('\n')
    if (lines.length < 2) continue

    // Parse file header
    const headerMatch = lines[0].match(/a\/(.+) b\/(.+)/)
    if (!headerMatch) continue

    const oldPath = headerMatch[1]
    const newPath = headerMatch[2]

    // Determine change type
    let changeType: FileChange['changeType'] = 'modified'
    if (fileDiff.includes('new file mode')) {
      changeType = 'added'
    } else if (fileDiff.includes('deleted file mode')) {
      changeType = 'deleted'
    } else if (oldPath !== newPath) {
      changeType = 'renamed'
    }

    // Parse hunks
    const hunks: DiffHunk[] = []
    let linesAdded = 0
    let linesRemoved = 0

    const hunkPattern = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/gm
    let hunkMatch: RegExpExecArray | null

    while ((hunkMatch = hunkPattern.exec(fileDiff)) !== null) {
      const oldStart = parseInt(hunkMatch[1], 10)
      const oldLines = parseInt(hunkMatch[2] || '1', 10)
      const newStart = parseInt(hunkMatch[3], 10)
      const newLines = parseInt(hunkMatch[4] || '1', 10)

      // Extract hunk content
      const hunkStartIndex = hunkMatch.index + hunkMatch[0].length
      const nextHunkMatch = hunkPattern.exec(fileDiff)
      const hunkEndIndex = nextHunkMatch ? nextHunkMatch.index : fileDiff.length
      hunkPattern.lastIndex = hunkMatch.index + hunkMatch[0].length // Reset for next iteration

      const hunkContent = fileDiff.slice(hunkStartIndex, hunkEndIndex)
      const hunkLines = hunkContent.split('\n')

      const addedLines: string[] = []
      const removedLines: string[] = []

      for (const line of hunkLines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          addedLines.push(line.slice(1))
          linesAdded++
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          removedLines.push(line.slice(1))
          linesRemoved++
        }
      }

      hunks.push({
        oldStart,
        oldLines,
        newStart,
        newLines,
        content: hunkContent,
        addedLines,
        removedLines
      })
    }

    files.push({
      path: newPath,
      changeType,
      oldPath: changeType === 'renamed' ? oldPath : undefined,
      linesAdded,
      linesRemoved,
      hunks
    })
  }

  return files
}

// ==================== Review Suggestions ====================

/** Security patterns to detect */
const securityPatterns: Array<{
  pattern: RegExp
  message: string
  suggestion: string
}> = [
  {
    pattern: /password\s*=\s*["'][^"']+["']/i,
    message: 'Hardcoded password detected',
    suggestion: 'Use environment variables or a secrets manager instead'
  },
  {
    pattern: /api[_-]?key\s*=\s*["'][^"']+["']/i,
    message: 'Hardcoded API key detected',
    suggestion: 'Store API keys in environment variables'
  },
  {
    pattern: /secret\s*=\s*["'][^"']+["']/i,
    message: 'Hardcoded secret detected',
    suggestion: 'Use a secure secrets management solution'
  },
  {
    pattern: /\beval\s*\(/,
    message: 'Use of eval() detected',
    suggestion: 'Avoid eval() as it can lead to code injection vulnerabilities'
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    message: 'dangerouslySetInnerHTML usage detected',
    suggestion: 'Ensure content is properly sanitized to prevent XSS attacks'
  },
  {
    pattern: /exec\s*\(\s*[`"'].*\$\{/,
    message: 'Potential command injection vulnerability',
    suggestion: 'Sanitize user input before passing to shell commands'
  }
]

/** Performance patterns to detect */
const performancePatterns: Array<{
  pattern: RegExp
  message: string
  suggestion: string
}> = [
  {
    pattern: /\.forEach\s*\([^)]*=>\s*\{[^}]*\.push\(/,
    message: 'Using forEach with push - consider using map',
    suggestion: 'Use Array.map() for better performance and cleaner code'
  },
  {
    pattern: /for\s*\([^)]+\)\s*\{[^}]*await\b/,
    message: 'Sequential async operations in a loop',
    suggestion: 'Consider using Promise.all() for parallel execution'
  },
  {
    pattern: /new\s+RegExp\s*\(/,
    message: 'RegExp created inside a function',
    suggestion: 'Move RegExp to module level to avoid recreation on each call'
  }
]

/** Style patterns to detect */
const stylePatterns: Array<{
  pattern: RegExp
  message: string
  suggestion: string
}> = [
  {
    pattern: /console\.(log|debug|info)\s*\(/,
    message: 'Console statement detected',
    suggestion: 'Remove console statements before committing'
  },
  {
    pattern: /TODO|FIXME|HACK|XXX/,
    message: 'TODO/FIXME comment detected',
    suggestion: 'Consider addressing or creating an issue for this'
  },
  {
    pattern: /^\s*\/\/\s*@ts-ignore/m,
    message: '@ts-ignore comment detected',
    suggestion: 'Try to fix the TypeScript error instead of ignoring it'
  }
]

/**
 * Generate review suggestions for file changes
 */
function generateReviewSuggestions(files: FileChange[]): ReviewSuggestion[] {
  const suggestions: ReviewSuggestion[] = []

  for (const file of files) {
    // Skip deleted files
    if (file.changeType === 'deleted') continue

    for (const hunk of file.hunks) {
      // Only check added lines
      let lineNumber = hunk.newStart

      for (const line of hunk.addedLines) {
        // Check security patterns
        for (const { pattern, message, suggestion } of securityPatterns) {
          if (pattern.test(line)) {
            suggestions.push({
              file: file.path,
              line: lineNumber,
              severity: 'error',
              category: 'security',
              message,
              suggestion,
              code: line.trim()
            })
          }
        }

        // Check performance patterns
        for (const { pattern, message, suggestion } of performancePatterns) {
          if (pattern.test(line)) {
            suggestions.push({
              file: file.path,
              line: lineNumber,
              severity: 'warning',
              category: 'performance',
              message,
              suggestion,
              code: line.trim()
            })
          }
        }

        // Check style patterns
        for (const { pattern, message, suggestion } of stylePatterns) {
          if (pattern.test(line)) {
            suggestions.push({
              file: file.path,
              line: lineNumber,
              severity: 'info',
              category: 'style',
              message,
              suggestion,
              code: line.trim()
            })
          }
        }

        lineNumber++
      }
    }

    // Check for large file changes
    const totalChanges = file.linesAdded + file.linesRemoved
    if (totalChanges > 300) {
      suggestions.push({
        file: file.path,
        line: 1,
        severity: 'warning',
        category: 'complexity',
        message: `Large change detected (${totalChanges} lines)`,
        suggestion: 'Consider breaking this into smaller, focused commits'
      })
    }

    // Check for missing tests
    const isSourceFile = /\.(ts|js|py|rs|go|java)$/.test(file.path) &&
                         !file.path.includes('test') &&
                         !file.path.includes('spec')
    if (isSourceFile && file.linesAdded > 50) {
      suggestions.push({
        file: file.path,
        line: 1,
        severity: 'info',
        category: 'testing',
        message: 'Significant code added without corresponding tests',
        suggestion: 'Consider adding unit tests for the new functionality'
      })
    }
  }

  return suggestions
}

/**
 * Calculate commit metrics
 */
function calculateMetrics(files: FileChange[]): CommitMetrics {
  let totalLinesAdded = 0
  let totalLinesRemoved = 0
  let largestFile = ''
  let largestFileChanges = 0
  let testFilesChanged = 0
  let configFilesChanged = 0

  for (const file of files) {
    totalLinesAdded += file.linesAdded
    totalLinesRemoved += file.linesRemoved

    const fileChanges = file.linesAdded + file.linesRemoved
    if (fileChanges > largestFileChanges) {
      largestFile = file.path
      largestFileChanges = fileChanges
    }

    if (file.path.includes('test') || file.path.includes('spec')) {
      testFilesChanged++
    }

    if (/\.(json|yaml|yml|toml|ini|conf|config)$/.test(file.path) ||
        file.path.includes('config')) {
      configFilesChanged++
    }
  }

  return {
    totalFilesChanged: files.length,
    totalLinesAdded,
    totalLinesRemoved,
    largestFile,
    largestFileChanges,
    testFilesChanged,
    configFilesChanged
  }
}

// ==================== Main Analysis Function ====================

/**
 * Analyze a specific commit
 */
async function analyzeCommit(repoPath: string, commitHash: string): Promise<CommitAnalysis> {
  // Get commit info
  const commitInfo = await execGit(
    repoPath,
    `show --format="%H%n%s%n%an%n%ci" --no-patch ${commitHash}`
  )
  const [fullHash, message, author, date] = commitInfo.trim().split('\n')

  // Get the diff for this commit
  const diffOutput = await execGit(
    repoPath,
    `show --format="" --patch ${commitHash}`
  )

  // Parse the diff
  const changedFiles = parseDiff(diffOutput)

  // Generate review suggestions
  const reviewSuggestions = generateReviewSuggestions(changedFiles)

  // Calculate metrics
  const metrics = calculateMetrics(changedFiles)

  return {
    commitHash: fullHash,
    commitMessage: message,
    author,
    date,
    changedFiles,
    reviewSuggestions,
    metrics
  }
}

/**
 * Analyze staged changes (before commit)
 */
async function analyzeStagedChanges(repoPath: string): Promise<CommitAnalysis> {
  // Get staged diff
  const diffOutput = await execGit(repoPath, 'diff --staged')

  if (!diffOutput.trim()) {
    return {
      commitHash: 'staged',
      commitMessage: 'Staged changes',
      author: '',
      date: new Date().toISOString(),
      changedFiles: [],
      reviewSuggestions: [],
      metrics: {
        totalFilesChanged: 0,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        largestFile: '',
        largestFileChanges: 0,
        testFilesChanged: 0,
        configFilesChanged: 0
      }
    }
  }

  // Parse the diff
  const changedFiles = parseDiff(diffOutput)

  // Generate review suggestions
  const reviewSuggestions = generateReviewSuggestions(changedFiles)

  // Calculate metrics
  const metrics = calculateMetrics(changedFiles)

  return {
    commitHash: 'staged',
    commitMessage: 'Staged changes',
    author: '',
    date: new Date().toISOString(),
    changedFiles,
    reviewSuggestions,
    metrics
  }
}

// ==================== IPC Handlers ====================

/**
 * Register commit analysis IPC handlers
 */
export function registerCommitAnalysisHandlers(): void {
  // Analyze a specific commit
  ipcMain.handle(
    'commitAnalysis:analyze',
    async (_, repoPath: string, commitHash: string): Promise<CommitAnalysis> => {
      return await analyzeCommit(repoPath, commitHash)
    }
  )

  // Analyze staged changes
  ipcMain.handle(
    'commitAnalysis:analyzeStaged',
    async (_, repoPath: string): Promise<CommitAnalysis> => {
      return await analyzeStagedChanges(repoPath)
    }
  )

  // Get diff for a specific commit
  ipcMain.handle(
    'commitAnalysis:getCommitDiff',
    async (_, repoPath: string, commitHash: string): Promise<string> => {
      return await execGit(repoPath, `show --format="" --patch ${commitHash}`)
    }
  )

  // Get file content at a specific commit
  ipcMain.handle(
    'commitAnalysis:getFileAtCommit',
    async (_, repoPath: string, commitHash: string, filePath: string): Promise<string> => {
      try {
        return await execGit(repoPath, `show ${commitHash}:${filePath}`)
      } catch {
        return ''
      }
    }
  )

  // Analyze multiple commits (for a range)
  ipcMain.handle(
    'commitAnalysis:analyzeRange',
    async (_, repoPath: string, fromHash: string, toHash: string): Promise<CommitAnalysis[]> => {
      // Get list of commits in range
      const commitList = await execGit(
        repoPath,
        `log --format="%H" ${fromHash}..${toHash}`
      )
      const hashes = commitList.trim().split('\n').filter(Boolean)

      // Analyze each commit
      const analyses: CommitAnalysis[] = []
      for (const hash of hashes) {
        try {
          const analysis = await analyzeCommit(repoPath, hash)
          analyses.push(analysis)
        } catch {
          // Skip commits that fail to analyze
        }
      }

      return analyses
    }
  )
}
