/**
 * Commit Analysis Types
 * Types for the commit analysis feature
 */

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

/** Category icon and color mapping */
export const categoryConfig: Record<SuggestionCategory, { icon: string; color: string; label: string }> = {
  security: { icon: 'security', color: '#e53935', label: 'Security' },
  performance: { icon: 'speed', color: '#fb8c00', label: 'Performance' },
  style: { icon: 'format_paint', color: '#1e88e5', label: 'Style' },
  complexity: { icon: 'account_tree', color: '#8e24aa', label: 'Complexity' },
  testing: { icon: 'science', color: '#43a047', label: 'Testing' },
  documentation: { icon: 'description', color: '#00acc1', label: 'Documentation' }
}

/** Severity icon and color mapping */
export const severityConfig: Record<SuggestionSeverity, { icon: string; color: string; label: string }> = {
  error: { icon: 'error', color: '#e53935', label: 'Error' },
  warning: { icon: 'warning', color: '#fb8c00', label: 'Warning' },
  info: { icon: 'info', color: '#1e88e5', label: 'Info' }
}
