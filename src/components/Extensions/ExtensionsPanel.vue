<script setup lang="ts">
/**
 * 扩展管理面板
 */

import { computed, onMounted, ref } from 'vue'
import { useExtensionsStore } from '@/stores/extensions'
import { useNotificationStore } from '@/stores/notification'

// 导入 MDUI 图标
import '@mdui/icons/refresh.js'
import '@mdui/icons/upload.js'
import '@mdui/icons/delete.js'
import '@mdui/icons/extension.js'
import '@mdui/icons/play-arrow.js'
import '@mdui/icons/stop.js'
import '@mdui/icons/search.js'
import '@mdui/icons/download.js'

const extensionsStore = useExtensionsStore()
const notificationStore = useNotificationStore()

type OpenVsxExtension = {
  namespace: string
  name: string
  displayName?: string
  description?: string
  version?: string
  downloads?: number
  files?: {
    icon?: string
  }
}

const openVsxQuery = ref('')
const openVsxResults = ref<OpenVsxExtension[]>([])
const openVsxLoading = ref(false)
const openVsxError = ref<string | null>(null)
const openVsxInstalling = ref<Record<string, boolean>>({})

const hostStatusText = computed(() => {
  switch (extensionsStore.hostStatus.status) {
    case 'running':
      return '扩展宿主运行中'
    case 'starting':
      return '扩展宿主启动中'
    case 'error':
      return extensionsStore.hostStatus.error || '扩展宿主异常'
    default:
      return '扩展宿主已停止'
  }
})

const hostActionLabel = computed(() => {
  return extensionsStore.hostStatus.status === 'running' ? '停止' : '启动'
})

const hostActionIcon = computed(() => {
  return extensionsStore.hostStatus.status === 'running' ? 'stop' : 'play'
})

const toggleHost = async () => {
  if (extensionsStore.hostStatus.status === 'running') {
    await extensionsStore.stopHost()
  } else {
    await extensionsStore.startHost()
  }
}

const handleInstall = async () => {
  await extensionsStore.installVsix()
}

const handleRefresh = async () => {
  await extensionsStore.refresh()
}

const handleOpenRoot = async () => {
  await extensionsStore.openExtensionsRoot()
}

const handleToggle = async (id: string, enabled: boolean) => {
  await extensionsStore.setEnabled(id, enabled)
}

const handleUninstall = async (id: string) => {
  const target = extensionsStore.extensions.find(item => item.id === id)
  if (!target) {
    return
  }
  await extensionsStore.uninstall(target)
}

const toExtensionUrl = (filePath?: string) => {
  if (!filePath) {
    return ''
  }
  const normalized = filePath.replace(/\\/g, '/')
  return `logos-extension://${encodeURI(normalized)}`
}

const searchOpenVsx = async () => {
  if (!openVsxQuery.value.trim()) {
    openVsxResults.value = []
    openVsxError.value = null
    return
  }

  openVsxLoading.value = true
  openVsxError.value = null

  try {
    const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(openVsxQuery.value)}&size=10`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Open VSX 搜索失败 (${response.status})`)
    }
    const data = await response.json()
    openVsxResults.value = (data.extensions || []) as OpenVsxExtension[]
  } catch (error) {
    openVsxError.value = (error as Error).message
  } finally {
    openVsxLoading.value = false
  }
}

const installFromOpenVsx = async (extension: OpenVsxExtension) => {
  if (!window.electronAPI?.extensions?.installFromUrl) {
    return
  }

  const key = `${extension.namespace}.${extension.name}`
  if (openVsxInstalling.value[key]) {
    return
  }

  openVsxInstalling.value = { ...openVsxInstalling.value, [key]: true }

  try {
    const detailsUrl = `https://open-vsx.org/api/${extension.namespace}/${extension.name}`
    const response = await fetch(detailsUrl)
    if (!response.ok) {
      throw new Error(`获取扩展信息失败 (${response.status})`)
    }
    const details = await response.json()
    const downloadUrl =
      details?.files?.download ||
      details?.files?.downloadUrl ||
      details?.downloadUrl

    if (!downloadUrl) {
      throw new Error('无法解析 VSIX 下载地址')
    }

    const installed = await window.electronAPI.extensions.installFromUrl(downloadUrl)
    notificationStore.success(`已安装扩展: ${installed.displayName || installed.name}`)
    await extensionsStore.refresh()
  } catch (error) {
    notificationStore.error((error as Error).message || '安装失败')
  } finally {
    const { [key]: _removed, ...rest } = openVsxInstalling.value
    openVsxInstalling.value = rest
  }
}

onMounted(() => {
  extensionsStore.init()
})
</script>

<template>
  <div class="extensions-panel">
    <div class="panel-header">
      <span class="title">扩展</span>
      <div class="actions">
        <mdui-button-icon @click="handleInstall" title="安装 VSIX">
          <mdui-icon-upload></mdui-icon-upload>
        </mdui-button-icon>
        <mdui-button-icon @click="handleRefresh" title="刷新">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
      </div>
    </div>

    <div class="host-status">
      <span class="status-dot" :class="extensionsStore.hostStatus.status"></span>
      <span class="status-text">{{ hostStatusText }}</span>
      <mdui-button class="host-action" variant="text" size="small" @click="toggleHost">
        <mdui-icon-stop v-if="hostActionIcon === 'stop'"></mdui-icon-stop>
        <mdui-icon-play-arrow v-else></mdui-icon-play-arrow>
        {{ hostActionLabel }}
      </mdui-button>
      <mdui-button class="host-action" variant="text" size="small" @click="handleOpenRoot">
        打开目录
      </mdui-button>
    </div>

    <div v-if="extensionsStore.loading" class="loading">
      <mdui-circular-progress></mdui-circular-progress>
    </div>

    <div v-else-if="extensionsStore.extensions.length === 0" class="empty-state">
      <mdui-icon-extension></mdui-icon-extension>
      <p>暂无已安装扩展</p>
      <mdui-button variant="outlined" @click="handleInstall">安装 VSIX</mdui-button>
    </div>

    <div v-else class="extension-list">
      <div
        v-for="extension in extensionsStore.extensions"
        :key="extension.id"
        class="extension-item"
      >
        <div class="extension-info">
          <img
            v-if="extension.iconPath"
            class="extension-icon"
            :src="toExtensionUrl(extension.iconPath)"
            alt=""
          />
          <div class="extension-name">
            {{ extension.displayName || extension.name }}
          </div>
          <div class="extension-meta">
            <span class="extension-id">{{ extension.id }}</span>
            <span class="extension-version">v{{ extension.version || '0.0.0' }}</span>
          </div>
          <div class="extension-desc">
            {{ extension.description || '暂无描述' }}
          </div>
        </div>
        <div class="extension-actions">
          <mdui-switch
            :checked="extension.enabled"
            @change="handleToggle(extension.id, !extension.enabled)"
          ></mdui-switch>
          <mdui-button-icon class="danger" title="卸载" @click="handleUninstall(extension.id)">
            <mdui-icon-delete></mdui-icon-delete>
          </mdui-button-icon>
        </div>
      </div>
    </div>

    <div class="open-vsx-section">
      <div class="section-header">
        <span class="section-title">Open VSX</span>
      </div>
      <div class="search-bar">
        <mdui-text-field
          v-model="openVsxQuery"
          placeholder="搜索 Open VSX 扩展"
          variant="outlined"
          clearable
          @keydown.enter="searchOpenVsx"
        >
          <mdui-icon-search slot="icon"></mdui-icon-search>
        </mdui-text-field>
        <mdui-button variant="outlined" @click="searchOpenVsx" :disabled="openVsxLoading">
          搜索
        </mdui-button>
      </div>

      <div v-if="openVsxLoading" class="loading">
        <mdui-circular-progress></mdui-circular-progress>
      </div>

      <div v-else-if="openVsxError" class="open-vsx-error">
        {{ openVsxError }}
      </div>

      <div v-else-if="openVsxResults.length > 0" class="open-vsx-results">
        <div v-for="item in openVsxResults" :key="`${item.namespace}.${item.name}`" class="open-vsx-item">
          <div class="open-vsx-info">
            <img v-if="item.files?.icon" class="extension-icon" :src="item.files.icon" alt="" />
            <div class="open-vsx-title">{{ item.displayName || item.name }}</div>
            <div class="open-vsx-meta">
              {{ item.namespace }}.{{ item.name }} · v{{ item.version || 'latest' }}
            </div>
            <div class="open-vsx-desc">
              {{ item.description || '暂无描述' }}
            </div>
          </div>
          <mdui-button
            variant="filled"
            :disabled="openVsxInstalling[`${item.namespace}.${item.name}`]"
            @click="installFromOpenVsx(item)"
          >
            <mdui-icon-download></mdui-icon-download>
            安装
          </mdui-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.extensions-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 12px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header .title {
  font-size: 14px;
  font-weight: 600;
  color: var(--mdui-color-on-surface);
}

.panel-header .actions {
  display: flex;
  gap: 6px;
}

.panel-header mdui-button-icon {
  color: var(--mdui-color-on-surface-variant);
}

.host-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--mdui-color-surface-container-low);
  border: 1px solid var(--mdui-color-outline-variant);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--mdui-color-outline);
}

.status-dot.running {
  background: #22c55e;
}

.status-dot.starting {
  background: #f59e0b;
}

.status-dot.error {
  background: #ef4444;
}

.status-text {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
  flex: 1;
}

.host-action {
  color: var(--mdui-color-primary);
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.extension-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
  padding-bottom: 8px;
}

.extension-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--mdui-color-surface-container-low);
  border: 1px solid var(--mdui-color-outline-variant);
}

.extension-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 70%;
}

.extension-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--mdui-color-surface-container-high);
}

.extension-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--mdui-color-on-surface);
}

.extension-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.extension-id {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.extension-desc {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.extension-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.extension-actions .danger {
  color: var(--mdui-color-error);
}

.open-vsx-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--mdui-color-outline-variant);
  padding-top: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--mdui-color-on-surface-variant);
  text-transform: uppercase;
}

.search-bar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.open-vsx-results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.open-vsx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--mdui-color-surface-container-low);
  border: 1px solid var(--mdui-color-outline-variant);
}

.open-vsx-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 70%;
}

.open-vsx-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--mdui-color-on-surface);
}

.open-vsx-meta {
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.open-vsx-desc {
  font-size: 12px;
  color: var(--mdui-color-on-surface-variant);
}

.open-vsx-error {
  font-size: 12px;
  color: var(--mdui-color-error);
}
</style>
