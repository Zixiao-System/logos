/**
 * 文件资源管理器状态管理
 */

import { defineStore } from 'pinia'
import type { FileNode, FileExplorerState } from '@/types'

export const useFileExplorerStore = defineStore('fileExplorer', {
  state: (): FileExplorerState => ({
    rootPath: null,
    tree: [],
    selectedPath: null,
    loading: false,
    error: null
  }),

  getters: {
    /** 是否已打开文件夹 */
    hasOpenFolder: (state) => state.rootPath !== null,

    /** 根文件夹名称 */
    rootFolderName: (state) => {
      if (!state.rootPath) return ''
      return state.rootPath.split(/[\\/]/).pop() || state.rootPath
    },

    /** 获取选中节点 */
    selectedNode: (state) => {
      if (!state.selectedPath) return null
      return findNodeByPath(state.tree, state.selectedPath)
    }
  },

  actions: {
    /**
     * 打开文件夹
     */
    async openFolder(path?: string) {
      this.loading = true
      this.error = null

      try {
        // 如果没有提供路径，则打开对话框选择
        let folderPath: string | null | undefined = path
        if (!folderPath) {
          folderPath = await window.electronAPI.fileSystem.openFolderDialog()
          if (!folderPath) {
            this.loading = false
            return false
          }
        }

        // 读取目录结构
        const tree = await window.electronAPI.fileSystem.readDirectory(folderPath, false)

        this.rootPath = folderPath
        this.tree = tree
        this.selectedPath = null

        if (window.electronAPI?.extensions?.setWorkspaceRoot) {
          await window.electronAPI.extensions.setWorkspaceRoot(folderPath)
        }

        // 开始监听文件变化
        await window.electronAPI.fileSystem.watchDirectory(folderPath)

        return true
      } catch (error) {
        this.error = (error as Error).message
        return false
      } finally {
        this.loading = false
      }
    },

    /**
     * 关闭文件夹
     */
    async closeFolder() {
      if (this.rootPath) {
        await window.electronAPI.fileSystem.unwatchDirectory(this.rootPath)
      }

      this.rootPath = null
      this.tree = []
      this.selectedPath = null
      this.error = null

      if (window.electronAPI?.extensions?.setWorkspaceRoot) {
        await window.electronAPI.extensions.setWorkspaceRoot(null)
      }
    },

    /**
     * 刷新文件树
     */
    async refreshTree() {
      if (!this.rootPath) return

      this.loading = true
      this.error = null

      try {
        const tree = await window.electronAPI.fileSystem.readDirectory(this.rootPath, false)
        this.tree = tree
      } catch (error) {
        this.error = (error as Error).message
      } finally {
        this.loading = false
      }
    },

    /**
     * 展开节点
     */
    async expandNode(path: string) {
      const node = findNodeByPath(this.tree, path)
      if (!node || node.type !== 'directory') return

      try {
        // 读取子目录内容
        const children = await window.electronAPI.fileSystem.readDirectory(path, false)
        node.children = children
        node.expanded = true
      } catch (error) {
        console.error('展开节点失败:', error)
      }
    },

    /**
     * 折叠节点
     */
    collapseNode(path: string) {
      const node = findNodeByPath(this.tree, path)
      if (!node || node.type !== 'directory') return
      node.expanded = false
    },

    /**
     * 切换节点展开/折叠状态
     */
    async toggleNode(path: string) {
      const node = findNodeByPath(this.tree, path)
      if (!node || node.type !== 'directory') return

      if (node.expanded) {
        this.collapseNode(path)
      } else {
        await this.expandNode(path)
      }
    },

    /**
     * 选中节点
     */
    selectNode(path: string | null) {
      this.selectedPath = path
    },

    /**
     * 创建文件
     */
    async createFile(parentPath: string, fileName: string) {
      if (!this.rootPath) return false

      try {
        const filePath = `${parentPath}/${fileName}`
        await window.electronAPI.fileSystem.createFile(filePath)

        // 刷新父目录
        await this.refreshNode(parentPath)

        // 选中新文件
        this.selectedPath = filePath

        return true
      } catch (error) {
        this.error = (error as Error).message
        return false
      }
    },

    /**
     * 创建文件夹
     */
    async createDirectory(parentPath: string, dirName: string) {
      if (!this.rootPath) return false

      try {
        const dirPath = `${parentPath}/${dirName}`
        await window.electronAPI.fileSystem.createDirectory(dirPath)

        // 刷新父目录
        await this.refreshNode(parentPath)

        return true
      } catch (error) {
        this.error = (error as Error).message
        return false
      }
    },

    /**
     * 删除文件或文件夹
     */
    async deleteItem(path: string) {
      if (!this.rootPath) return false

      try {
        await window.electronAPI.fileSystem.deleteItem(path)

        // 获取父目录路径
        const parentPath = await window.electronAPI.fileSystem.dirname(path)

        // 刷新父目录
        await this.refreshNode(parentPath)

        // 如果删除的是当前选中的，清除选中
        if (this.selectedPath === path) {
          this.selectedPath = null
        }

        return true
      } catch (error) {
        this.error = (error as Error).message
        return false
      }
    },

    /**
     * 重命名文件或文件夹
     */
    async renameItem(oldPath: string, newName: string) {
      if (!this.rootPath) return false

      try {
        const parentPath = await window.electronAPI.fileSystem.dirname(oldPath)
        const newPath = `${parentPath}/${newName}`

        await window.electronAPI.fileSystem.renameItem(oldPath, newPath)

        // 刷新父目录
        await this.refreshNode(parentPath)

        // 更新选中路径
        if (this.selectedPath === oldPath) {
          this.selectedPath = newPath
        }

        return { success: true, newPath }
      } catch (error) {
        this.error = (error as Error).message
        return { success: false, newPath: oldPath }
      }
    },

    /**
     * 刷新指定节点
     */
    async refreshNode(path: string) {
      if (!this.rootPath) return

      // 如果是根目录
      if (path === this.rootPath) {
        await this.refreshTree()
        return
      }

      // 找到父节点并刷新其子节点
      const node = findNodeByPath(this.tree, path)
      if (node && node.type === 'directory') {
        try {
          const children = await window.electronAPI.fileSystem.readDirectory(path, false)
          node.children = children
        } catch (error) {
          console.error('刷新节点失败:', error)
        }
      }
    },

    /**
     * 处理文件变化事件
     */
    handleFileChange(_event: { type: string; path: string }) {
      // 简单处理：刷新整个树
      // 实际生产中可以做更精细的更新
      this.refreshTree()
    },

    /**
     * 折叠所有节点
     */
    collapseAll() {
      const collapseRecursive = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.type === 'directory') {
            node.expanded = false
            if (node.children) {
              collapseRecursive(node.children)
            }
          }
        }
      }
      collapseRecursive(this.tree)
    }
  }
})

/**
 * 根据路径查找节点
 */
function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node
    }
    if (node.type === 'directory' && node.children) {
      const found = findNodeByPath(node.children, targetPath)
      if (found) return found
    }
  }
  return null
}
