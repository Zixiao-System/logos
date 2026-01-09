/**
 * 代码风格检查规则
 */

import type { InspectionRule, InspectionContext, InspectionResult, InspectionRange, QuickFix } from '@/types/inspection'

/** 创建检查结果辅助函数 */
function createResult(
  rule: InspectionRule,
  range: InspectionRange,
  message: string,
  description?: string,
  quickFixes?: QuickFix[]
): InspectionResult {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.defaultSeverity,
    category: rule.category,
    message,
    range,
    description,
    helpUrl: `https://docs.logos-ide.dev/inspections/${rule.id}`,
    quickFixes
  }
}

/** console 语句检查 */
export const consoleStatement: InspectionRule = {
  id: 'style/console-statement',
  name: 'Console 语句',
  description: '检测代码中的 console 语句',
  category: 'style',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /\bconsole\.(log|warn|error|info|debug|trace)\s*\(/g

    context.lines.forEach((line, lineIndex) => {
      // 跳过注释
      if (line.trim().startsWith('//')) return

      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          `发现 console.${match[1]}() 语句`,
          '生产代码中应该移除调试用的 console 语句',
          [{
            title: '删除此行',
            isPreferred: true,
            edits: [{
              range: {
                startLine: lineIndex + 1,
                startColumn: 1,
                endLine: lineIndex + 2,
                endColumn: 1
              },
              newText: ''
            }]
          }]
        ))
      }
    })

    return results
  }
}

/** TODO/FIXME 检查 */
export const todoComment: InspectionRule = {
  id: 'style/todo-comment',
  name: 'TODO/FIXME 注释',
  description: '检测代码中的 TODO 和 FIXME 注释',
  category: 'style',
  defaultSeverity: 'hint',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'vue'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /\b(TODO|FIXME|HACK|XXX|BUG)\s*:?\s*(.*)$/gi

    context.lines.forEach((line, lineIndex) => {
      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        const type = match[1].toUpperCase()
        const severity = type === 'FIXME' || type === 'BUG' ? 'warning' : 'hint'
        results.push({
          ruleId: this.id,
          ruleName: this.name,
          severity: severity as 'warning' | 'hint',
          category: this.category,
          message: `${type}: ${match[2].trim() || '(无描述)'}`,
          range: {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          }
        })
      }
    })

    return results
  }
}

/** @ts-ignore 检查 */
export const tsIgnore: InspectionRule = {
  id: 'style/ts-ignore',
  name: '@ts-ignore 使用',
  description: '检测 @ts-ignore 注释的使用',
  category: 'style',
  defaultSeverity: 'warning',
  languages: ['typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /@ts-ignore|@ts-nocheck|@ts-expect-error/g

    context.lines.forEach((line, lineIndex) => {
      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          `使用 ${match[0]} 抑制类型检查`,
          '尽量修复类型错误而不是抑制它们。如果必须使用，请添加说明原因的注释'
        ))
      }
    })

    return results
  }
}

/** eslint-disable 检查 */
export const eslintDisable: InspectionRule = {
  id: 'style/eslint-disable',
  name: 'ESLint 禁用注释',
  description: '检测 eslint-disable 注释的使用',
  category: 'style',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /eslint-disable(?:-next-line|-line)?/g

    context.lines.forEach((line, lineIndex) => {
      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          '发现 ESLint 禁用注释',
          '尽量修复 lint 错误而不是禁用规则。如果必须禁用，请说明原因'
        ))
      }
    })

    return results
  }
}

/** 魔法数字检查 */
export const magicNumber: InspectionRule = {
  id: 'style/magic-number',
  name: '魔法数字',
  description: '检测代码中的魔法数字',
  category: 'style',
  defaultSeverity: 'hint',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java'],
  options: {
    ignore: [0, 1, -1, 2, 100]
  },
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const ignored = new Set(this.options?.ignore as number[] || [0, 1, -1, 2, 100])
    // 匹配数字，但排除一些常见场景
    const pattern = /(?<![.\w])(-?\d+\.?\d*)(?![.\w])/g

    context.lines.forEach((line, lineIndex) => {
      // 跳过注释、导入、常量定义
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') ||
          trimmed.startsWith('import') || trimmed.startsWith('export') ||
          /const\s+\w+\s*=/.test(trimmed) ||
          /^\s*\d+:/.test(line)) { // 对象字面量的数字键
        return
      }

      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        const num = parseFloat(match[1])
        if (isNaN(num) || ignored.has(num)) continue

        // 检查是否是数组索引或常见场景
        const context5 = line.substring(Math.max(0, match.index - 5), match.index + match[0].length + 5)
        if (/\[\s*\d+\s*\]/.test(context5)) continue // 数组索引
        if (/:\s*\d+/.test(context5)) continue // 属性值
        if (/\d+\s*[,}]/.test(context5)) continue // 数组/对象元素

        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          `发现魔法数字: ${match[1]}`,
          '考虑将此数字提取为命名常量，以提高代码可读性'
        ))
      }
    })

    return results
  }
}

/** 过长行检查 */
export const maxLineLength: InspectionRule = {
  id: 'style/max-line-length',
  name: '行过长',
  description: '检测超过最大长度限制的行',
  category: 'style',
  defaultSeverity: 'hint',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'vue'],
  options: {
    max: 120,
    tabWidth: 2
  },
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const maxLen = (this.options?.max as number) || 120
    const tabWidth = (this.options?.tabWidth as number) || 2

    context.lines.forEach((line, lineIndex) => {
      // 计算实际长度（考虑 tab 宽度）
      const actualLength = line.replace(/\t/g, ' '.repeat(tabWidth)).length

      if (actualLength > maxLen) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: maxLen + 1,
            endLine: lineIndex + 1,
            endColumn: line.length + 1
          },
          `行长度 ${actualLength} 超过最大限制 ${maxLen}`,
          '考虑拆分此行以提高可读性'
        ))
      }
    })

    return results
  }
}

/** debugger 语句检查 */
export const debuggerStatement: InspectionRule = {
  id: 'style/debugger-statement',
  name: 'Debugger 语句',
  description: '检测代码中的 debugger 语句',
  category: 'style',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /\bdebugger\b/g

    context.lines.forEach((line, lineIndex) => {
      if (line.trim().startsWith('//')) return

      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          '发现 debugger 语句',
          '生产代码中应该移除 debugger 语句',
          [{
            title: '删除 debugger',
            isPreferred: true,
            edits: [{
              range: {
                startLine: lineIndex + 1,
                startColumn: 1,
                endLine: lineIndex + 2,
                endColumn: 1
              },
              newText: ''
            }]
          }]
        ))
      }
    })

    return results
  }
}

/** 空 catch 块检查 */
export const emptyCatch: InspectionRule = {
  id: 'style/empty-catch',
  name: '空 catch 块',
  description: '检测空的 catch 块',
  category: 'style',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'java'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []

    // 简化检测：检测 catch 后紧跟空块
    for (let i = 0; i < context.lines.length; i++) {
      const line = context.lines[i]
      if (/\bcatch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        const match = line.match(/\bcatch/)
        if (match) {
          results.push(createResult(
            this,
            {
              startLine: i + 1,
              startColumn: line.indexOf('catch') + 1,
              endLine: i + 1,
              endColumn: line.length + 1
            },
            '空的 catch 块',
            '空的 catch 块会吞掉错误。至少应该记录错误或添加注释说明为什么忽略'
          ))
        }
      }
      // 多行空 catch
      else if (/\bcatch\s*\([^)]*\)\s*\{\s*$/.test(line) && i + 1 < context.lines.length) {
        const nextLine = context.lines[i + 1]
        if (/^\s*\}\s*$/.test(nextLine)) {
          results.push(createResult(
            this,
            {
              startLine: i + 1,
              startColumn: line.indexOf('catch') + 1,
              endLine: i + 2,
              endColumn: nextLine.length + 1
            },
            '空的 catch 块',
            '空的 catch 块会吞掉错误。至少应该记录错误或添加注释说明为什么忽略'
          ))
        }
      }
    }

    return results
  }
}

/** 所有代码风格检查规则 */
export const styleRules: InspectionRule[] = [
  consoleStatement,
  todoComment,
  tsIgnore,
  eslintDisable,
  magicNumber,
  maxLineLength,
  debuggerStatement,
  emptyCatch
]
