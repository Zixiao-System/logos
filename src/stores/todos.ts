/**
 * TODO 项状态管理
 */

import { defineStore } from 'pinia'
import { wasmService } from '@/services/language/WasmLanguageService'
import type { WasmTodoItem, WasmTodoKind, WasmTodoStats } from '@/types/wasm'

/** TODO 项（带 URI） */
export interface TodoItem extends WasmTodoItem {
  uri: string
}

/** TODO 筛选器 */
export interface TodoFilter {
  kinds: WasmTodoKind[]
  searchText: string
  filePattern: string
}

/** TODO 排序方式 */
export type TodoSortBy = 'priority' | 'file' | 'line' | 'kind'

/** TODO 状态 */
export interface TodoState {
  /** 所有 TODO 项 */
  items: TodoItem[]
  /** 统计信息 */
  stats: WasmTodoStats | null
  /** 筛选器 */
  filter: TodoFilter
  /** 排序方式 */
  sortBy: TodoSortBy
  /** 是否降序 */
  sortDesc: boolean
  /** 是否正在加载 */
  loading: boolean
  /** 上次更新时间 */
  lastUpdated: number | null
}

export const useTodoStore = defineStore('todos', {
  state: (): TodoState => ({
    items: [],
    stats: null,
    filter: {
      kinds: [],
      searchText: '',
      filePattern: ''
    },
    sortBy: 'priority',
    sortDesc: true,
    loading: false,
    lastUpdated: null
  }),

  getters: {
    /** 筛选后的 TODO 项 */
    filteredItems: (state): TodoItem[] => {
      let result = [...state.items]

      // 按类型筛选
      if (state.filter.kinds.length > 0) {
        result = result.filter(item => state.filter.kinds.includes(item.kind))
      }

      // 按文本搜索
      if (state.filter.searchText) {
        const searchLower = state.filter.searchText.toLowerCase()
        result = result.filter(item =>
          item.text.toLowerCase().includes(searchLower) ||
          item.uri.toLowerCase().includes(searchLower)
        )
      }

      // 按文件模式筛选
      if (state.filter.filePattern) {
        const pattern = state.filter.filePattern.toLowerCase()
        result = result.filter(item => item.uri.toLowerCase().includes(pattern))
      }

      // 排序
      result.sort((a, b) => {
        let cmp = 0
        switch (state.sortBy) {
          case 'priority':
            cmp = a.priority - b.priority
            break
          case 'file':
            cmp = a.uri.localeCompare(b.uri)
            break
          case 'line':
            cmp = a.uri.localeCompare(b.uri) || a.line - b.line
            break
          case 'kind':
            cmp = a.kind.localeCompare(b.kind)
            break
        }
        return state.sortDesc ? -cmp : cmp
      })

      return result
    },

    /** 按类型分组的 TODO 项 */
    itemsByKind: (state): Record<WasmTodoKind, TodoItem[]> => {
      const result: Record<string, TodoItem[]> = {}
      for (const item of state.items) {
        if (!result[item.kind]) {
          result[item.kind] = []
        }
        result[item.kind].push(item)
      }
      return result as Record<WasmTodoKind, TodoItem[]>
    },

    /** 按文件分组的 TODO 项 */
    itemsByFile: (state): Record<string, TodoItem[]> => {
      const result: Record<string, TodoItem[]> = {}
      for (const item of state.items) {
        if (!result[item.uri]) {
          result[item.uri] = []
        }
        result[item.uri].push(item)
      }
      // 按行号排序
      for (const uri of Object.keys(result)) {
        result[uri].sort((a, b) => a.line - b.line)
      }
      return result
    },

    /** TODO 总数 */
    totalCount: (state): number => state.stats?.total ?? state.items.length,

    /** 各类型数量 */
    countByKind: (state): Record<WasmTodoKind, number> => {
      return state.stats?.byKind ?? {
        todo: 0,
        fixme: 0,
        hack: 0,
        xxx: 0,
        note: 0,
        bug: 0,
        optimize: 0,
        custom: 0
      }
    },

    /** 高优先级项数量 (FIXME, BUG) */
    highPriorityCount(): number {
      return (this.countByKind.fixme ?? 0) + (this.countByKind.bug ?? 0)
    }
  },

  actions: {
    /**
     * 刷新所有 TODO 项
     */
    async refresh() {
      this.loading = true
      try {
        // 从 WASM 服务获取所有 TODO 项
        const items = wasmService.getAllTodoItems()
        this.items = items.map(item => ({
          ...item,
          uri: item.uri ?? ''
        }))

        // 获取统计信息
        this.stats = wasmService.getTodoStats()
        this.lastUpdated = Date.now()
      } catch (error) {
        console.error('[TodoStore] 刷新 TODO 失败:', error)
      } finally {
        this.loading = false
      }
    },

    /**
     * 更新单个文档的 TODO 项
     */
    updateDocument(uri: string) {
      try {
        // 获取该文档的 TODO 项
        const docItems = wasmService.getTodoItems(uri)

        // 移除该文档的旧项
        this.items = this.items.filter(item => item.uri !== uri)

        // 添加新项
        for (const item of docItems) {
          this.items.push({
            ...item,
            uri
          })
        }

        // 更新统计
        this.stats = wasmService.getTodoStats()
        this.lastUpdated = Date.now()
      } catch (error) {
        console.error('[TodoStore] 更新文档 TODO 失败:', error)
      }
    },

    /**
     * 移除文档的 TODO 项
     */
    removeDocument(uri: string) {
      this.items = this.items.filter(item => item.uri !== uri)
      this.stats = wasmService.getTodoStats()
    },

    /**
     * 设置筛选器
     */
    setFilter(filter: Partial<TodoFilter>) {
      this.filter = { ...this.filter, ...filter }
    },

    /**
     * 切换类型筛选
     */
    toggleKindFilter(kind: WasmTodoKind) {
      const index = this.filter.kinds.indexOf(kind)
      if (index >= 0) {
        this.filter.kinds.splice(index, 1)
      } else {
        this.filter.kinds.push(kind)
      }
    },

    /**
     * 清除筛选器
     */
    clearFilter() {
      this.filter = {
        kinds: [],
        searchText: '',
        filePattern: ''
      }
    },

    /**
     * 设置排序
     */
    setSortBy(sortBy: TodoSortBy) {
      if (this.sortBy === sortBy) {
        this.sortDesc = !this.sortDesc
      } else {
        this.sortBy = sortBy
        this.sortDesc = true
      }
    }
  }
})
