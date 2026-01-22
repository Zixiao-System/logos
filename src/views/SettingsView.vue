<script setup lang="ts">
/**
 * 设置视图
 * 管理应用程序的各项设置
 */

import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useThemeStore } from '@/stores/theme'
import type { CICDProvider } from '@/types/settings'

// 导入图标
import '@mdui/icons/dark-mode.js'
import '@mdui/icons/light-mode.js'
import '@mdui/icons/visibility.js'
import '@mdui/icons/visibility-off.js'
import '@mdui/icons/palette.js'
import '@mdui/icons/refresh.js'
import '@mdui/icons/check.js'

const settingsStore = useSettingsStore()
const themeStore = useThemeStore()

// 壁纸图片列表（从 GitHub 获取）
const wallpaperImages = [
  { id: 1, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img1.png' },
  { id: 2, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img2.png' },
  { id: 3, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img3.png' },
  { id: 4, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img4.png' },
  { id: 5, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img5.png' },
  { id: 6, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img6.png' },
  { id: 7, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img7.png' },
  { id: 8, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img8.png' },
  { id: 9, url: 'https://raw.githubusercontent.com/zixiao-technologies/color-ref-imgs/main/ref_img9.png' }
]

// 选中的壁纸 ID
const selectedWallpaper = ref<number | null>(null)

// 自定义颜色输入
const customColorInput = ref(themeStore.customColor || '#8b5cf6')

// 主题选项
const themeOptions = [
  { label: 'Logos Dark', value: 'lsp-dark' },
  { label: 'Logos Light', value: 'lsp-light' },
  { label: 'Monokai', value: 'monokai' },
  { label: 'GitHub Dark', value: 'github-dark' }
]

// CI/CD 提供者选项
const providerOptions = [
  { label: '无', value: 'none' },
  { label: 'GitHub Actions', value: 'github' },
  { label: 'GitLab CI', value: 'gitlab' }
]

// 深色模式
const darkMode = computed({
  get: () => themeStore.isDark,
  set: (value: boolean) => themeStore.setTheme(value ? 'dark' : 'light')
})

// 编辑器设置
const fontSize = computed({
  get: () => settingsStore.editor.fontSize,
  set: (value: number) => settingsStore.updateEditor({ fontSize: value })
})

const tabSize = computed({
  get: () => settingsStore.editor.tabSize,
  set: (value: number) => settingsStore.updateEditor({ tabSize: value })
})

const wordWrap = computed({
  get: () => settingsStore.editor.wordWrap,
  set: (value: boolean) => settingsStore.updateEditor({ wordWrap: value })
})

const minimap = computed({
  get: () => settingsStore.editor.minimap,
  set: (value: boolean) => settingsStore.updateEditor({ minimap: value })
})

const autoSave = computed({
  get: () => settingsStore.editor.autoSave,
  set: (value: boolean) => settingsStore.updateEditor({ autoSave: value })
})

const colorTheme = computed({
  get: () => settingsStore.editor.colorTheme,
  set: (value: string) => settingsStore.updateEditor({
    colorTheme: value as 'lsp-dark' | 'lsp-light' | 'monokai' | 'github-dark'
  })
})

// DevOps 设置
const cicdProvider = computed({
  get: () => settingsStore.devops.provider,
  set: (value: string) => settingsStore.setProvider(value as CICDProvider)
})

const githubToken = computed({
  get: () => settingsStore.devops.githubToken,
  set: (value: string) => settingsStore.setGitHubToken(value)
})

const gitlabToken = computed({
  get: () => settingsStore.devops.gitlabToken,
  set: (value: string) => settingsStore.setGitLabToken(value)
})

const gitlabUrl = computed({
  get: () => settingsStore.devops.gitlabUrl,
  set: (value: string) => settingsStore.setGitLabUrl(value)
})

const buildNotifications = computed({
  get: () => settingsStore.devops.buildNotifications,
  set: (value: boolean) => settingsStore.updateDevOps({ buildNotifications: value })
})

// 遥测设置
const telemetryEnabled = computed({
  get: () => settingsStore.telemetry.enabled,
  set: (value: boolean) => {
    settingsStore.updateTelemetry({ enabled: value })
    // 同步到主进程
    if (window.electronAPI?.telemetry) {
      if (value) {
        window.electronAPI.telemetry.enable()
      } else {
        window.electronAPI.telemetry.disable()
      }
    }
  }
})

// 从 package.json 动态读取版本号
import pkg from '../../package.json'
const appVersion = pkg.version

// 从壁纸提取颜色
async function extractColorFromWallpaper(wallpaper: { id: number; url: string }) {
  selectedWallpaper.value = wallpaper.id
  try {
    const color = await themeStore.extractColorFromWallpaper(wallpaper.url)
    customColorInput.value = color
  } catch (err) {
    console.error('Failed to extract color from wallpaper:', err)
    selectedWallpaper.value = null
  }
}

// 应用自定义颜色
function applyCustomColor() {
  if (customColorInput.value && /^#[0-9A-Fa-f]{6}$/.test(customColorInput.value)) {
    themeStore.setCustomColor(customColorInput.value)
    selectedWallpaper.value = null
  }
}

// 重置配色方案
function resetColorScheme() {
  themeStore.resetColorScheme()
  customColorInput.value = '#6750a4'
  selectedWallpaper.value = null
}
</script>

<template>
  <div class="settings-view">
    <h1>设置</h1>

    <!-- 外观设置 -->
    <mdui-card variant="outlined" class="settings-section">
      <h2>外观</h2>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">深色模式</span>
          <span class="setting-description">使用深色主题</span>
        </div>
        <mdui-switch :checked="darkMode" @change="darkMode = !darkMode"></mdui-switch>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">颜色主题</span>
          <span class="setting-description">选择编辑器配色方案</span>
        </div>
        <mdui-select :value="colorTheme" @change="(e: any) => colorTheme = e.target.value">
          <mdui-menu-item
            v-for="theme in themeOptions"
            :key="theme.value"
            :value="theme.value"
          >
            {{ theme.label }}
          </mdui-menu-item>
        </mdui-select>
      </div>
    </mdui-card>

    <!-- 个性化设置 -->
    <mdui-card variant="outlined" class="settings-section">
      <h2>
        <mdui-icon-palette style="vertical-align: middle; margin-right: 8px;"></mdui-icon-palette>
        个性化
      </h2>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">主题色</span>
          <span class="setting-description">自定义应用的主题颜色</span>
        </div>
        <div class="color-picker-row">
          <input
            type="color"
            v-model="customColorInput"
            class="color-input"
          />
          <mdui-text-field
            :value="customColorInput"
            variant="outlined"
            class="color-text-input"
            @input="(e: any) => customColorInput = e.target.value"
          ></mdui-text-field>
          <mdui-button-icon @click="applyCustomColor">
            <mdui-icon-check></mdui-icon-check>
          </mdui-button-icon>
        </div>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item-vertical">
        <div class="setting-info">
          <span class="setting-label">从壁纸中提取颜色</span>
          <span class="setting-description">选择一张壁纸，自动提取主色调作为主题色</span>
        </div>
        <div class="wallpaper-grid">
          <div
            v-for="wallpaper in wallpaperImages"
            :key="wallpaper.id"
            class="wallpaper-item"
            :class="{ selected: selectedWallpaper === wallpaper.id }"
            @click="extractColorFromWallpaper(wallpaper)"
          >
            <img :src="wallpaper.url" :alt="`壁纸 ${wallpaper.id}`" loading="lazy" />
            <div v-if="selectedWallpaper === wallpaper.id && themeStore.extractingColor" class="loading-overlay">
              <mdui-circular-progress></mdui-circular-progress>
            </div>
            <div v-else-if="selectedWallpaper === wallpaper.id" class="selected-overlay">
              <mdui-icon-check></mdui-icon-check>
            </div>
          </div>
        </div>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">重置配色</span>
          <span class="setting-description">恢复到默认配色方案</span>
        </div>
        <mdui-button variant="outlined" @click="resetColorScheme">
          <mdui-icon-refresh slot="icon"></mdui-icon-refresh>
          恢复默认
        </mdui-button>
      </div>

      <div v-if="themeStore.customColor" class="current-color-info">
        <p>当前主题色：<span class="color-preview" :style="{ backgroundColor: themeStore.customColor }"></span> {{ themeStore.customColor }}</p>
      </div>
    </mdui-card>

    <!-- 编辑器设置 -->
    <mdui-card variant="outlined" class="settings-section">
      <h2>编辑器</h2>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">字体大小</span>
          <span class="setting-description">编辑器字体大小 ({{ fontSize }}px)</span>
        </div>
        <mdui-slider
          :value="fontSize"
          :min="10"
          :max="24"
          :step="1"
          labeled
          @change="(e: any) => fontSize = Number(e.target.value)"
        ></mdui-slider>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">Tab 大小</span>
          <span class="setting-description">缩进空格数</span>
        </div>
        <mdui-segmented-button-group :value="String(tabSize)" @change="(e: any) => tabSize = Number(e.target.value)">
          <mdui-segmented-button value="2">2</mdui-segmented-button>
          <mdui-segmented-button value="4">4</mdui-segmented-button>
          <mdui-segmented-button value="8">8</mdui-segmented-button>
        </mdui-segmented-button-group>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">自动换行</span>
          <span class="setting-description">长行自动折行显示</span>
        </div>
        <mdui-switch :checked="wordWrap" @change="wordWrap = !wordWrap"></mdui-switch>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">迷你地图</span>
          <span class="setting-description">显示代码缩略图</span>
        </div>
        <mdui-switch :checked="minimap" @change="minimap = !minimap"></mdui-switch>
      </div>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">自动保存</span>
          <span class="setting-description">失去焦点时自动保存</span>
        </div>
        <mdui-switch :checked="autoSave" @change="autoSave = !autoSave"></mdui-switch>
      </div>
    </mdui-card>

    <!-- DevOps 设置 -->
    <mdui-card variant="outlined" class="settings-section">
      <h2>DevOps / CI/CD</h2>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">CI/CD 平台</span>
          <span class="setting-description">选择持续集成平台</span>
        </div>
        <mdui-select :value="cicdProvider" @change="(e: any) => cicdProvider = e.target.value">
          <mdui-menu-item
            v-for="provider in providerOptions"
            :key="provider.value"
            :value="provider.value"
          >
            {{ provider.label }}
          </mdui-menu-item>
        </mdui-select>
      </div>

      <!-- GitHub 配置 -->
      <template v-if="cicdProvider === 'github'">
        <mdui-divider></mdui-divider>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">GitHub Token</span>
            <span class="setting-description">Personal Access Token (需要 repo 和 workflow 权限)</span>
          </div>
          <mdui-text-field
            :value="githubToken"
            type="password"
            variant="outlined"
            placeholder="ghp_xxxxxxxxxxxx"
            @input="(e: any) => githubToken = e.target.value"
          ></mdui-text-field>
        </div>
      </template>

      <!-- GitLab 配置 -->
      <template v-if="cicdProvider === 'gitlab'">
        <mdui-divider></mdui-divider>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">GitLab URL</span>
            <span class="setting-description">GitLab 服务器地址 (支持自托管)</span>
          </div>
          <mdui-text-field
            :value="gitlabUrl"
            variant="outlined"
            placeholder="https://gitlab.com"
            @input="(e: any) => gitlabUrl = e.target.value"
          ></mdui-text-field>
        </div>

        <mdui-divider></mdui-divider>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">GitLab Token</span>
            <span class="setting-description">Personal Access Token (需要 api 权限)</span>
          </div>
          <mdui-text-field
            :value="gitlabToken"
            type="password"
            variant="outlined"
            placeholder="glpat-xxxxxxxxxxxx"
            @input="(e: any) => gitlabToken = e.target.value"
          ></mdui-text-field>
        </div>
      </template>

      <mdui-divider></mdui-divider>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">构建通知</span>
          <span class="setting-description">流水线完成时通知</span>
        </div>
        <mdui-switch :checked="buildNotifications" @change="buildNotifications = !buildNotifications"></mdui-switch>
      </div>
    </mdui-card>

    <!-- 隐私设置 -->
    <mdui-card variant="outlined" class="settings-section">
      <h2>隐私</h2>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">发送错误报告</span>
          <span class="setting-description">帮助我们改进 Logos，发送匿名错误报告</span>
        </div>
        <mdui-switch :checked="telemetryEnabled" @change="telemetryEnabled = !telemetryEnabled"></mdui-switch>
      </div>

      <div class="telemetry-info">
        <p>我们收集的信息仅包括：应用崩溃和错误信息、系统平台信息、应用版本号。</p>
        <p>我们不会收集您的代码内容、文件路径或任何个人身份信息。</p>
      </div>
    </mdui-card>

    <!-- 关于 -->
    <mdui-card variant="outlined" class="settings-section about-section">
      <h2>关于</h2>
      <div class="about-content">
        <div class="about-logo">
          <span class="logo-text">Logos</span>
        </div>
        <div class="about-info">
          <p class="version">版本 {{ appVersion }}</p>
          <p class="copyright">© 2025～2026 Zixiao System</p>
        </div>
      </div>
    </mdui-card>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
}

.settings-view h1 {
  margin-bottom: 24px;
  font-size: 1.75rem;
  font-weight: 500;
}

.settings-section {
  padding: 20px;
  margin-bottom: 16px;
}

.settings-section h2 {
  margin: 0 0 16px 0;
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--mdui-color-primary);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-weight: 500;
}

.setting-description {
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
}

mdui-slider {
  width: 200px;
}

mdui-text-field {
  width: 300px;
}

mdui-select {
  width: 200px;
}

.about-section {
  text-align: center;
}

.about-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.about-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo-text {
  font-size: 2rem;
  font-weight: 700;
  color: var(--mdui-color-primary);
}

.logo-subtitle {
  font-size: 1rem;
  color: var(--mdui-color-on-surface-variant);
}

.about-info {
  color: var(--mdui-color-on-surface-variant);
}

.about-info p {
  margin: 4px 0;
}

.about-info .version {
  font-weight: 500;
}

.about-info .copyright {
  font-size: 0.875rem;
}

.telemetry-info {
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 8px;
}

.telemetry-info p {
  margin: 4px 0;
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  line-height: 1.5;
}

/* 个性化设置样式 */
.setting-item-vertical {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-input {
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  padding: 0;
  background: transparent;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-input::-webkit-color-swatch {
  border: 2px solid var(--mdui-color-outline);
  border-radius: 8px;
}

.color-text-input {
  width: 120px;
}

.wallpaper-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 8px;
}

.wallpaper-item {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.wallpaper-item:hover {
  border-color: var(--mdui-color-primary);
  transform: scale(1.02);
}

.wallpaper-item.selected {
  border-color: var(--mdui-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--mdui-color-primary-rgb), 0.3);
}

.wallpaper-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.loading-overlay,
.selected-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.selected-overlay mdui-icon-check {
  color: white;
  font-size: 32px;
}

.current-color-info {
  background: var(--mdui-color-surface-container);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
}

.current-color-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--mdui-color-on-surface-variant);
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-preview {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--mdui-color-outline);
}
</style>
