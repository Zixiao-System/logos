<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRemoteStore } from '@/stores/remote'
import type { SSHConnectionConfig, AuthMethod } from '@/stores/remote'

const remoteStore = useRemoteStore()

const props = defineProps<{
  visible: boolean
  editConfig?: SSHConnectionConfig | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'connected', connectionId: string): void
}>()

const form = reactive<SSHConnectionConfig>({
  name: '',
  host: '',
  port: 22,
  username: '',
  authMethod: 'key' as AuthMethod,
  password: '',
  privateKeyPath: '',
  passphrase: '',
  remoteWorkspacePath: '/home',
  keepAliveInterval: 30
})

const isTesting = ref(false)
const testResult = ref<{ success: boolean; error?: string } | null>(null)
const isSubmitting = ref(false)
const submitError = ref<string | null>(null)

// Reset form when dialog opens
const resetForm = () => {
  if (props.editConfig) {
    Object.assign(form, props.editConfig)
  } else {
    form.name = ''
    form.host = ''
    form.port = 22
    form.username = ''
    form.authMethod = 'key'
    form.password = ''
    form.privateKeyPath = ''
    form.passphrase = ''
    form.remoteWorkspacePath = '/home'
    form.keepAliveInterval = 30
  }
  testResult.value = null
  submitError.value = null
}

const handleClose = () => {
  resetForm()
  emit('close')
}

const handleTestConnection = async () => {
  isTesting.value = true
  testResult.value = null

  try {
    testResult.value = await remoteStore.testConnection(form)
  } catch (error) {
    testResult.value = { success: false, error: (error as Error).message }
  } finally {
    isTesting.value = false
  }
}

const handleConnect = async () => {
  isSubmitting.value = true
  submitError.value = null

  try {
    // Save the connection first
    await remoteStore.saveConnection(form)

    // Connect
    const success = await remoteStore.connect(form)
    if (success) {
      const activeConn = remoteStore.activeConnection
      if (activeConn) {
        emit('connected', activeConn.id)
      }
      handleClose()
    } else {
      submitError.value = remoteStore.connectionError ?? 'Connection failed'
    }
  } catch (error) {
    submitError.value = (error as Error).message
  } finally {
    isSubmitting.value = false
  }
}

const handleSaveOnly = async () => {
  await remoteStore.saveConnection(form)
  handleClose()
}

const handleBrowseKey = async () => {
  if (!window.electronAPI?.fileSystem) return
  const result = await window.electronAPI.fileSystem.openFileDialog({
    filters: [{ name: 'SSH Keys', extensions: ['pem', 'key', ''] }]
  })
  if (result && typeof result === 'string') {
    form.privateKeyPath = result
  }
}

defineExpose({ resetForm })
</script>

<template>
  <mdui-dialog
    :open="visible"
    :headline="editConfig ? '编辑连接' : '新建 SSH 连接'"
    close-on-esc
    close-on-overlay-click
    @close="handleClose"
    class="remote-connection-dialog"
  >
    <div class="dialog-body">
      <div class="form-group">
        <label for="connection-name">连接名称</label>
        <input id="connection-name" v-model="form.name" type="text" placeholder="My Server" />
      </div>

      <div class="form-row">
        <div class="form-group flex-grow">
          <label for="host-address">主机地址</label>
          <input id="host-address" v-model="form.host" type="text" placeholder="192.168.1.100" />
        </div>
        <div class="form-group port-field">
          <label for="port">端口</label>
          <input id="port" v-model.number="form.port" type="number" min="1" max="65535" />
        </div>
      </div>

      <div class="form-group">
        <label for="username">用户名</label>
        <input id="username" v-model="form.username" type="text" placeholder="root" />
      </div>

      <div class="form-group">
        <label for="auth-method">认证方式</label>
        <select id="auth-method" v-model="form.authMethod">
          <option value="key">SSH 密钥</option>
          <option value="password">密码</option>
          <option value="agent">SSH Agent</option>
        </select>
      </div>

      <div v-if="form.authMethod === 'password'" class="form-group">
        <label for="password">密码</label>
        <input id="password" v-model="form.password" type="password" placeholder="输入密码" />
      </div>

      <div v-if="form.authMethod === 'key'" class="form-group">
        <label for="private-key-path">私钥路径</label>
        <div class="input-with-button">
          <input id="private-key-path" v-model="form.privateKeyPath" type="text" placeholder="~/.ssh/id_rsa" />
          <button type="button" class="browse-btn" @click="handleBrowseKey">浏览</button>
        </div>
      </div>

      <div v-if="form.authMethod === 'key'" class="form-group">
        <label for="passphrase">密钥密码 (可选)</label>
        <input id="passphrase" v-model="form.passphrase" type="password" placeholder="密钥密码" />
      </div>

      <div class="form-group">
        <label for="remote-workspace">远程工作目录</label>
        <input id="remote-workspace" v-model="form.remoteWorkspacePath" type="text" placeholder="/home/user/project" />
      </div>

      <!-- Test result -->
      <div v-if="testResult" class="test-result" :class="{ success: testResult.success, error: !testResult.success }" role="alert">
        <span v-if="testResult.success">连接测试成功</span>
        <span v-else>连接测试失败: {{ testResult.error }}</span>
      </div>

      <!-- Submit error -->
      <div v-if="submitError" class="test-result error" role="alert">
        {{ submitError }}
      </div>
    </div>

    <mdui-button slot="action" variant="text" @click="handleTestConnection" :disabled="isTesting || !form.host || !form.username">
      {{ isTesting ? '测试中...' : '测试连接' }}
    </mdui-button>
    <mdui-button slot="action" variant="text" @click="handleSaveOnly">
      仅保存
    </mdui-button>
    <mdui-button slot="action" variant="filled" @click="handleConnect" :disabled="isSubmitting || !form.host || !form.username">
      {{ isSubmitting ? '连接中...' : '连接' }}
    </mdui-button>
  </mdui-dialog>
</template>

<style scoped>
.remote-connection-dialog {
  --mdui-dialog-max-width: 480px;
}

.remote-connection-dialog::part(panel) {
  max-height: 80vh;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--mdui-color-on-surface-variant);
}

.form-group input,
.form-group select {
  padding: 8px 12px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 6px;
  background: var(--mdui-color-surface);
  color: var(--mdui-color-on-surface);
  font-size: 13px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--mdui-color-primary);
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-grow {
  flex: 1;
}

.port-field {
  width: 100px;
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button input {
  flex: 1;
}

.browse-btn {
  padding: 8px 12px;
  border: 1px solid var(--mdui-color-outline-variant);
  border-radius: 6px;
  background: var(--mdui-color-surface-container-high);
  color: var(--mdui-color-on-surface);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.browse-btn:hover {
  background: var(--mdui-color-surface-container-highest);
}

.test-result {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
}

.test-result.success {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
}

.test-result.error {
  background: rgba(244, 67, 54, 0.15);
  color: #f44336;
}
</style>
