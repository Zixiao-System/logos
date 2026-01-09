/**
 * 正确性和复杂度检查规则
 */

import type { InspectionRule, InspectionContext, InspectionResult, InspectionRange } from '@/types/inspection'

/** 创建检查结果辅助函数 */
function createResult(
  rule: InspectionRule,
  range: InspectionRange,
  message: string,
  description?: string
): InspectionResult {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.defaultSeverity,
    category: rule.category,
    message,
    range,
    description,
    helpUrl: `https://docs.logos-ide.dev/inspections/${rule.id}`
  }
}

/** 比较 NaN 检查 */
export const compareNaN: InspectionRule = {
  id: 'correctness/compare-nan',
  name: 'NaN 比较',
  description: '检测直接与 NaN 比较的代码',
  category: 'correctness',
  defaultSeverity: 'error',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /[=!]==?\s*NaN|NaN\s*[=!]==?/g

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
          '直接与 NaN 比较永远返回 false',
          '使用 Number.isNaN() 或 isNaN() 来检测 NaN'
        ))
      }
    })

    return results
  }
}

/** typeof 错误检查 */
export const typeofCompare: InspectionRule = {
  id: 'correctness/typeof-compare',
  name: 'typeof 比较错误',
  description: '检测与无效类型字符串比较的 typeof',
  category: 'correctness',
  defaultSeverity: 'error',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const validTypes = ['undefined', 'object', 'boolean', 'number', 'string', 'function', 'symbol', 'bigint']
    const pattern = /typeof\s+\w+\s*===?\s*["'](\w+)["']/g

    context.lines.forEach((line, lineIndex) => {
      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        const typeStr = match[1]
        if (!validTypes.includes(typeStr)) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: match.index + 1,
              endLine: lineIndex + 1,
              endColumn: match.index + match[0].length + 1
            },
            `'${typeStr}' 不是有效的 typeof 返回值`,
            `有效的值为: ${validTypes.join(', ')}`
          ))
        }
      }
    })

    return results
  }
}

/** 自身比较检查 */
export const selfComparison: InspectionRule = {
  id: 'correctness/self-comparison',
  name: '自身比较',
  description: '检测变量与自身比较',
  category: 'correctness',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    // 简单检测同名变量比较
    const pattern = /(\b\w+\b)\s*[=!<>]=+\s*\1\b/g

    context.lines.forEach((line, lineIndex) => {
      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        // 排除 x !== x 用于检测 NaN 的情况
        if (match[0].includes('!==') || match[0].includes('!=')) {
          continue
        }
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          `'${match[1]}' 与自身比较`,
          '变量与自身比较总是返回相同的结果，这可能是一个错误'
        ))
      }
    })

    return results
  }
}

/** 条件赋值检查 */
export const conditionalAssignment: InspectionRule = {
  id: 'correctness/conditional-assignment',
  name: '条件中的赋值',
  description: '检测条件语句中的赋值操作',
  category: 'correctness',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'c', 'cpp', 'java'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /\b(if|while)\s*\([^)]*[^=!<>]=[^=][^)]*\)/g

    context.lines.forEach((line, lineIndex) => {
      let match
      pattern.lastIndex = 0
      while ((match = pattern.exec(line)) !== null) {
        // 检查是否是 == 或 ===
        const inner = match[0]
        if (/[=!<>]=/.test(inner.replace(/\b(if|while)\s*\(/g, ''))) {
          continue
        }

        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          `在 ${match[1]} 条件中使用赋值操作`,
          '这可能是一个错误，您可能想使用 == 或 === 进行比较'
        ))
      }
    })

    return results
  }
}

/** 方法过长检查 */
export const methodTooLong: InspectionRule = {
  id: 'complexity/method-too-long',
  name: '方法过长',
  description: '检测过长的方法/函数',
  category: 'complexity',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java'],
  options: {
    maxLines: 50
  },
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const maxLines = (this.options?.maxLines as number) || 50

    // 简单的函数检测
    const funcPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*\{)/
    let funcStart = -1
    let funcName = ''
    let braceCount = 0

    context.lines.forEach((line, lineIndex) => {
      const match = line.match(funcPattern)
      if (match && funcStart === -1) {
        funcStart = lineIndex
        funcName = match[1] || match[2] || match[3] || 'anonymous'
        braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      } else if (funcStart !== -1) {
        braceCount += (line.match(/\{/g) || []).length
        braceCount -= (line.match(/\}/g) || []).length

        if (braceCount <= 0) {
          const length = lineIndex - funcStart + 1
          if (length > maxLines) {
            results.push(createResult(
              this,
              {
                startLine: funcStart + 1,
                startColumn: 1,
                endLine: funcStart + 1,
                endColumn: context.lines[funcStart].length + 1
              },
              `函数 '${funcName}' 有 ${length} 行，超过最大限制 ${maxLines}`,
              '考虑将此函数拆分为更小的函数以提高可读性和可维护性'
            ))
          }
          funcStart = -1
          funcName = ''
        }
      }
    })

    return results
  }
}

/** 嵌套过深检查 */
export const deepNesting: InspectionRule = {
  id: 'complexity/deep-nesting',
  name: '嵌套过深',
  description: '检测嵌套层级过深的代码',
  category: 'complexity',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java', 'c', 'cpp'],
  options: {
    maxDepth: 4
  },
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const maxDepth = (this.options?.maxDepth as number) || 4
    let currentDepth = 0
    let maxReachedLine = -1

    context.lines.forEach((line, lineIndex) => {
      const opens = (line.match(/\{/g) || []).length
      const closes = (line.match(/\}/g) || []).length

      currentDepth += opens
      if (currentDepth > maxDepth && maxReachedLine === -1) {
        maxReachedLine = lineIndex
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: 1,
            endLine: lineIndex + 1,
            endColumn: line.length + 1
          },
          `代码嵌套层级 ${currentDepth} 超过最大限制 ${maxDepth}`,
          '考虑使用早返回、提取函数或重构逻辑来减少嵌套'
        ))
      }
      currentDepth -= closes

      if (currentDepth <= maxDepth) {
        maxReachedLine = -1
      }
    })

    return results
  }
}

/** 参数过多检查 */
export const tooManyParameters: InspectionRule = {
  id: 'complexity/too-many-parameters',
  name: '参数过多',
  description: '检测参数过多的函数',
  category: 'complexity',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java'],
  options: {
    maxParams: 5
  },
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const maxParams = (this.options?.maxParams as number) || 5
    const funcPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?)\s*\(([^)]*)\)/g

    context.lines.forEach((line, lineIndex) => {
      let match
      funcPattern.lastIndex = 0
      while ((match = funcPattern.exec(line)) !== null) {
        const params = match[1].trim()
        if (!params) continue

        // 计算参数数量
        const paramCount = params.split(',').filter(p => p.trim()).length
        if (paramCount > maxParams) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: match.index + 1,
              endLine: lineIndex + 1,
              endColumn: match.index + match[0].length + 1
            },
            `函数有 ${paramCount} 个参数，超过最大限制 ${maxParams}`,
            '考虑使用对象参数来减少参数数量，提高可读性'
          ))
        }
      }
    })

    return results
  }
}

/** 重复代码检查 (简化版) */
export const duplicateCode: InspectionRule = {
  id: 'complexity/duplicate-code',
  name: '重复代码',
  description: '检测可能重复的代码块',
  category: 'complexity',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  options: {
    minLines: 5
  },
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const minLines = (this.options?.minLines as number) || 5

    // 简化实现：检测连续重复的行块
    const lineHashes = new Map<string, number[]>()

    // 创建滑动窗口哈希
    for (let i = 0; i <= context.lines.length - minLines; i++) {
      const block = context.lines.slice(i, i + minLines)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && !l.startsWith('*'))
        .join('\n')

      if (block.length < 50) continue // 太短的块跳过

      const existing = lineHashes.get(block)
      if (existing) {
        existing.push(i)
        if (existing.length === 2) {
          // 只报告一次
          results.push(createResult(
            this,
            {
              startLine: i + 1,
              startColumn: 1,
              endLine: i + minLines,
              endColumn: context.lines[i + minLines - 1].length + 1
            },
            `此代码块与第 ${existing[0] + 1} 行附近的代码相似`,
            '考虑提取重复代码到共享函数中'
          ))
        }
      } else {
        lineHashes.set(block, [i])
      }
    }

    return results
  }
}

/** 所有正确性和复杂度检查规则 */
export const correctnessRules: InspectionRule[] = [
  compareNaN,
  typeofCompare,
  selfComparison,
  conditionalAssignment,
  methodTooLong,
  deepNesting,
  tooManyParameters,
  duplicateCode
]
