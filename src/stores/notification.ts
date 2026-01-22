/**
 * 通知系统状态管理
 */

import { defineStore } from 'pinia'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
  action?: {
    label: string
    handler: () => void
  }
}

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notifications: [] as Notification[]
  }),

  actions: {
    /**
     * 显示通知
     */
    show(
      type: NotificationType,
      message: string,
      duration: number = 3000,
      action?: { label: string; handler: () => void }
    ) {
      const id = `notification-${Date.now()}-${Math.random()}`
      const notification: Notification = {
        id,
        type,
        message,
        duration,
        action
      }

      this.notifications.push(notification)

      // 自动移除
      if (duration > 0) {
        setTimeout(() => {
          this.remove(id)
        }, duration)
      }

      return id
    },

    /**
     * 显示成功通知
     */
    success(message: string, duration?: number) {
      return this.show('success', message, duration)
    },

    /**
     * 显示错误通知
     */
    error(message: string, duration?: number) {
      return this.show('error', message, duration || 5000)
    },

    /**
     * 显示警告通知
     */
    warning(message: string, duration?: number) {
      return this.show('warning', message, duration)
    },

    /**
     * 显示信息通知
     */
    info(message: string, duration?: number) {
      return this.show('info', message, duration)
    },

    /**
     * 移除通知
     */
    remove(id: string) {
      const index = this.notifications.findIndex(n => n.id === id)
      if (index >= 0) {
        this.notifications.splice(index, 1)
      }
    },

    /**
     * 清除所有通知
     */
    clear() {
      this.notifications = []
    }
  }
})
