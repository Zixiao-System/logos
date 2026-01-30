<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useExtensionUiStore } from '@/stores/extensionUi'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  handle: string | null
  html: string
  enableScripts: boolean
}>()

const extensionUiStore = useExtensionUiStore()
const themeStore = useThemeStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
let unsubscribeMessage: (() => void) | null = null

const sandbox = computed(() => {
  return props.enableScripts ? 'allow-scripts allow-same-origin' : 'allow-same-origin'
})

const baseThemeVariables = (mode: 'light' | 'dark') => {
  const isDark = mode === 'dark'
  const common = {
    '--vscode-font-family': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--vscode-editor-font-family': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    '--vscode-editor-font-size': '12px',
    '--vscode-editor-font-weight': '400',
    '--vscode-chat-font-size': '13px',
    '--vscode-chat-editor-font-size': '12px'
  }
  if (isDark) {
    return {
      ...common,
      '--vscode-foreground': '#d4d4d4',
      '--vscode-disabledForeground': '#6a6a6a',
      '--vscode-errorForeground': '#f14c4c',
      '--vscode-descriptionForeground': '#9da1a6',
      '--vscode-icon-foreground': '#c5c5c5',
      '--vscode-focusBorder': '#007fd4',
      '--vscode-textLink-foreground': '#3794ff',
      '--vscode-textLink-activeForeground': '#3794ff',
      '--vscode-textCodeBlock-background': '#1e1e1e',
      '--vscode-badge-background': '#007acc',
      '--vscode-badge-foreground': '#ffffff',
      '--vscode-scrollbarSlider-background': '#79797933',
      '--vscode-scrollbarSlider-hoverBackground': '#7979794d',
      '--vscode-scrollbarSlider-activeBackground': '#bfbfbf66',
      '--vscode-editor-background': '#1e1e1e',
      '--vscode-editor-foreground': '#d4d4d4',
      '--vscode-editorWidget-background': '#252526',
      '--vscode-editorWidget-foreground': '#cccccc',
      '--vscode-editorWidget-border': '#454545',
      '--vscode-editorWarning-foreground': '#cca700',
      '--vscode-toolbar-hoverBackground': '#2a2d2e',
      '--vscode-input-background': '#3c3c3c',
      '--vscode-input-foreground': '#cccccc',
      '--vscode-input-border': '#3c3c3c',
      '--vscode-input-placeholderForeground': '#a6a6a6',
      '--vscode-inputValidation-infoBackground': '#063b49',
      '--vscode-inputValidation-warningBackground': '#352a05',
      '--vscode-inputValidation-warningBorder': '#b89500',
      '--vscode-inputValidation-errorBackground': '#5a1d1d',
      '--vscode-inputValidation-errorBorder': '#be1100',
      '--vscode-dropdown-background': '#3c3c3c',
      '--vscode-button-foreground': '#ffffff',
      '--vscode-button-background': '#0e639c',
      '--vscode-button-secondaryBackground': '#3a3d41',
      '--vscode-button-secondaryHoverBackground': '#45494e',
      '--vscode-radio-activeForeground': '#3794ff',
      '--vscode-checkbox-background': '#3c3c3c',
      '--vscode-checkbox-foreground': '#ffffff',
      '--vscode-checkbox-border': '#3c3c3c',
      '--vscode-list-activeSelectionBackground': '#094771',
      '--vscode-list-activeSelectionForeground': '#ffffff',
      '--vscode-list-hoverBackground': '#2a2d2e',
      '--vscode-list-hoverForeground': '#ffffff',
      '--vscode-charts-red': '#f14c4c',
      '--vscode-charts-blue': '#3794ff',
      '--vscode-charts-orange': '#d18616',
      '--vscode-charts-green': '#89d185',
      '--vscode-charts-purple': '#b180d7',
      '--vscode-sideBar-background': '#252526',
      '--vscode-sideBar-foreground': '#cccccc',
      '--vscode-panel-background': '#1e1e1e',
      '--vscode-panel-border': '#2a2a2a',
      '--vscode-menu-background': '#252526',
      '--vscode-menu-border': '#454545',
      '--vscode-editorGroup-dropBackground': '#53595d80',
      '--vscode-editorGroup-dropIntoPromptForeground': '#ffffff',
      '--vscode-editorGroup-dropIntoPromptBackground': '#094771',
      '--vscode-gitDecoration-addedResourceForeground': '#89d185',
      '--vscode-gitDecoration-deletedResourceForeground': '#f14c4c',
      '--vscode-terminal-foreground': '#cccccc',
      '--vscode-terminal-background': '#1e1e1e',
      '--vscode-terminal-selectionBackground': '#264f78',
      '--vscode-terminal-inactiveSelectionBackground': '#1f1f1f',
      '--vscode-terminal-ansiBlack': '#000000',
      '--vscode-terminal-ansiRed': '#cd3131',
      '--vscode-terminal-ansiGreen': '#0dbc79',
      '--vscode-terminal-ansiYellow': '#e5e510',
      '--vscode-terminal-ansiBlue': '#2472c8',
      '--vscode-terminal-ansiMagenta': '#bc3fbc',
      '--vscode-terminal-ansiCyan': '#11a8cd',
      '--vscode-terminal-ansiWhite': '#e5e5e5',
      '--vscode-terminal-ansiBrightBlack': '#666666',
      '--vscode-terminal-ansiBrightRed': '#f14c4c',
      '--vscode-terminal-ansiBrightGreen': '#23d18b',
      '--vscode-terminal-ansiBrightYellow': '#f5f543',
      '--vscode-terminal-ansiBrightBlue': '#3b8eea',
      '--vscode-terminal-ansiBrightMagenta': '#d670d6',
      '--vscode-terminal-ansiBrightCyan': '#29b8db',
      '--vscode-terminal-ansiBrightWhite': '#ffffff'
    }
  }
  return {
    ...common,
    '--vscode-foreground': '#333333',
    '--vscode-disabledForeground': '#9a9a9a',
    '--vscode-errorForeground': '#e51400',
    '--vscode-descriptionForeground': '#6f6f6f',
    '--vscode-icon-foreground': '#424242',
    '--vscode-focusBorder': '#007fd4',
    '--vscode-textLink-foreground': '#006ab1',
    '--vscode-textLink-activeForeground': '#006ab1',
    '--vscode-textCodeBlock-background': '#f3f3f3',
    '--vscode-badge-background': '#007acc',
    '--vscode-badge-foreground': '#ffffff',
    '--vscode-scrollbarSlider-background': '#64646433',
    '--vscode-scrollbarSlider-hoverBackground': '#6464644d',
    '--vscode-scrollbarSlider-activeBackground': '#64646466',
    '--vscode-editor-background': '#ffffff',
    '--vscode-editor-foreground': '#333333',
    '--vscode-editorWidget-background': '#f3f3f3',
    '--vscode-editorWidget-foreground': '#333333',
    '--vscode-editorWidget-border': '#c8c8c8',
    '--vscode-editorWarning-foreground': '#bf8803',
    '--vscode-toolbar-hoverBackground': '#e4e4e4',
    '--vscode-input-background': '#ffffff',
    '--vscode-input-foreground': '#333333',
    '--vscode-input-border': '#c8c8c8',
    '--vscode-input-placeholderForeground': '#6f6f6f',
    '--vscode-inputValidation-infoBackground': '#d6f0ff',
    '--vscode-inputValidation-warningBackground': '#fff4ce',
    '--vscode-inputValidation-warningBorder': '#bf8803',
    '--vscode-inputValidation-errorBackground': '#fde7e9',
    '--vscode-inputValidation-errorBorder': '#e51400',
    '--vscode-dropdown-background': '#ffffff',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-background': '#0f6cbd',
    '--vscode-button-secondaryBackground': '#e5e5e5',
    '--vscode-button-secondaryHoverBackground': '#d0d0d0',
    '--vscode-radio-activeForeground': '#0f6cbd',
    '--vscode-checkbox-background': '#ffffff',
    '--vscode-checkbox-foreground': '#333333',
    '--vscode-checkbox-border': '#c8c8c8',
    '--vscode-list-activeSelectionBackground': '#e5f1fb',
    '--vscode-list-activeSelectionForeground': '#333333',
    '--vscode-list-hoverBackground': '#f2f2f2',
    '--vscode-list-hoverForeground': '#333333',
    '--vscode-charts-red': '#d13438',
    '--vscode-charts-blue': '#0078d4',
    '--vscode-charts-orange': '#d18616',
    '--vscode-charts-green': '#107c10',
    '--vscode-charts-purple': '#5c2d91',
    '--vscode-sideBar-background': '#f3f3f3',
    '--vscode-sideBar-foreground': '#333333',
    '--vscode-panel-background': '#ffffff',
    '--vscode-panel-border': '#e5e5e5',
    '--vscode-menu-background': '#ffffff',
    '--vscode-menu-border': '#c8c8c8',
    '--vscode-editorGroup-dropBackground': '#cce8ff',
    '--vscode-editorGroup-dropIntoPromptForeground': '#333333',
    '--vscode-editorGroup-dropIntoPromptBackground': '#e5f1fb',
    '--vscode-gitDecoration-addedResourceForeground': '#107c10',
    '--vscode-gitDecoration-deletedResourceForeground': '#d13438',
    '--vscode-terminal-foreground': '#333333',
    '--vscode-terminal-background': '#ffffff',
    '--vscode-terminal-selectionBackground': '#cce8ff',
    '--vscode-terminal-inactiveSelectionBackground': '#e5e5e5',
    '--vscode-terminal-ansiBlack': '#000000',
    '--vscode-terminal-ansiRed': '#cd3131',
    '--vscode-terminal-ansiGreen': '#00bc00',
    '--vscode-terminal-ansiYellow': '#949800',
    '--vscode-terminal-ansiBlue': '#0451a5',
    '--vscode-terminal-ansiMagenta': '#bc05bc',
    '--vscode-terminal-ansiCyan': '#0598bc',
    '--vscode-terminal-ansiWhite': '#555555',
    '--vscode-terminal-ansiBrightBlack': '#666666',
    '--vscode-terminal-ansiBrightRed': '#cd3131',
    '--vscode-terminal-ansiBrightGreen': '#14ce14',
    '--vscode-terminal-ansiBrightYellow': '#b5ba00',
    '--vscode-terminal-ansiBrightBlue': '#0451a5',
    '--vscode-terminal-ansiBrightMagenta': '#bc05bc',
    '--vscode-terminal-ansiBrightCyan': '#0598bc',
    '--vscode-terminal-ansiBrightWhite': '#ffffff'
  }
}

const themePayload = computed(() => {
  const kind = themeStore.effectiveTheme
  return {
    __logosTheme: true,
    kind,
    name: kind === 'dark' ? 'Logos Dark' : 'Logos Light',
    variables: baseThemeVariables(kind)
  }
})

const createNonce = () => {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(36).slice(2)
}

const buildWebviewCsp = (nonce: string) => {
  return [
    "default-src 'none'",
    "img-src logos-extension: https: data: blob:",
    `script-src logos-extension: 'nonce-${nonce}' 'unsafe-inline' 'wasm-unsafe-eval'`,
    `script-src-elem logos-extension: 'nonce-${nonce}' 'unsafe-inline' 'wasm-unsafe-eval'`,
    "style-src logos-extension: 'unsafe-inline'",
    "style-src-elem logos-extension: 'unsafe-inline'",
    "font-src logos-extension: data:",
    "worker-src logos-extension: blob:",
    "connect-src logos-extension: https: http: ws: wss:"
  ].join('; ') + ';'
}

const injectHeadContent = (html: string, content: string) => {
  const metaPattern = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>\s*/gi
  const stripped = html.replace(metaPattern, '')
  if (/<head[^>]*>/i.test(stripped)) {
    return stripped.replace(/<head[^>]*>/i, (match) => `${match}\n    ${content}`)
  }
  return `${content}\n${stripped}`
}

const injectCsp = (html: string, nonce: string, extraContent?: string) => {
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${buildWebviewCsp(nonce)}">`
  const combined = extraContent ? `${metaTag}\n    ${extraContent}` : metaTag
  return injectHeadContent(html, combined)
}

const buildThemeBootstrap = (payload: { kind: string; name: string; variables: Record<string, string> }, nonce: string) => {
  return `
    <script nonce="${nonce}">
      (function () {
        const applyTheme = (data) => {
          if (!data || !data.kind || !data.variables) {
            return;
          }
          const themeClass = data.kind === 'dark' ? 'vscode-dark' : 'vscode-light';
          const root = document.documentElement;
          const body = document.body;
          root.classList.remove('vscode-dark', 'vscode-light', 'vscode-high-contrast', 'vscode-high-contrast-light');
          root.classList.add(themeClass);
          root.setAttribute('data-vscode-theme-kind', themeClass);
          root.setAttribute('data-vscode-theme-name', data.name || themeClass);
          root.setAttribute('data-codex-window-type', 'electron');
          root.style.colorScheme = data.kind;
          if (body) {
            body.classList.remove('vscode-dark', 'vscode-light', 'vscode-high-contrast', 'vscode-high-contrast-light');
            body.classList.add(themeClass);
            body.setAttribute('data-vscode-theme-kind', themeClass);
            body.setAttribute('data-vscode-theme-name', data.name || themeClass);
            body.setAttribute('data-codex-window-type', 'electron');
          }
          for (const [key, value] of Object.entries(data.variables)) {
            root.style.setProperty(key, value);
          }
        };
        applyTheme(${JSON.stringify(payload)});
        window.addEventListener('message', (event) => {
          const data = event.data;
          if (data && data.__logosTheme) {
            applyTheme(data);
          }
        });
      })();
    <${'/'}script>
  `
}

const srcdoc = computed(() => {
  if (!props.html) {
    return ''
  }
  if (!props.enableScripts || !props.handle) {
    return props.html
  }
  const nonce = createNonce()
  const themeBootstrap = buildThemeBootstrap(themePayload.value, nonce)
  const bridge = `
    <script nonce="${nonce}">
      (function () {
        let state = null;
        const vscode = {
          postMessage: (message) => {
            window.parent.postMessage({ __logosWebview: true, handle: '${props.handle}', message }, '*')
          },
          setState: (newState) => {
            state = newState;
            return state;
          },
          getState: () => state
        };
        window.acquireVsCodeApi = () => vscode;
      })();
    <${'/'}script>
  `
  const withCsp = injectCsp(props.html, nonce, themeBootstrap)
  if (withCsp.includes('</body>')) {
    return withCsp.replace('</body>', `${bridge}</body>`)
  }
  return `${withCsp}${bridge}`
})

const forwardMessage = (message: unknown) => {
  if (!iframeRef.value?.contentWindow) {
    return
  }
  iframeRef.value.contentWindow.postMessage(message, '*')
}

const handleWindowMessage = (event: MessageEvent) => {
  if (!props.handle || !iframeRef.value?.contentWindow) {
    return
  }
  if (event.source !== iframeRef.value.contentWindow) {
    return
  }
  const data = event.data as { __logosWebview?: boolean; handle?: string; message?: unknown }
  if (!data || !data.__logosWebview || data.handle !== props.handle) {
    return
  }
  extensionUiStore.postWebviewMessage(props.handle, data.message)
}

const subscribeMessages = (handle: string | null) => {
  if (!handle) {
    return
  }
  unsubscribeMessage = extensionUiStore.onWebviewMessage(handle, (message) => {
    forwardMessage(message)
  })
}

watch(
  () => themePayload.value,
  (payload) => {
    forwardMessage(payload)
  },
  { immediate: true, deep: true }
)

watch(
  () => props.handle,
  (nextHandle, _prevHandle) => {
    if (unsubscribeMessage) {
      unsubscribeMessage()
      unsubscribeMessage = null
    }
    subscribeMessages(nextHandle)
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('message', handleWindowMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage)
  if (unsubscribeMessage) {
    unsubscribeMessage()
    unsubscribeMessage = null
  }
})
</script>

<template>
  <iframe
    ref="iframeRef"
    class="extension-webview-frame"
    :sandbox="sandbox"
    :srcdoc="srcdoc"
  ></iframe>
</template>

<style scoped>
.extension-webview-frame {
  border: none;
  width: 100%;
  height: 100%;
  background: transparent;
}
</style>
