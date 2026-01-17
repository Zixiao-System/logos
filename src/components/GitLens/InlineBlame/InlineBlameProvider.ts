/**
 * Inline Blame Provider
 * 为 Monaco Editor 提供 inline blame 装饰器
 */

import * as monaco from 'monaco-editor'
import type { BlameInfo } from '@/types'

/** Blame 装饰器配置 */
interface BlameDecorationConfig {
  /** 文本颜色 */
  textColor: string
  /** 背景颜色 */
  backgroundColor: string
  /** 字体大小 */
  fontSize: number
  /** 左边距 */
  marginLeft: number
}

/** 默认配置 */
const DEFAULT_CONFIG: BlameDecorationConfig = {
  textColor: '#6b7280',
  backgroundColor: 'transparent',
  fontSize: 12,
  marginLeft: 32
}

/** Inline Blame Provider */
export class InlineBlameProvider {
  private editor: monaco.editor.IStandaloneCodeEditor
  private decorations: string[] = []
  private blameData: BlameInfo[] = []
  private config: BlameDecorationConfig
  private enabled: boolean = true
  private currentLineDecoration: string[] = []
  private disposeListeners: (() => void)[] = []

  constructor(
    editor: monaco.editor.IStandaloneCodeEditor,
    config: Partial<BlameDecorationConfig> = {}
  ) {
    this.editor = editor
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.setupListeners()
  }

  /** 设置事件监听 */
  private setupListeners(): void {
    // 监听光标位置变化，更新当前行 blame 高亮
    const cursorDisposable = this.editor.onDidChangeCursorPosition((e) => {
      if (this.enabled && this.blameData.length > 0) {
        this.updateCurrentLineHighlight(e.position.lineNumber)
      }
    })

    this.disposeListeners.push(() => cursorDisposable.dispose())
  }

  /** 设置 blame 数据并更新装饰器 */
  public setBlameData(blameData: BlameInfo[]): void {
    this.blameData = blameData
    if (this.enabled) {
      this.updateDecorations()
    }
  }

  /** 更新装饰器 */
  private updateDecorations(): void {
    if (!this.enabled || this.blameData.length === 0) {
      this.clearDecorations()
      return
    }

    const model = this.editor.getModel()
    if (!model) return

    // 创建装饰器
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = this.blameData.map(blame => {
      const blameText = this.formatBlameText(blame)

      return {
        range: new monaco.Range(blame.lineNumber, 1, blame.lineNumber, 1),
        options: {
          isWholeLine: false,
          after: {
            content: blameText,
            inlineClassName: 'inline-blame-decoration',
            inlineClassNameAffectsLetterSpacing: true
          },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }
    })

    // 应用装饰器
    this.decorations = this.editor.deltaDecorations(this.decorations, newDecorations)
  }

  /** 更新当前行高亮 */
  private updateCurrentLineHighlight(lineNumber: number): void {
    const blame = this.blameData.find(b => b.lineNumber === lineNumber)
    if (!blame) {
      this.currentLineDecoration = this.editor.deltaDecorations(this.currentLineDecoration, [])
      return
    }

    // 高亮相同 commit 的所有行
    const sameCommitLines = this.blameData
      .filter(b => b.commitHash === blame.commitHash)
      .map(b => ({
        range: new monaco.Range(b.lineNumber, 1, b.lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'blame-same-commit-highlight',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      }))

    this.currentLineDecoration = this.editor.deltaDecorations(this.currentLineDecoration, sameCommitLines)
  }

  /** 格式化 blame 显示文本 */
  private formatBlameText(blame: BlameInfo): string {
    if (blame.isUncommitted) {
      return '    • Not Committed Yet'
    }

    const relativeTime = this.formatRelativeTime(blame.authorTime)
    const maxAuthorLength = 20
    const author = blame.author.length > maxAuthorLength
      ? blame.author.substring(0, maxAuthorLength - 2) + '..'
      : blame.author

    const maxSummaryLength = 40
    const summary = blame.summary.length > maxSummaryLength
      ? blame.summary.substring(0, maxSummaryLength - 2) + '..'
      : blame.summary

    return `    ${author}, ${relativeTime} • ${summary}`
  }

  /** 格式化相对时间 */
  private formatRelativeTime(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    if (years > 0) return `${years}y ago`
    if (months > 0) return `${months}mo ago`
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'now'
  }

  /** 清除所有装饰器 */
  public clearDecorations(): void {
    this.decorations = this.editor.deltaDecorations(this.decorations, [])
    this.currentLineDecoration = this.editor.deltaDecorations(this.currentLineDecoration, [])
  }

  /** 启用/禁用 inline blame */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (enabled) {
      this.updateDecorations()
    } else {
      this.clearDecorations()
    }
  }

  /** 获取启用状态 */
  public isEnabled(): boolean {
    return this.enabled
  }

  /** 切换启用状态 */
  public toggle(): void {
    this.setEnabled(!this.enabled)
  }

  /** 更新配置 */
  public updateConfig(config: Partial<BlameDecorationConfig>): void {
    this.config = { ...this.config, ...config }
    if (this.enabled) {
      this.updateDecorations()
    }
  }

  /** 获取指定行的 blame 信息 */
  public getBlameForLine(lineNumber: number): BlameInfo | undefined {
    return this.blameData.find(b => b.lineNumber === lineNumber)
  }

  /** 获取指定 commit 的所有行号 */
  public getLinesForCommit(commitHash: string): number[] {
    return this.blameData
      .filter(b => b.commitHash === commitHash)
      .map(b => b.lineNumber)
  }

  /** 销毁 */
  public dispose(): void {
    this.clearDecorations()
    this.disposeListeners.forEach(fn => fn())
    this.disposeListeners = []
    this.blameData = []
  }
}

/** 注入 CSS 样式到页面 */
export function injectBlameStyles(): void {
  const styleId = 'inline-blame-styles'
  if (document.getElementById(styleId)) return

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    .inline-blame-decoration {
      color: #6b7280 !important;
      font-size: 12px !important;
      font-family: 'JetBrains Mono', 'Consolas', monospace !important;
      opacity: 0.7;
      margin-left: 32px;
      white-space: pre;
      pointer-events: none;
    }

    .blame-same-commit-highlight {
      background-color: rgba(100, 100, 100, 0.1) !important;
    }

    /* 暗色主题适配 */
    .vs-dark .inline-blame-decoration {
      color: #6b7280 !important;
    }

    .vs-dark .blame-same-commit-highlight {
      background-color: rgba(150, 150, 150, 0.1) !important;
    }
  `
  document.head.appendChild(style)
}
