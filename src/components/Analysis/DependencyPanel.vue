<script setup lang="ts">
/**
 * 依赖检查面板
 * 显示项目依赖的安全漏洞、过期状态和许可证信息
 */

import { ref, computed, onMounted } from 'vue'
import { useFileExplorerStore } from '@/stores/fileExplorer'

// 导入图标
import '@mdui/icons/inventory-2.js'
import '@mdui/icons/security.js'
import '@mdui/icons/warning.js'
import '@mdui/icons/update.js'
import '@mdui/icons/gavel.js'
import '@mdui/icons/check-circle.js'
import '@mdui/icons/error.js'
import '@mdui/icons/info.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/chevron-right.js'
import '@mdui/icons/open-in-new.js'
import '@mdui/icons/upgrade.js'

interface Dependency {
  name: string
  version: string
  latestVersion?: string
  license?: string
  isOutdated: boolean
  isDev: boolean
  vulnerabilities: Vulnerability[]
}

interface Vulnerability {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  fixedIn?: string
}

const fileExplorerStore = useFileExplorerStore()

// 状态
const isLoading = ref(false)
const dependencies = ref<Dependency[]>([])
const selectedTab = ref<'all' | 'vulnerabilities' | 'outdated' | 'licenses'>('all')
const expandedGroups = ref<Set<string>>(new Set())

// 计算属性
const vulnerableCount = computed(() => {
  return dependencies.value.filter(d => d.vulnerabilities.length > 0).length
})

const outdatedCount = computed(() => {
  return dependencies.value.filter(d => d.isOutdated).length
})

const criticalCount = computed(() => {
  let count = 0
  for (const dep of dependencies.value) {
    count += dep.vulnerabilities.filter(v => v.severity === 'critical' || v.severity === 'high').length
  }
  return count
})

// 过滤后的依赖
const filteredDependencies = computed(() => {
  switch (selectedTab.value) {
    case 'vulnerabilities':
      return dependencies.value.filter(d => d.vulnerabilities.length > 0)
    case 'outdated':
      return dependencies.value.filter(d => d.isOutdated)
    case 'licenses':
      return dependencies.value.filter(d => d.license)
    default:
      return dependencies.value
  }
})

// 按类别分组
const groupedDependencies = computed(() => {
  const groups: Record<string, Dependency[]> = {
    'critical': [],
    'vulnerable': [],
    'outdated': [],
    'ok': []
  }

  for (const dep of filteredDependencies.value) {
    const hasCritical = dep.vulnerabilities.some(v => v.severity === 'critical' || v.severity === 'high')
    if (hasCritical) {
      groups.critical.push(dep)
    } else if (dep.vulnerabilities.length > 0) {
      groups.vulnerable.push(dep)
    } else if (dep.isOutdated) {
      groups.outdated.push(dep)
    } else {
      groups.ok.push(dep)
    }
  }

  return groups
})

// 刷新依赖检查
async function refreshDependencies() {
  isLoading.value = true
  try {
    // TODO: 实际调用后端服务获取依赖信息
    // 这里使用模拟数据
    await new Promise(resolve => setTimeout(resolve, 1000))

    dependencies.value = [
      {
        name: 'lodash',
        version: '4.17.15',
        latestVersion: '4.17.21',
        license: 'MIT',
        isOutdated: true,
        isDev: false,
        vulnerabilities: [
          {
            id: 'CVE-2021-23337',
            severity: 'high',
            title: 'Command Injection',
            fixedIn: '4.17.21'
          }
        ]
      },
      {
        name: 'axios',
        version: '0.21.1',
        latestVersion: '1.6.0',
        license: 'MIT',
        isOutdated: true,
        isDev: false,
        vulnerabilities: [
          {
            id: 'CVE-2021-3749',
            severity: 'medium',
            title: 'Server-Side Request Forgery',
            fixedIn: '0.21.2'
          }
        ]
      },
      {
        name: 'vue',
        version: '3.3.0',
        latestVersion: '3.4.0',
        license: 'MIT',
        isOutdated: true,
        isDev: false,
        vulnerabilities: []
      },
      {
        name: 'typescript',
        version: '5.3.0',
        latestVersion: '5.3.0',
        license: 'Apache-2.0',
        isOutdated: false,
        isDev: true,
        vulnerabilities: []
      },
      {
        name: 'vite',
        version: '5.0.0',
        latestVersion: '5.0.0',
        license: 'MIT',
        isOutdated: false,
        isDev: true,
        vulnerabilities: []
      }
    ]
  } finally {
    isLoading.value = false
  }
}

// 切换分组展开
function toggleGroup(group: string) {
  if (expandedGroups.value.has(group)) {
    expandedGroups.value.delete(group)
  } else {
    expandedGroups.value.add(group)
  }
}

// 获取严重性颜色
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#b71c1c'
    case 'high': return 'var(--mdui-color-error)'
    case 'medium': return '#ff9800'
    case 'low': return 'var(--mdui-color-primary)'
    default: return 'var(--mdui-color-outline)'
  }
}

// 获取严重性标签
function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return '严重'
    case 'high': return '高危'
    case 'medium': return '中危'
    case 'low': return '低危'
    default: return severity
  }
}

// 更新依赖
async function updateDependency(dep: Dependency) {
  // TODO: 实际调用 npm/yarn 更新命令
  console.log(`Updating ${dep.name} to ${dep.latestVersion}`)
}

// 更新所有
async function updateAll() {
  // TODO: 批量更新
  console.log('Updating all dependencies')
}

// 初始化
onMounted(() => {
  if (fileExplorerStore.rootPath) {
    refreshDependencies()
  }
})
</script>

<template>
  <div class="deps-panel">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="tabs">
        <button
          :class="{ active: selectedTab === 'all' }"
          @click="selectedTab = 'all'"
        >
          全部
        </button>
        <button
          :class="{ active: selectedTab === 'vulnerabilities' }"
          @click="selectedTab = 'vulnerabilities'"
        >
          <mdui-icon-security></mdui-icon-security>
          漏洞
          <span v-if="vulnerableCount" class="badge error">{{ vulnerableCount }}</span>
        </button>
        <button
          :class="{ active: selectedTab === 'outdated' }"
          @click="selectedTab = 'outdated'"
        >
          <mdui-icon-update></mdui-icon-update>
          过期
          <span v-if="outdatedCount" class="badge warning">{{ outdatedCount }}</span>
        </button>
        <button
          :class="{ active: selectedTab === 'licenses' }"
          @click="selectedTab = 'licenses'"
        >
          <mdui-icon-gavel></mdui-icon-gavel>
          许可证
        </button>
      </div>

      <div class="toolbar-actions">
        <mdui-button-icon @click="refreshDependencies" :disabled="isLoading" title="刷新">
          <mdui-icon-refresh></mdui-icon-refresh>
        </mdui-button-icon>
        <mdui-button
          variant="tonal"
          @click="updateAll"
          :disabled="isLoading || outdatedCount === 0"
        >
          <mdui-icon-upgrade slot="icon"></mdui-icon-upgrade>
          全部更新
        </mdui-button>
      </div>
    </div>

    <!-- 统计摘要 -->
    <div class="stats-bar" v-if="!isLoading && dependencies.length > 0">
      <span class="stat total">
        <mdui-icon-inventory-2></mdui-icon-inventory-2>
        {{ dependencies.length }} 个依赖
      </span>
      <span class="stat critical" v-if="criticalCount > 0">
        <mdui-icon-error></mdui-icon-error>
        {{ criticalCount }} 个高危漏洞
      </span>
      <span class="stat outdated" v-if="outdatedCount > 0">
        <mdui-icon-update></mdui-icon-update>
        {{ outdatedCount }} 个可更新
      </span>
      <span class="stat ok" v-if="vulnerableCount === 0 && outdatedCount === 0">
        <mdui-icon-check-circle></mdui-icon-check-circle>
        全部正常
      </span>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-state">
      <mdui-circular-progress></mdui-circular-progress>
      <span>正在扫描依赖...</span>
    </div>

    <!-- 依赖列表 -->
    <div v-else class="deps-list">
      <!-- 严重漏洞 -->
      <div
        v-if="groupedDependencies.critical.length > 0"
        class="deps-group critical"
      >
        <div
          class="group-header"
          @click="toggleGroup('critical')"
        >
          <mdui-icon-chevron-right
            :class="{ rotated: expandedGroups.has('critical') }"
          ></mdui-icon-chevron-right>
          <mdui-icon-error></mdui-icon-error>
          <span>严重漏洞</span>
          <span class="count">{{ groupedDependencies.critical.length }}</span>
        </div>

        <div v-if="expandedGroups.has('critical')" class="group-content">
          <div
            v-for="dep in groupedDependencies.critical"
            :key="dep.name"
            class="dep-item"
          >
            <div class="dep-info">
              <span class="dep-name">{{ dep.name }}</span>
              <span class="dep-version">{{ dep.version }}</span>
              <span v-if="dep.isDev" class="dev-badge">dev</span>
            </div>

            <div class="vulnerabilities">
              <div
                v-for="vuln in dep.vulnerabilities"
                :key="vuln.id"
                class="vuln-item"
              >
                <span
                  class="vuln-severity"
                  :style="{ color: getSeverityColor(vuln.severity) }"
                >
                  {{ getSeverityLabel(vuln.severity) }}
                </span>
                <span class="vuln-id">{{ vuln.id }}</span>
                <span class="vuln-title">{{ vuln.title }}</span>
                <span v-if="vuln.fixedIn" class="vuln-fix">
                  修复版本: {{ vuln.fixedIn }}
                </span>
              </div>
            </div>

            <div class="dep-actions">
              <mdui-button
                variant="tonal"
                @click="updateDependency(dep)"
              >
                更新到 {{ dep.latestVersion }}
              </mdui-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 其他漏洞 -->
      <div
        v-if="groupedDependencies.vulnerable.length > 0"
        class="deps-group vulnerable"
      >
        <div
          class="group-header"
          @click="toggleGroup('vulnerable')"
        >
          <mdui-icon-chevron-right
            :class="{ rotated: expandedGroups.has('vulnerable') }"
          ></mdui-icon-chevron-right>
          <mdui-icon-warning></mdui-icon-warning>
          <span>安全问题</span>
          <span class="count">{{ groupedDependencies.vulnerable.length }}</span>
        </div>

        <div v-if="expandedGroups.has('vulnerable')" class="group-content">
          <div
            v-for="dep in groupedDependencies.vulnerable"
            :key="dep.name"
            class="dep-item"
          >
            <div class="dep-info">
              <span class="dep-name">{{ dep.name }}</span>
              <span class="dep-version">{{ dep.version }}</span>
            </div>

            <div class="vulnerabilities">
              <div
                v-for="vuln in dep.vulnerabilities"
                :key="vuln.id"
                class="vuln-item"
              >
                <span
                  class="vuln-severity"
                  :style="{ color: getSeverityColor(vuln.severity) }"
                >
                  {{ getSeverityLabel(vuln.severity) }}
                </span>
                <span class="vuln-id">{{ vuln.id }}</span>
              </div>
            </div>

            <div class="dep-actions">
              <mdui-button variant="tonal" @click="updateDependency(dep)">
                更新
              </mdui-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 过期依赖 -->
      <div
        v-if="groupedDependencies.outdated.length > 0"
        class="deps-group outdated"
      >
        <div
          class="group-header"
          @click="toggleGroup('outdated')"
        >
          <mdui-icon-chevron-right
            :class="{ rotated: expandedGroups.has('outdated') }"
          ></mdui-icon-chevron-right>
          <mdui-icon-update></mdui-icon-update>
          <span>可更新</span>
          <span class="count">{{ groupedDependencies.outdated.length }}</span>
        </div>

        <div v-if="expandedGroups.has('outdated')" class="group-content">
          <div
            v-for="dep in groupedDependencies.outdated"
            :key="dep.name"
            class="dep-item simple"
          >
            <div class="dep-info">
              <span class="dep-name">{{ dep.name }}</span>
              <span class="dep-version">{{ dep.version }}</span>
              <span class="dep-arrow">→</span>
              <span class="dep-latest">{{ dep.latestVersion }}</span>
            </div>
            <mdui-button-icon @click="updateDependency(dep)" title="更新">
              <mdui-icon-upgrade></mdui-icon-upgrade>
            </mdui-button-icon>
          </div>
        </div>
      </div>

      <!-- 正常依赖 -->
      <div
        v-if="groupedDependencies.ok.length > 0"
        class="deps-group ok"
      >
        <div
          class="group-header"
          @click="toggleGroup('ok')"
        >
          <mdui-icon-chevron-right
            :class="{ rotated: expandedGroups.has('ok') }"
          ></mdui-icon-chevron-right>
          <mdui-icon-check-circle></mdui-icon-check-circle>
          <span>正常</span>
          <span class="count">{{ groupedDependencies.ok.length }}</span>
        </div>

        <div v-if="expandedGroups.has('ok')" class="group-content">
          <div
            v-for="dep in groupedDependencies.ok"
            :key="dep.name"
            class="dep-item simple"
          >
            <div class="dep-info">
              <span class="dep-name">{{ dep.name }}</span>
              <span class="dep-version">{{ dep.version }}</span>
              <span v-if="dep.license" class="dep-license">{{ dep.license }}</span>
              <span v-if="dep.isDev" class="dev-badge">dev</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.deps-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--mdui-color-surface);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.tabs {
  display: flex;
  gap: 4px;
}

.tabs button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--mdui-color-on-surface-variant);
  cursor: pointer;
}

.tabs button:hover {
  background: var(--mdui-color-surface-container-low);
}

.tabs button.active {
  background: var(--mdui-color-primary-container);
  color: var(--mdui-color-on-primary-container);
}

.badge {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.badge.error {
  background: var(--mdui-color-error);
  color: var(--mdui-color-on-error);
}

.badge.warning {
  background: #ff9800;
  color: white;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--mdui-color-outline-variant);
  font-size: 12px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat.critical {
  color: var(--mdui-color-error);
}

.stat.outdated {
  color: #ff9800;
}

.stat.ok {
  color: #4caf50;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px;
  color: var(--mdui-color-on-surface-variant);
}

.deps-list {
  flex: 1;
  overflow-y: auto;
}

.deps-group {
  border-bottom: 1px solid var(--mdui-color-outline-variant);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  cursor: pointer;
  font-weight: 500;
}

.group-header:hover {
  background: var(--mdui-color-surface-container-low);
}

.deps-group.critical .group-header {
  color: var(--mdui-color-error);
}

.deps-group.vulnerable .group-header {
  color: #ff9800;
}

.deps-group.outdated .group-header {
  color: var(--mdui-color-primary);
}

.deps-group.ok .group-header {
  color: #4caf50;
}

.group-header mdui-icon-chevron-right {
  transition: transform 0.2s;
}

.group-header mdui-icon-chevron-right.rotated {
  transform: rotate(90deg);
}

.group-header span {
  flex: 1;
}

.count {
  padding: 2px 8px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 10px;
  font-size: 11px;
  font-weight: normal;
  color: var(--mdui-color-on-surface-variant);
}

.group-content {
  padding: 0 12px 12px 32px;
}

.dep-item {
  padding: 12px;
  margin-bottom: 8px;
  background: var(--mdui-color-surface-container-low);
  border-radius: 8px;
}

.dep-item.simple {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 4px;
}

.dep-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.dep-name {
  font-weight: 500;
  color: var(--mdui-color-on-surface);
}

.dep-version {
  font-family: monospace;
  font-size: 12px;
  color: var(--mdui-color-outline);
}

.dep-arrow {
  color: var(--mdui-color-outline);
}

.dep-latest {
  font-family: monospace;
  font-size: 12px;
  color: var(--mdui-color-primary);
}

.dep-license {
  padding: 2px 8px;
  background: var(--mdui-color-surface-container-high);
  border-radius: 4px;
  font-size: 11px;
  color: var(--mdui-color-on-surface-variant);
}

.dev-badge {
  padding: 2px 6px;
  background: var(--mdui-color-tertiary-container);
  color: var(--mdui-color-on-tertiary-container);
  border-radius: 4px;
  font-size: 10px;
}

.vulnerabilities {
  margin-top: 8px;
  padding-left: 8px;
  border-left: 2px solid var(--mdui-color-outline-variant);
}

.vuln-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.vuln-severity {
  font-weight: 500;
}

.vuln-id {
  font-family: monospace;
  color: var(--mdui-color-outline);
}

.vuln-title {
  color: var(--mdui-color-on-surface-variant);
}

.vuln-fix {
  width: 100%;
  color: var(--mdui-color-primary);
  font-size: 11px;
}

.dep-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
