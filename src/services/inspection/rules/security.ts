/**
 * 安全检查规则
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

/** 硬编码凭证检查 */
export const hardcodedCredentials: InspectionRule = {
  id: 'security/hardcoded-credentials',
  name: '硬编码凭证',
  description: '检测代码中硬编码的密码、API密钥等敏感信息',
  category: 'security',
  defaultSeverity: 'error',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java', 'go', 'rust'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const patterns = [
      // 密码模式
      { regex: /(?:password|passwd|pwd)\s*[:=]\s*["'`]([^"'`]{3,})["'`]/gi, type: '密码' },
      // API 密钥模式
      { regex: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*["'`]([^"'`]{8,})["'`]/gi, type: 'API密钥' },
      // Token 模式
      { regex: /(?:access[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*["'`]([^"'`]{10,})["'`]/gi, type: 'Token' },
      // AWS 凭证模式
      { regex: /AKIA[0-9A-Z]{16}/g, type: 'AWS Access Key' },
      // 私钥模式
      { regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi, type: '私钥' },
    ]

    context.lines.forEach((line, lineIndex) => {
      // 跳过注释行
      if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('*')) {
        return
      }

      for (const pattern of patterns) {
        let match
        pattern.regex.lastIndex = 0
        while ((match = pattern.regex.exec(line)) !== null) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: match.index + 1,
              endLine: lineIndex + 1,
              endColumn: match.index + match[0].length + 1
            },
            `检测到硬编码的${pattern.type}`,
            '将敏感信息存储在环境变量或配置文件中，不要直接硬编码在代码中'
          ))
        }
      }
    })

    return results
  }
}

/** SQL 注入风险检查 */
export const sqlInjection: InspectionRule = {
  id: 'security/sql-injection',
  name: 'SQL注入风险',
  description: '检测可能的SQL注入漏洞',
  category: 'security',
  defaultSeverity: 'error',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python', 'java'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []

    // 检测字符串拼接的SQL
    const patterns = [
      // SQL 字符串拼接
      /(?:execute|query|exec)\s*\(\s*["'`].*?\+.*?["'`]/gi,
      // 模板字符串中的SQL
      /(?:execute|query|exec)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/gi,
      // f-string 中的SQL (Python)
      /(?:execute|cursor\.execute)\s*\(\s*f["'][^"']*\{[^}]+\}[^"']*["']/gi,
    ]

    context.lines.forEach((line, lineIndex) => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0
        const match = pattern.exec(line)
        if (match) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: match.index + 1,
              endLine: lineIndex + 1,
              endColumn: match.index + match[0].length + 1
            },
            '检测到潜在的SQL注入风险',
            '使用参数化查询或预编译语句来防止SQL注入'
          ))
        }
      }
    })

    return results
  }
}

/** eval() 使用检查 */
export const unsafeEval: InspectionRule = {
  id: 'security/unsafe-eval',
  name: '不安全的 eval',
  description: '检测 eval() 和类似的不安全函数调用',
  category: 'security',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const pattern = /\b(eval|Function)\s*\(/g

    context.lines.forEach((line, lineIndex) => {
      // 跳过注释行
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        return
      }

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
          `使用 ${match[1]}() 存在安全风险`,
          'eval() 可以执行任意代码，容易被利用进行代码注入攻击。考虑使用更安全的替代方案'
        ))
      }
    })

    return results
  }
}

/** dangerouslySetInnerHTML 检查 */
export const dangerouslySetInnerHTML: InspectionRule = {
  id: 'security/dangerous-inner-html',
  name: '危险的 innerHTML',
  description: '检测 dangerouslySetInnerHTML 或直接设置 innerHTML',
  category: 'security',
  defaultSeverity: 'warning',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const patterns = [
      /dangerouslySetInnerHTML/g,
      /\.innerHTML\s*=/g,
      /v-html\s*=/g,
    ]

    context.lines.forEach((line, lineIndex) => {
      for (const pattern of patterns) {
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
            '直接设置 HTML 内容存在 XSS 风险',
            '确保内容已经过适当的清理和转义，或使用安全的文本渲染方式'
          ))
        }
      }
    })

    return results
  }
}

/** 命令注入检查 */
export const commandInjection: InspectionRule = {
  id: 'security/command-injection',
  name: '命令注入风险',
  description: '检测可能的命令注入漏洞',
  category: 'security',
  defaultSeverity: 'error',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []
    const patterns = [
      // Node.js exec/spawn 带变量
      /(?:exec|execSync|spawn|spawnSync)\s*\([^)]*\$\{/g,
      /(?:exec|execSync|spawn|spawnSync)\s*\([^)]*\+/g,
      // Python os.system/subprocess
      /(?:os\.system|subprocess\.(?:call|run|Popen))\s*\([^)]*(?:f["']|\+)/g,
    ]

    context.lines.forEach((line, lineIndex) => {
      for (const pattern of patterns) {
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
            '检测到潜在的命令注入风险',
            '避免在 shell 命令中使用未经验证的用户输入。使用参数数组代替字符串拼接'
          ))
        }
      }
    })

    return results
  }
}

/** 不安全的随机数检查 */
export const insecureRandom: InspectionRule = {
  id: 'security/insecure-random',
  name: '不安全的随机数',
  description: '检测在安全上下文中使用不安全的随机数生成器',
  category: 'security',
  defaultSeverity: 'info',
  languages: ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'python'],
  check(context: InspectionContext): InspectionResult[] {
    const results: InspectionResult[] = []

    // 检测 Math.random() 用于安全目的
    const securityContextPattern = /(?:token|password|secret|key|auth|session|nonce|salt)/i

    context.lines.forEach((line, lineIndex) => {
      // 检查是否在安全上下文中使用 Math.random
      if (securityContextPattern.test(line) && /Math\.random\s*\(\)/.test(line)) {
        const match = line.match(/Math\.random\s*\(\)/)
        if (match) {
          results.push(createResult(
            this,
            {
              startLine: lineIndex + 1,
              startColumn: line.indexOf(match[0]) + 1,
              endLine: lineIndex + 1,
              endColumn: line.indexOf(match[0]) + match[0].length + 1
            },
            '在安全上下文中使用 Math.random() 是不安全的',
            '对于密码学相关的随机数，请使用 crypto.getRandomValues() 或 crypto.randomBytes()'
          ))
        }
      }
    })

    return results
  }
}

/** 所有安全检查规则 */
export const securityRules: InspectionRule[] = [
  hardcodedCredentials,
  sqlInjection,
  unsafeEval,
  dangerouslySetInnerHTML,
  commandInjection,
  insecureRandom
]
