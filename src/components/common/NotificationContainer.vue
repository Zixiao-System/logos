<script setup lang="ts">
/**
 * 通知容器组件
 */

import { computed } from 'vue'
import { useNotificationStore } from '@/stores/notification'
import type { Notification } from '@/stores/notification'

// 导入 MDUI 图标
import '@mdui/icons/check-circle.js'
import '@mdui/icons/error.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/info.js'
import '@mdui/icons/close.js'

const notificationStore = useNotificationStore()

const notifications = computed(() => notificationStore.notifications)

const getIcon = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return 'mdui-icon-check-circle'
    case 'error':
      return 'mdui-icon-error'
    case 'warning':
      return 'mdui-icon-warning'
    case 'info':
      return 'mdui-icon-info'
  }
}

const handleClose = (id: string) => {
  notificationStore.remove(id)
}

const handleAction = (notification: Notification) => {
  if (notification.action) {
    notification.action.handler()
    handleClose(notification.id)
  }
}
</script>

<template>
  <div class="notification-container">
    <TransitionGroup name="notification" tag="div">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="notification"
        :class="notification.type"
      >
        <component :is="getIcon(notification.type)" class="icon"></component>
        <span class="message">{{ notification.message }}</span>
        <div class="actions">
          <mdui-button
            v-if="notification.action"
            variant="text"
            size="small"
            @click="handleAction(notification)"
          >
            {{ notification.action.label }}
          </mdui-button>
          <mdui-button-icon
            size="small"
            @click="handleClose(notification.id)"
          >
            <mdui-icon-close></mdui-icon-close>
          </mdui-button-icon>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.notification {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  min-width: 300px;
  max-width: 500px;
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  animation: slideIn 0.3s ease-out;
}

.notification.success {
  border-left: 4px solid var(--mdui-color-primary);
}

.notification.error {
  border-left: 4px solid var(--mdui-color-error);
}

.notification.warning {
  border-left: 4px solid var(--mdui-color-tertiary);
}

.notification.info {
  border-left: 4px solid var(--mdui-color-primary);
}

.icon {
  font-size: 20px;
  flex-shrink: 0;
}

.notification.success .icon {
  color: var(--mdui-color-primary);
}

.notification.error .icon {
  color: var(--mdui-color-error);
}

.notification.warning .icon {
  color: var(--mdui-color-tertiary);
}

.notification.info .icon {
  color: var(--mdui-color-primary);
}

.message {
  flex: 1;
  font-size: 14px;
  color: var(--mdui-color-on-surface);
  line-height: 1.4;
}

.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.actions mdui-button-icon {
  --mdui-comp-button-icon-size: 20px;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.notification-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
