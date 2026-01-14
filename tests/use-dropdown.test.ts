/**
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, h } from 'vue'

describe('useDropdown with VueUse onClickOutside', () => {
  let useDropdown: any

  beforeEach(async () => {
    vi.resetModules()
    const module = await import('@/composables/use-dropdown')
    useDropdown = module.useDropdown
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createTestComponent() {
    return defineComponent({
      setup() {
        const dropdown = useDropdown()
        return { dropdown }
      },
      render() {
        return h('div', { ref: (el) => (this.dropdown.containerRef.value = el as HTMLElement) }, [
          h('button', { onClick: () => this.dropdown.toggle(), class: 'trigger' }, 'Toggle'),
          this.dropdown.isOpen.value ? h('div', { class: 'menu' }, 'Menu') : null,
        ])
      },
    })
  }

  describe('basic functionality', () => {
    it('should initialize with isOpen = false', () => {
      const wrapper = mount(createTestComponent())
      expect(wrapper.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should toggle open on first toggle()', async () => {
      const wrapper = mount(createTestComponent())
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)
    })

    it('should toggle closed on second toggle()', async () => {
      const wrapper = mount(createTestComponent())
      wrapper.vm.dropdown.toggle()
      await nextTick()
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should close when close() is called', async () => {
      const wrapper = mount(createTestComponent())
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)
      wrapper.vm.dropdown.close()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should not error when close() is called while already closed', () => {
      const wrapper = mount(createTestComponent())
      expect(() => wrapper.vm.dropdown.close()).not.toThrow()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should provide a containerRef', () => {
      const wrapper = mount(createTestComponent())
      expect(wrapper.vm.dropdown.containerRef).toBeDefined()
    })
  })

  describe('outside click behavior', () => {
    it('should close dropdown on outside click', async () => {
      const wrapper = mount(createTestComponent(), { attachTo: document.body })
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)

      const outsideElement = document.createElement('div')
      document.body.appendChild(outsideElement)
      outsideElement.click()
      await nextTick()

      expect(wrapper.vm.dropdown.isOpen.value).toBe(false)
      document.body.removeChild(outsideElement)
      wrapper.unmount()
    })

    it('should NOT close dropdown on inside click', async () => {
      const wrapper = mount(createTestComponent(), { attachTo: document.body })
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)

      const menu = wrapper.element.querySelector('.menu') as HTMLElement
      menu.click()
      await nextTick()

      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)
      wrapper.unmount()
    })

    it('should NOT close dropdown when clicking trigger', async () => {
      const wrapper = mount(createTestComponent(), { attachTo: document.body })
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)

      const trigger = wrapper.element.querySelector('.trigger') as HTMLElement
      trigger.click()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(false)
      wrapper.unmount()
    })
  })

  describe('multiple independent dropdowns', () => {
    it('should allow multiple dropdowns open simultaneously', async () => {
      const wrapper1 = mount(createTestComponent())
      const wrapper2 = mount(createTestComponent())
      const wrapper3 = mount(createTestComponent())

      wrapper1.vm.dropdown.toggle()
      await nextTick()
      wrapper2.vm.dropdown.toggle()
      await nextTick()
      wrapper3.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper1.vm.dropdown.isOpen.value).toBe(true)
      expect(wrapper2.vm.dropdown.isOpen.value).toBe(true)
      expect(wrapper3.vm.dropdown.isOpen.value).toBe(true)
    })

    it('should close each dropdown independently', async () => {
      const wrapper1 = mount(createTestComponent(), { attachTo: document.body })
      const wrapper2 = mount(createTestComponent(), { attachTo: document.body })

      wrapper1.vm.dropdown.toggle()
      wrapper2.vm.dropdown.toggle()
      await nextTick()

      wrapper1.vm.dropdown.close()
      await nextTick()

      expect(wrapper1.vm.dropdown.isOpen.value).toBe(false)
      expect(wrapper2.vm.dropdown.isOpen.value).toBe(true)

      wrapper1.unmount()
      wrapper2.unmount()
    })
  })

  describe('DOM hierarchy (natural nesting)', () => {
    it('should not close parent dropdown when clicking child dropdown', async () => {
      const parentComponent = defineComponent({
        setup() {
          const dropdown = useDropdown()
          return { dropdown }
        },
        render() {
          return h('div', { ref: (el) => (this.dropdown.containerRef.value = el as HTMLElement) }, [
            h(
              'button',
              { onClick: () => this.dropdown.toggle(), class: 'parent-trigger' },
              'Parent'
            ),
            this.dropdown.isOpen.value
              ? h('div', { class: 'parent-menu' }, [h(childComponent)])
              : null,
          ])
        },
      })

      const childComponent = defineComponent({
        setup() {
          const dropdown = useDropdown()
          return { dropdown }
        },
        render() {
          return h('div', { ref: (el) => (this.dropdown.containerRef.value = el as HTMLElement) }, [
            h('button', { onClick: () => this.dropdown.toggle(), class: 'child-trigger' }, 'Child'),
            this.dropdown.isOpen.value ? h('div', { class: 'child-menu' }, 'Child Menu') : null,
          ])
        },
      })

      const wrapper = mount(parentComponent, { attachTo: document.body })
      wrapper.vm.dropdown.toggle()
      await nextTick()

      const childTrigger = wrapper.element.querySelector('.child-trigger') as HTMLElement
      childTrigger.click()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)
      wrapper.unmount()
    })
  })

  describe('cleanup', () => {
    it('should not throw after unmounting', async () => {
      const wrapper = mount(createTestComponent(), { attachTo: document.body })
      wrapper.vm.dropdown.toggle()
      await nextTick()

      wrapper.unmount()
      await nextTick()

      const outsideElement = document.createElement('div')
      document.body.appendChild(outsideElement)
      expect(() => {
        outsideElement.click()
      }).not.toThrow()
      document.body.removeChild(outsideElement)
    })
  })
})
