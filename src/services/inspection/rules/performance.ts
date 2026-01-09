/**
 * 性能检查规则
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

/** 循环内 await 检查 */
export const awaitInLoop: InspectionRule = {
  id: 'performance/await-in-loop',
  name: '循环内的 await',
  description: '检测循环内的 await，可能导致性能问题',
  category: 'performance',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    let inLoop = 0
    const loopPatterns = [
      /\b(for|while|do)\s*\(/,
      /\.forEach\s*\(/,
      /\.map\s*\(/,
      /\.reduce\s*\(/,
    ]
    const loopEndPattern = /^\s*\}/

    context.lines.forEach((line, lineIndex) => {
      // 检测循环开始
      for (const pattern of loopPatterns) {
        if (pattern.test(line)) {
          inLoop++
        }
      }

      // 检测循环结束 (简化处理)
      if (loopEndPattern.test(line) && inLoop > 0) {
        inLoop--
      }

      // 在循环内检测 await
      if (inLoop > 0) {
        const awaitMatch = line.match(/\bawait\s+/)
        if (awaitMatch) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: line.indexOf('await') + 1,
              endLine: lineIndex + 1,
              endColumn: line.indexOf('await') + 6
            },
            '循环内使用 await 可能导致性能问题',
            '考虑使用 Promise.all() 并行执行异步操作，而不是顺序等待'
          ))
        }
      }
    })

    return results
  }
}

/** forEach + push 模式检查 */
export const forEachPush: InspectionRule = {
  id: 'performance/foreach-push',
  name: 'forEach + push 模式',
  description: '检测 forEach + push 模式，建议使用 map',
  category: 'performance',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    let inForEach = false
    let forEachStartLine = 0

    context.lines.forEach((line, lineIndex) => {
      if (/\.forEach\s*\(/.test(line)) {
        inForEach = true
        forEachStartLine = lineIndex
      }

      if (inForEach && /\.push\s*\(/.test(line)) {
        const match = line.match(/\.push\s*\(/)
        if (match) {
          results.push(createResult(
            this,
            {
              startLine: forEachStartLine + 1,
              startColumn: 1,
              endLine: lineIndex + 1,
              endColumn: line.length + 1
            },
            'forEach + push 模式可以优化',
            '考虑使用 .map() 代替 .forEach() + .push()，代码更简洁且通常性能更好'
          ))
        }
      }

      if (inForEach && /\}\s*\)/.test(line)) {
        inForEach = false
      }
    })

    return results
  }
}

/** 不必要的字符串连接检查 */
export const inefficientStringConcat: InspectionRule = {
  id: 'performance/inefficient-string-concat',
  name: '低效的字符串连接',
  description: '检测循环中的字符串连接操作',
  category: 'performance',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'java'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    let inLoop = 0
    const loopPattern = /\b(for|while|do)\s*\(/

    context.lines.forEach((line, lineIndex) => {
      if (loopPattern.test(line)) {
        inLoop++
      }

      if (/^\s*\}/.test(line) && inLoop > 0) {
        inLoop--
      }

      // 在循环内检测字符串连接
      if (inLoop > 0) {
        const concatMatch = line.match(/(\w+)\s*\+=\s*["'`]/) || line.match(/(\w+)\s*=\s*\1\s*\+/)
        if (concatMatch) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: line.indexOf(concatMatch[0]) + 1,
              endLine: lineIndex + 1,
              endColumn: line.indexOf(concatMatch[0]) + concatMatch[0].length + 1
            },
            '循环中的字符串连接可能效率低下',
            '考虑使用数组 join() 或模板字符串来提高性能'
          ))
        }
      }
    })

    return results
  }
}

/** 过多的 DOM 操作检查 */
export const excessiveDomOperations: InspectionRule = {
  id: 'performance/excessive-dom-operations',
  name: '过多的 DOM 操作',
  description: '检测循环中的 DOM 操作',
  category: 'performance',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    let inLoop = 0
    const loopPattern = /\b(for|while|do)\s*\(/
    const domOperations = [
      /document\.getElementById/,
      /document\.querySelector/,
      /document\.createElement/,
      /\.appendChild\s*\(/,
      /\.insertBefore\s*\(/,
      /\.removeChild\s*\(/,
      /\.innerHTML\s*=/,
    ]

    context.lines.forEach((line, lineIndex) => {
      if (loopPattern.test(line)) {
        inLoop++
      }

      if (/^\s*\}/.test(line) && inLoop > 0) {
        inLoop--
      }

      if (inLoop > 0) {
        for (const pattern of domOperations) {
          const match = line.match(pattern)
          if (match) {
            results.push(createResult(
              this,
              {
                startLine: lineIndex + 1,
                startColumn: line.indexOf(match[0]) + 1,
                endLine: lineIndex + 1,
                endColumn: line.indexOf(match[0]) + match[0].length + 1
              },
              '循环中的 DOM 操作可能导致性能问题',
              '考虑批量处理 DOM 操作，使用 DocumentFragment 或一次性更新'
            ))
            break
          }
        }
      }
    })

    return results
  }
}

/** 大数组的 indexOf 检查 */
export const arrayIndexOfInLoop: InspectionRule = {
  id: 'performance/array-indexof-in-loop',
  name: '循环中的数组查找',
  description: '检测循环中使用 indexOf/includes 查找数组元素',
  category: 'performance',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    let inLoop = 0
    const loopPattern = /\b(for|while)\s*\(/

    context.lines.forEach((line, lineIndex) => {
      if (loopPattern.test(line)) {
        inLoop++
      }

      if (/^\s*\}/.test(line) && inLoop > 0) {
        inLoop--
      }

      if (inLoop > 0) {
        const searchMatch = line.match(/\.(indexOf|includes|find|findIndex)\s*\(/)
        if (searchMatch) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: line.indexOf(searchMatch[0]) + 1,
              endLine: lineIndex + 1,
              endColumn: line.indexOf(searchMatch[0]) + searchMatch[0].length + 1
            },
            `循环中使用 ${searchMatch[1]}() 可能效率低下`,
            '对于频繁查找操作，考虑使用 Set 或 Map 数据结构'
          ))
        }
      }
    })

    return results
  }
}

/** 不必要的重新渲染检查 (React) */
export const unnecessaryRerender: InspectionRule = {
  id: 'performance/unnecessary-rerender',
  name: '可能的不必要重新渲染',
  description: '检测可能导致不必要重新渲染的模式',
  category: 'performance',
  defaultSeverity: 'info',
  languages: ['javascriptreact', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []

    // 检测在 JSX 中创建内联函数
    const inlineHandlerPattern = /on\w+\s*=\s*\{\s*\(\s*\)\s*=>/g
    // 检测在 JSX 中创建内联对象
    const inlineObjectPattern = /style\s*=\s*\{\s*\{/g

    context.lines.forEach((line, lineIndex) => {
      let match

      // 内联箭头函数
      inlineHandlerPattern.lastIndex = 0
      while ((match = inlineHandlerPattern.exec(line)) !== null) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          'JSX 中的内联函数可能导致不必要的重新渲染',
          '考虑使用 useCallback 包裹函数或将函数定义移到组件外部'
        ))
      }

      // 内联样式对象
      inlineObjectPattern.lastIndex = 0
      while ((match = inlineObjectPattern.exec(line)) !== null) {
        results.push(createResult(
          this,
          {
            startLine: lineIndex + 1,
            startColumn: match.index + 1,
            endLine: lineIndex + 1,
            endColumn: match.index + match[0].length + 1
          },
          'JSX 中的内联样式对象可能导致不必要的重新渲染',
          '考虑使用 useMemo 包裹样式对象或使用 CSS 类'
        ))
      }
    })

    return results
  }
}

/** 所有性能检查规则 */
export const performanceRules: InspectionRule[] = [
  awaitInLoop,
  forEachPush,
  inefficientStringConcat,
  excessiveDomOperations,
  arrayIndexOfInLoop,
  unnecessaryRerender
]
