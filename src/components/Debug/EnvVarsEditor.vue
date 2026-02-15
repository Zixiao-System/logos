<template>
  <div class="env-vars-editor">
    <div class="env-row" v-for="(entry, index) in entries" :key="index">
      <mdui-text-field
        :value="entry.key"
        @input="handleKeyChange(index, $event)"
        variant="outlined"
        placeholder="KEY"
        class="env-key"
      ></mdui-text-field>
      <span class="env-eq">=</span>
      <mdui-text-field
        :value="entry.value"
        @input="handleValueChange(index, $event)"
        variant="outlined"
        placeholder="value"
        class="env-value"
      ></mdui-text-field>
      <mdui-button-icon @click="removeEntry(index)" title="删除">
        <mdui-icon-close></mdui-icon-close>
      </mdui-button-icon>
    </div>
    <mdui-button variant="text" @click="addEntry" class="add-btn">
      <mdui-icon-add slot="icon"></mdui-icon-add>
      添加环境变量
    </mdui-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import '@mdui/icons/close.js'
import '@mdui/icons/add.js'

const props = defineProps<{
  modelValue: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, string>): void
}>()

interface EnvEntry {
  key: string
  value: string
}

const entries = computed<EnvEntry[]>(() => {
  const env = props.modelValue || {}
  return Object.entries(env).map(([key, value]) => ({ key, value }))
})

function emitUpdate(newEntries: EnvEntry[]) {
  const env: Record<string, string> = {}
  for (const entry of newEntries) {
    if (entry.key) {
      env[entry.key] = entry.value
    }
  }
  emit('update:modelValue', env)
}

function handleKeyChange(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const newEntries = [...entries.value]
  newEntries[index] = { ...newEntries[index], key: target.value }
  emitUpdate(newEntries)
}

function handleValueChange(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const newEntries = [...entries.value]
  newEntries[index] = { ...newEntries[index], value: target.value }
  emitUpdate(newEntries)
}

function addEntry() {
  const newEntries = [...entries.value, { key: '', value: '' }]
  emitUpdate(newEntries)
}

function removeEntry(index: number) {
  const newEntries = entries.value.filter((_, i) => i !== index)
  emitUpdate(newEntries)
}
</script>

<style scoped>
.env-vars-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.env-key {
  flex: 2;
}

.env-eq {
  color: var(--mdui-color-on-surface-variant);
  font-size: 14px;
  font-weight: 500;
}

.env-value {
  flex: 3;
}

.env-row mdui-button-icon {
  --mdui-comp-icon-button-size: 28px;
  flex-shrink: 0;
}

.add-btn {
  align-self: flex-start;
}
</style>
