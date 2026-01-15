/**
 * Call Hierarchy 状态管理
 * 管理调用链追踪视图的状态
 */

import { defineStore } from 'pinia'

/** LSP SymbolKind 映射 */
export const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
} as const

/** 位置 */
export interface Position {
  line: number
  character: number
}

/** 范围 */
export interface Range {
  start: Position
  end: Position
}

/** Call Hierarchy Item */
export interface CallHierarchyItem {
  name: string
  kind: number
  detail?: string
  uri: string
  range: Range
  selectionRange: Range
  data?: {
    symbolId?: string
    [key: string]: unknown
  }
}

/** 调用者（入站调用） */
export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem
  fromRanges: Range[]
}

/** 被调用者（出站调用） */
export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem
  fromRanges: Range[]
}

/** 调用链树节点 */
export interface CallHierarchyTreeNode {
  item: CallHierarchyItem
  children: CallHierarchyTreeNode[]
  isExpanded: boolean
  isLoading: boolean
  depth: number
}

/** 调用链方向 */
export type CallHierarchyDirection = 'incoming' | 'outgoing'

/** 调用链状态 */
interface CallHierarchyState {
  /** 当前根节点 */
  rootItem: CallHierarchyItem | null
  /** 调用链方向 */
  direction: CallHierarchyDirection
  /** 入站调用树 */
  incomingTree: CallHierarchyTreeNode[]
  /** 出站调用树 */
  outgoingTree: CallHierarchyTreeNode[]
  /** 是否正在加载 */
  isLoading: boolean
  /** 错误信息 */
  error: string | null
  /** 展开的节点 ID 集合 */
  expandedNodes: Set<string>
  /** 选中的节点 */
  selectedNode: CallHierarchyItem | null
  /** 是否面板可见 */
  isPanelVisible: boolean
  /** 最大深度限制 */
  maxDepth: number
}

/** 生成节点唯一 ID */
export function getNodeId(item: CallHierarchyItem): string {
  return `${item.uri}:${item.range.start.line}:${item.range.start.character}:${item.name}`
}

/** 获取符号类型图标名称 */
export function getSymbolIcon(kind: number): string {
  switch (kind) {
    case SymbolKind.File: return 'description'
    case SymbolKind.Module: return 'folder'
    case SymbolKind.Namespace: return 'folder_special'
    case SymbolKind.Package: return 'inventory_2'
    case SymbolKind.Class: return 'class'
    case SymbolKind.Method: return 'functions'
    case SymbolKind.Property: return 'label'
    case SymbolKind.Field: return 'data_object'
    case SymbolKind.Constructor: return 'construction'
    case SymbolKind.Enum: return 'format_list_numbered'
    case SymbolKind.Interface: return 'api'
    case SymbolKind.Function: return 'functions'
    case SymbolKind.Variable: return 'abc'
    case SymbolKind.Constant: return 'lock'
    case SymbolKind.Struct: return 'view_in_ar'
    case SymbolKind.Event: return 'bolt'
    case SymbolKind.Operator: return 'calculate'
    case SymbolKind.TypeParameter: return 'code'
    default: return 'code'
  }
}

/** 获取符号类型名称 */
export function getSymbolKindName(kind: number): string {
  const entry = Object.entries(SymbolKind).find(([, v]) => v === kind)
  return entry ? entry[0] : 'Unknown'
}

export const useCallHierarchyStore = defineStore('callHierarchy', {
  state: (): CallHierarchyState => ({
    rootItem: null,
    direction: 'incoming',
    incomingTree: [],
    outgoingTree: [],
    isLoading: false,
    error: null,
    expandedNodes: new Set(),
    selectedNode: null,
    isPanelVisible: false,
    maxDepth: 10,
  }),

  getters: {
    /** 获取当前方向的树 */
    currentTree: (state): CallHierarchyTreeNode[] => {
      return state.direction === 'incoming' ? state.incomingTree : state.outgoingTree
    },

    /** 是否有数据 */
    hasData: (state): boolean => {
      return state.rootItem !== null
    },

    /** 是否节点已展开 */
    isNodeExpanded: (state) => (item: CallHierarchyItem): boolean => {
      return state.expandedNodes.has(getNodeId(item))
    },

    /** 获取根节点文件名 */
    rootFileName: (state): string => {
      if (!state.rootItem) return ''
      const uri = state.rootItem.uri
      const parts = uri.replace('file://', '').split('/')
      return parts[parts.length - 1] || ''
    },
  },

  actions: {
    /**
     * 准备调用层级（获取初始符号）
     */
    async prepareCallHierarchy(uri: string, line: number, column: number) {
      this.isLoading = true
      this.error = null

      try {
        const result = await window.electronAPI?.daemon?.prepareCallHierarchy?.(uri, line, column)

        if (result && Array.isArray(result) && result.length > 0) {
          this.rootItem = result[0] as CallHierarchyItem
          this.incomingTree = []
          this.outgoingTree = []
          this.expandedNodes.clear()
          this.isPanelVisible = true

          // 自动加载第一层
          await this.loadCalls(this.rootItem)
        } else {
          this.error = 'No call hierarchy available for this symbol'
          this.rootItem = null
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to prepare call hierarchy'
        this.rootItem = null
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 加载调用（入站或出站）
     */
    async loadCalls(item: CallHierarchyItem, depth = 0) {
      if (depth >= this.maxDepth) return

      const nodeId = getNodeId(item)
      this.expandedNodes.add(nodeId)

      try {
        if (this.direction === 'incoming') {
          await this.loadIncomingCalls(item, depth)
        } else {
          await this.loadOutgoingCalls(item, depth)
        }
      } catch (err) {
        console.error('Failed to load calls:', err)
      }
    },

    /**
     * 加载入站调用（谁调用了这个函数）
     */
    async loadIncomingCalls(item: CallHierarchyItem, depth = 0) {
      try {
        const result = await window.electronAPI?.daemon?.incomingCalls?.(item)

        if (result && Array.isArray(result)) {
          const calls = result as CallHierarchyIncomingCall[]
          const nodes: CallHierarchyTreeNode[] = calls.map(call => ({
            item: call.from,
            children: [],
            isExpanded: false,
            isLoading: false,
            depth: depth + 1,
          }))

          // 更新树
          if (depth === 0) {
            this.incomingTree = nodes
          } else {
            this.updateTreeNode(this.incomingTree, item, nodes)
          }
        }
      } catch (err) {
        console.error('Failed to load incoming calls:', err)
      }
    },

    /**
     * 加载出站调用（这个函数调用了谁）
     */
    async loadOutgoingCalls(item: CallHierarchyItem, depth = 0) {
      try {
        const result = await window.electronAPI?.daemon?.outgoingCalls?.(item)

        if (result && Array.isArray(result)) {
          const calls = result as CallHierarchyOutgoingCall[]
          const nodes: CallHierarchyTreeNode[] = calls.map(call => ({
            item: call.to,
            children: [],
            isExpanded: false,
            isLoading: false,
            depth: depth + 1,
          }))

          // 更新树
          if (depth === 0) {
            this.outgoingTree = nodes
          } else {
            this.updateTreeNode(this.outgoingTree, item, nodes)
          }
        }
      } catch (err) {
        console.error('Failed to load outgoing calls:', err)
      }
    },

    /**
     * 更新树节点的子节点
     */
    updateTreeNode(tree: CallHierarchyTreeNode[], parent: CallHierarchyItem, children: CallHierarchyTreeNode[]) {
      const parentId = getNodeId(parent)

      const updateNode = (nodes: CallHierarchyTreeNode[]): boolean => {
        for (const node of nodes) {
          if (getNodeId(node.item) === parentId) {
            node.children = children
            node.isExpanded = true
            node.isLoading = false
            return true
          }
          if (node.children.length > 0 && updateNode(node.children)) {
            return true
          }
        }
        return false
      }

      updateNode(tree)
    },

    /**
     * 展开/折叠节点
     */
    async toggleNode(item: CallHierarchyItem, depth: number) {
      const nodeId = getNodeId(item)

      if (this.expandedNodes.has(nodeId)) {
        this.expandedNodes.delete(nodeId)
      } else {
        this.expandedNodes.add(nodeId)
        await this.loadCalls(item, depth)
      }
    },

    /**
     * 切换调用方向
     */
    async setDirection(direction: CallHierarchyDirection) {
      if (this.direction === direction) return

      this.direction = direction
      this.expandedNodes.clear()

      // 如果有根节点，重新加载
      if (this.rootItem) {
        await this.loadCalls(this.rootItem)
      }
    },

    /**
     * 选择节点
     */
    selectNode(item: CallHierarchyItem) {
      this.selectedNode = item
    },

    /**
     * 导航到符号位置
     */
    async navigateToSymbol(item: CallHierarchyItem) {
      this.selectedNode = item

      // 发送导航事件（由编辑器处理）
      const event = new CustomEvent('call-hierarchy:navigate', {
        detail: {
          uri: item.uri,
          range: item.selectionRange,
        },
      })
      window.dispatchEvent(event)
    },

    /**
     * 刷新当前调用层级
     */
    async refresh() {
      if (!this.rootItem) return

      this.incomingTree = []
      this.outgoingTree = []
      this.expandedNodes.clear()

      await this.loadCalls(this.rootItem)
    },

    /**
     * 清除状态
     */
    clear() {
      this.rootItem = null
      this.incomingTree = []
      this.outgoingTree = []
      this.expandedNodes.clear()
      this.selectedNode = null
      this.error = null
    },

    /**
     * 显示面板
     */
    showPanel() {
      this.isPanelVisible = true
    },

    /**
     * 隐藏面板
     */
    hidePanel() {
      this.isPanelVisible = false
    },

    /**
     * 切换面板可见性
     */
    togglePanel() {
      this.isPanelVisible = !this.isPanelVisible
    },
  },
})
