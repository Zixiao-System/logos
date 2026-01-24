/**
 * ExtensionsPanel 组件单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useExtensionsStore } from '@/stores/extensions'
import type { LocalExtensionInfo } from '@/types'
import ExtensionsPanel from '@/components/Extensions/ExtensionsPanel.vue'

describe('ExtensionsPanel', () => {
  const createExtension = (overrides: Partial<LocalExtensionInfo> = {}): LocalExtensionInfo => ({
    id: 'publisher.sample',
    name: 'sample',
    publisher: 'publisher',
    version: '1.0.0',
    displayName: 'Sample',
    description: 'Sample extension',
    path: '/Users/test/extensions/publisher.sample',
    enabled: true,
    iconPath: '/Users/test/extensions/publisher.sample/icon.png',
    ...overrides
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should render icon with logos-extension scheme', () => {
    const extensionsStore = useExtensionsStore()
    const pinia = extensionsStore.$pinia
    extensionsStore.loading = false
    extensionsStore.extensions = [
      createExtension({ iconPath: 'C:\\Users\\me\\My Icon.png' })
    ]

    const wrapper = mount(ExtensionsPanel, {
      global: {
        plugins: [pinia]
      }
    })

    const icon = wrapper.find('img.extension-icon')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('src')).toBe('logos-extension://C:/Users/me/My%20Icon.png')
  })
})
