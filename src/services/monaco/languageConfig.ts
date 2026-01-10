/**
 * Monaco Editor 语言配置
 * 注册自定义语言和语法高亮支持
 */

import * as monaco from 'monaco-editor'

/**
 * 注册 Vue 语言支持
 * Vue 使用 HTML 作为基础语法高亮
 */
function registerVueLanguage(): void {
  // 注册 Vue 语言 ID
  monaco.languages.register({
    id: 'vue',
    extensions: ['.vue'],
    aliases: ['Vue', 'vue'],
    mimetypes: ['text/x-vue']
  })

  // Vue 使用 HTML 语法高亮配置
  monaco.languages.setLanguageConfiguration('vue', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['<', '>']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ],
    folding: {
      markers: {
        start: /^\s*<!--\s*#region\b.*-->/,
        end: /^\s*<!--\s*#endregion\b.*-->/
      }
    },
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    indentationRules: {
      increaseIndentPattern: /<(?!\?|(?:area|base|br|col|frame|hr|html|img|input|link|meta|param)\b|[^>]*\/>)([-_\.A-Za-z0-9]+)(?=\s|>)\b[^>]*>(?!.*<\/\1>)|<!--(?!.*-->)|\{[^}"']*$/,
      decreaseIndentPattern: /^\s*(<\/(?!html)[-_\.A-Za-z0-9]+\b[^>]*>|-->|\})/
    }
  })

  // Vue 语法高亮 Monarch 定义
  monaco.languages.setMonarchTokensProvider('vue', {
    defaultToken: '',
    tokenPostfix: '.vue',

    keywords: [
      'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
      'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
      'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements',
      'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of',
      'package', 'private', 'protected', 'public', 'return', 'set', 'static',
      'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined',
      'var', 'void', 'while', 'with', 'yield'
    ],

    typeKeywords: [
      'any', 'boolean', 'number', 'object', 'string', 'undefined'
    ],

    operators: [
      '<=', '>=', '==', '!=', '===', '!==', '=>', '+', '-', '**',
      '*', '/', '%', '++', '--', '<<', '</', '>>', '>>>', '&',
      '|', '^', '!', '~', '&&', '||', '??', '?', ':', '=', '+=', '-=',
      '*=', '**=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=',
      '^=', '@'
    ],

    // 用于转义的符号
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

    regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
    regexpesc: /\\(?:[bBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/,

    tokenizer: {
      root: [
        // Vue 模板区块
        [/(<)(template)(\s+lang=)("pug"|'pug')/, ['delimiter.html', 'tag.html', 'attribute.name', { token: 'attribute.value', next: '@pugTemplate' }]],
        [/(<)(template)/, ['delimiter.html', { token: 'tag.html', next: '@templateTag' }]],

        // Vue script 区块
        [/(<)(script)(\s+lang=)("ts"|'ts'|"typescript"|'typescript')/, ['delimiter.html', 'tag.html', 'attribute.name', { token: 'attribute.value', next: '@tsScript' }]],
        [/(<)(script)(\s+setup)(\s+lang=)("ts"|'ts'|"typescript"|'typescript')/, ['delimiter.html', 'tag.html', 'attribute.name', 'attribute.name', { token: 'attribute.value', next: '@tsScript' }]],
        [/(<)(script)/, ['delimiter.html', { token: 'tag.html', next: '@scriptTag' }]],

        // Vue style 区块
        [/(<)(style)(\s+lang=)("scss"|'scss')/, ['delimiter.html', 'tag.html', 'attribute.name', { token: 'attribute.value', next: '@scssStyle' }]],
        [/(<)(style)(\s+lang=)("less"|'less')/, ['delimiter.html', 'tag.html', 'attribute.name', { token: 'attribute.value', next: '@lessStyle' }]],
        [/(<)(style)/, ['delimiter.html', { token: 'tag.html', next: '@styleTag' }]],

        // HTML 内容
        [/<\/?[\w\-]+/, { token: 'tag.html', next: '@htmlTag' }],
        [/<!--/, 'comment.html', '@htmlComment'],
        [/\{\{/, { token: 'delimiter.interpolation', next: '@interpolation' }],
        [/./, 'text.html']
      ],

      // 模板标签处理
      templateTag: [
        [/>/, { token: 'delimiter.html', next: '@template' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      // 模板内容
      template: [
        [/<\/template>/, { token: 'tag.html', next: '@pop' }],
        [/<\/?[\w\-]+/, { token: 'tag.html', next: '@htmlTag' }],
        [/<!--/, 'comment.html', '@htmlComment'],
        [/\{\{/, { token: 'delimiter.interpolation', next: '@interpolation' }],
        [/./, 'text.html']
      ],

      // Pug 模板
      pugTemplate: [
        [/>/, { token: 'delimiter.html', next: '@pugContent' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      pugContent: [
        [/<\/template>/, { token: 'tag.html', next: '@pop' }],
        [/./, 'text.pug']
      ],

      // Script 标签处理
      scriptTag: [
        [/>/, { token: 'delimiter.html', next: '@javascript' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      // TypeScript script
      tsScript: [
        [/>/, { token: 'delimiter.html', next: '@typescript' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      // JavaScript 内容
      javascript: [
        [/<\/script>/, { token: 'tag.html', next: '@pop' }],
        { include: '@jsContent' }
      ],

      // TypeScript 内容
      typescript: [
        [/<\/script>/, { token: 'tag.html', next: '@pop' }],
        { include: '@jsContent' }
      ],

      // JS/TS 通用内容
      jsContent: [
        // 空白和注释
        [/[ \t\r\n]+/, ''],
        [/\/\*/, 'comment', '@jsComment'],
        [/\/\/.*$/, 'comment'],

        // 字符串
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@jsString."'],
        [/'/, 'string', "@jsString.'"],
        [/`/, 'string', '@jsTemplateString'],

        // 数字
        [/(@digits)[eE]([\-+]?(@digits))?/, 'number.float'],
        [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, 'number.float'],
        [/0[xX](@hexdigits)n?/, 'number.hex'],
        [/0[oO]?(@octaldigits)n?/, 'number.octal'],
        [/0[bB](@binarydigits)n?/, 'number.binary'],
        [/(@digits)n?/, 'number'],

        // 分隔符和操作符
        [/[;,.]/, 'delimiter'],
        [/[{}()\[\]]/, '@brackets'],

        // 标识符和关键字
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            '@typeKeywords': 'type.identifier',
            '@keywords': 'keyword',
            '@default': 'identifier'
          }
        }],

        // 操作符
        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }]
      ],

      jsComment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      jsString: [
        [/[^\\"']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/["']/, {
          cases: {
            '$#==$S2': { token: 'string', next: '@pop' },
            '@default': 'string'
          }
        }]
      ],

      jsTemplateString: [
        [/\$\{/, { token: 'delimiter.bracket', next: '@jsBracket' }],
        [/[^\\`$]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/`/, 'string', '@pop']
      ],

      jsBracket: [
        [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
        { include: '@jsContent' }
      ],

      // Style 标签处理
      styleTag: [
        [/>/, { token: 'delimiter.html', next: '@css' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      scssStyle: [
        [/>/, { token: 'delimiter.html', next: '@scss' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      lessStyle: [
        [/>/, { token: 'delimiter.html', next: '@less' }],
        [/[\w\-:@.#]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      // CSS 内容
      css: [
        [/<\/style>/, { token: 'tag.html', next: '@pop' }],
        [/[\w\-]+(?=:)/, 'attribute.name'],
        [/:/, 'delimiter'],
        [/[;{}]/, 'delimiter'],
        [/[#.][\w\-]+/, 'tag'],
        [/[\w\-]+/, 'attribute.value'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\/\*/, 'comment', '@cssComment']
      ],

      scss: [
        [/<\/style>/, { token: 'tag.html', next: '@pop' }],
        [/\$[\w\-]+/, 'variable'],
        [/@[\w\-]+/, 'keyword'],
        [/[\w\-]+(?=:)/, 'attribute.name'],
        [/:/, 'delimiter'],
        [/[;{}]/, 'delimiter'],
        [/[#.][\w\-]+/, 'tag'],
        [/[\w\-]+/, 'attribute.value'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@cssComment']
      ],

      less: [
        [/<\/style>/, { token: 'tag.html', next: '@pop' }],
        [/@[\w\-]+/, 'variable'],
        [/[\w\-]+(?=:)/, 'attribute.name'],
        [/:/, 'delimiter'],
        [/[;{}]/, 'delimiter'],
        [/[#.][\w\-]+/, 'tag'],
        [/[\w\-]+/, 'attribute.value'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@cssComment']
      ],

      cssComment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ],

      // HTML 标签
      htmlTag: [
        [/>/, { token: 'delimiter.html', next: '@pop' }],
        [/\/>/, { token: 'delimiter.html', next: '@pop' }],
        [/v-[\w\-:]+/, 'attribute.name.vue'],
        [/@[\w\-:]+/, 'attribute.name.vue'],
        [/:[\w\-]+/, 'attribute.name.vue'],
        [/#[\w\-]+/, 'attribute.name.vue'],
        [/[\w\-:]+/, 'attribute.name'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'attribute.value'],
        [/'[^']*'/, 'attribute.value']
      ],

      // HTML 注释
      htmlComment: [
        [/--!?>/, 'comment.html', '@pop'],
        [/./, 'comment.html']
      ],

      // Vue 插值
      interpolation: [
        [/\}\}/, { token: 'delimiter.interpolation', next: '@pop' }],
        { include: '@jsContent' }
      ]
    }
  })
}

/**
 * 确保 JSX/TSX 语言正确配置
 * Monaco 内置支持，但需要确保语言 ID 正确注册
 */
function ensureReactLanguagesRegistered(): void {
  // TypeScript React
  monaco.languages.register({
    id: 'typescriptreact',
    extensions: ['.tsx'],
    aliases: ['TypeScript React', 'tsx'],
    mimetypes: ['text/typescript-jsx']
  })

  // JavaScript React
  monaco.languages.register({
    id: 'javascriptreact',
    extensions: ['.jsx'],
    aliases: ['JavaScript React', 'jsx'],
    mimetypes: ['text/javascript-jsx']
  })

  // 设置 TypeScript React 语言配置（继承自 TypeScript）
  monaco.languages.setLanguageConfiguration('typescriptreact', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['<', '>']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>', notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
      { open: '/**', close: ' */', notIn: ['string'] }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/
      }
    },
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    indentationRules: {
      increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/,
      decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$/
    }
  })

  // 设置 JavaScript React 语言配置（继承自 JavaScript）
  monaco.languages.setLanguageConfiguration('javascriptreact', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
      ['<', '>']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>', notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
      { open: '/**', close: ' */', notIn: ['string'] }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/
      }
    },
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    indentationRules: {
      increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/,
      decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$/
    }
  })
}

/**
 * 初始化所有自定义语言支持
 * 应在应用启动时调用
 */
export function initializeMonacoLanguages(): void {
  registerVueLanguage()
  ensureReactLanguagesRegistered()
  console.log('[Monaco] 自定义语言支持已初始化 (Vue, JSX, TSX)')
}
