/**
 * 扩展系统状态管理
 */

import { defineStore } from 'pinia'
import { useNotificationStore } from './notification'
import type { ExtensionHostState, LocalExtensionInfo } from '@/types'

let unsubscribeHostStatus: (() => void) | null = null

export const useExtensionsStore = defineStore('extensions', {
  state: () => ({
    extensions: [] as LocalExtensionInfo[],
    hostStatus: { status: 'stopped' } as ExtensionHostState,
    loading: false,
    error: null as string | null
  }),

  actions: {
    async init() {
      if (!window.electronAPI?.extensions) {
        return
      }

      if (!unsubscribeHostStatus) {
        unsubscribeHostStatus = window.electronAPI.extensions.onHostStatus((state: ExtensionHostState) => {
          this.hostStatus = state
        })
      }

      await this.refresh()

      try {
        this.hostStatus = await window.electronAPI.extensions.getHostStatus()
      } catch {
        // 忽略初始化状态错误
      }
    },

    async refresh() {
      if (!window.electronAPI?.extensions) {
        return
      }

      this.loading = true
      this.error = null

      try {
        this.extensions = await window.electronAPI.extensions.listLocal()
      } catch (error) {
        this.error = (error as Error).message
      } finally {
        this.loading = false
      }
    },

    async installVsix() {
      if (!window.electronAPI?.extensions) {
        return false
      }

      const notificationStore = useNotificationStore()
      const selection = await window.electronAPI.fileSystem.openFileDialog({
        filters: [{ name: 'VSIX', extensions: ['vsix'] }],
        multiple: false
      })
      const vsixPath = Array.isArray(selection) ? selection[0] : selection

      if (!vsixPath) {
        return false
      }

      try {
        const result = await window.electronAPI.extensions.installVsix(vsixPath)
        notificationStore.success(`已安装扩展: ${result.displayName || result.name}`)
        await this.refresh()
        return true
      } catch (error) {
        const message = (error as Error).message || 'VSIX 安装失败'
        notificationStore.error(message)
        return false
      }
    },

    async uninstall(extension: LocalExtensionInfo) {
      if (!window.electronAPI?.extensions) {
        return false
      }

      const notificationStore = useNotificationStore()
      const confirmDelete = window.confirm(`确定要卸载扩展 "${extension.displayName || extension.name}" 吗？`)
      if (!confirmDelete) {
        return false
      }

      try {
        await window.electronAPI.extensions.uninstall(extension.id)
        notificationStore.success(`已卸载扩展: ${extension.displayName || extension.name}`)
        await this.refresh()
        return true
      } catch (error) {
        const message = (error as Error).message || '卸载失败'
        notificationStore.error(message)
        return false
      }
    },

    async setEnabled(extensionId: string, enabled: boolean) {
      if (!window.electronAPI?.extensions) {
        return false
      }

      try {
        await window.electronAPI.extensions.setEnabled(extensionId, enabled)
        const target = this.extensions.find(item => item.id === extensionId)
        if (target) {
          target.enabled = enabled
        }
        return true
      } catch (error) {
        this.error = (error as Error).message
        return false
      }
    },

    async startHost() {
      if (!window.electronAPI?.extensions) {
        return false
      }

      this.hostStatus = await window.electronAPI.extensions.startHost()
      return true
    },

    async stopHost() {
      if (!window.electronAPI?.extensions) {
        return false
      }

      this.hostStatus = await window.electronAPI.extensions.stopHost()
      return true
    },

    async restartHost() {
      if (!window.electronAPI?.extensions) {
        return false
      }

      this.hostStatus = await window.electronAPI.extensions.restartHost()
      return true
    },

    async openExtensionsRoot() {
      if (!window.electronAPI?.extensions) {
        return
      }

      await window.electronAPI.extensions.openRoot()
    }
  }
})
