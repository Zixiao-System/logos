/**
 * BreakpointsPanel component tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useDebugStore } from '@/stores/debug'
import { resetAllMocks } from '../../../setup'
import BreakpointsPanel from '@/components/Debug/BreakpointsPanel.vue'

describe('BreakpointsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetAllMocks()
  })

  function mountPanel() {
    return mount(BreakpointsPanel, {
      global: {
        stubs: {
          'mdui-button-icon': true,
          'mdui-checkbox': {
            template: '<input type="checkbox" :checked="$attrs.checked" @change="$emit(\'change\')" />',
            inheritAttrs: false
          },
          'mdui-icon-toggle-on': true,
          'mdui-icon-toggle-off': true,
          'mdui-icon-delete-sweep': true,
          'mdui-icon-close': true,
          'mdui-icon-radio-button-unchecked': true,
          'mdui-divider': true
        }
      }
    })
  }

  it('shows empty state when no breakpoints and no filters', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('没有断点')
  })

  it('renders breakpoints list', () => {
    const store = useDebugStore()
    store.addBreakpoint({
      id: 'bp_1', verified: true, source: { path: '/src/main.ts' },
      line: 10, enabled: true, type: 'line'
    })
    store.addBreakpoint({
      id: 'bp_2', verified: true, source: { path: '/src/utils.ts' },
      line: 5, enabled: true, type: 'conditional', condition: 'x > 5'
    })

    const wrapper = mountPanel()

    const items = wrapper.findAll('.breakpoint-item')
    expect(items).toHaveLength(2)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('shows breakpoint location correctly', () => {
    const store = useDebugStore()
    store.addBreakpoint({
      id: 'bp_1', verified: true, source: { path: '/src/main.ts' },
      line: 42, enabled: true, type: 'line'
    })

    const wrapper = mountPanel()

    expect(wrapper.find('.breakpoint-location').text()).toContain('main.ts:42')
  })

  it('shows condition text for conditional breakpoints', () => {
    const store = useDebugStore()
    store.addBreakpoint({
      id: 'bp_1', verified: true, source: { path: '/test.js' },
      line: 10, enabled: true, type: 'conditional', condition: 'x > 5'
    })

    const wrapper = mountPanel()

    expect(wrapper.find('.breakpoint-condition').text()).toContain('x > 5')
  })

  it('shows log message for logpoints', () => {
    const store = useDebugStore()
    store.addBreakpoint({
      id: 'bp_1', verified: true, source: { path: '/test.js' },
      line: 10, enabled: true, type: 'logpoint', logMessage: 'value: {x}'
    })

    const wrapper = mountPanel()

    expect(wrapper.find('.breakpoint-log').text()).toContain('value: {x}')
  })

  it('applies disabled class when breakpoint is disabled', () => {
    const store = useDebugStore()
    store.addBreakpoint({
      id: 'bp_1', verified: true, source: { path: '/test.js' },
      line: 10, enabled: false, type: 'line'
    })

    const wrapper = mountPanel()

    expect(wrapper.find('.breakpoint-item.disabled').exists()).toBe(true)
  })

  describe('Exception filters', () => {
    it('hides exception filters section when none exist', () => {
      const wrapper = mountPanel()

      expect(wrapper.find('.exception-filters').exists()).toBe(false)
    })

    it('shows exception filters section when filters exist', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught Exceptions', default: false },
        { filter: 'uncaught', label: 'Uncaught Exceptions', default: true }
      ])

      const wrapper = mountPanel()

      expect(wrapper.find('.exception-filters').exists()).toBe(true)
      const items = wrapper.findAll('.exception-filter-item')
      expect(items).toHaveLength(2)
    })

    it('displays filter labels', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught Exceptions', default: false }
      ])

      const wrapper = mountPanel()

      expect(wrapper.find('.filter-label').text()).toBe('Caught Exceptions')
    })

    it('displays filter description when provided', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught', description: 'Break on caught exceptions', default: false }
      ])

      const wrapper = mountPanel()

      expect(wrapper.find('.filter-description').text()).toBe('Break on caught exceptions')
    })

    it('shows condition input when filter supports condition and is enabled', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught', default: true, supportsCondition: true }
      ])

      const wrapper = mountPanel()

      expect(wrapper.find('.filter-condition-input').exists()).toBe(true)
    })

    it('hides condition input when filter is disabled', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught', default: false, supportsCondition: true }
      ])

      const wrapper = mountPanel()

      expect(wrapper.find('.filter-condition-input').exists()).toBe(false)
    })

    it('hides empty state when only exception filters exist', () => {
      const store = useDebugStore()
      store.initExceptionFilters([
        { filter: 'caught', label: 'Caught', default: false }
      ])

      const wrapper = mountPanel()

      expect(wrapper.find('.empty-state').exists()).toBe(false)
    })
  })
})
