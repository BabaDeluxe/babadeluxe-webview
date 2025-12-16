/**
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, h } from 'vue'

describe('useDropdown', () => {
  let documentClickHandler: ((event: MouseEvent) => void) | null = null
  let useDropdown: any

  beforeEach(async () => {
    vi.resetModules()

    documentClickHandler = null
    vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'click') {
        documentClickHandler = handler as (event: MouseEvent) => void
      }
    })
    vi.spyOn(document, 'removeEventListener')

    const module = await import('@/composables/use-dropdown-state')
    useDropdown = module.useDropdown
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createTestComponent(nested = false) {
    return defineComponent({
      setup() {
        const dropdown = useDropdown({ nested })
        return { dropdown }
      },
      render() {
        return h('div', { ref: (el) => (this.dropdown.containerRef.value = el as HTMLElement) }, [
          h('button', { onClick: () => this.dropdown.toggle() }, 'Toggle'),
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

  describe('global click handler', () => {
    it('should register global click listener on mount', () => {
      mount(createTestComponent())
      expect(document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })

    it('should register listener only once for multiple dropdowns', () => {
      mount(createTestComponent())
      mount(createTestComponent())
      mount(createTestComponent())
      expect(document.addEventListener).toHaveBeenCalledTimes(1)
    })

    it('should close dropdown on outside click', async () => {
      const wrapper = mount(createTestComponent(), { attachTo: document.body })
      wrapper.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)

      const outsideElement = document.createElement('div')
      document.body.appendChild(outsideElement)
      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: outsideElement, enumerable: true })

      documentClickHandler?.(clickEvent)
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

      const insideElement = wrapper.element.querySelector('.menu') as HTMLElement
      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: insideElement, enumerable: true })

      documentClickHandler?.(clickEvent)
      await nextTick()

      expect(wrapper.vm.dropdown.isOpen.value).toBe(true)
      wrapper.unmount()
    })

    it('should remove global listener when all dropdowns unmount', () => {
      const wrapper1 = mount(createTestComponent())
      const wrapper2 = mount(createTestComponent())
      const wrapper3 = mount(createTestComponent())

      wrapper1.unmount()
      expect(document.removeEventListener).not.toHaveBeenCalled()

      wrapper2.unmount()
      expect(document.removeEventListener).not.toHaveBeenCalled()

      wrapper3.unmount()
      expect(document.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })
  })

  describe('multiple non-nested dropdowns', () => {
    it('should close first dropdown when second opens', async () => {
      const wrapper1 = mount(createTestComponent())
      const wrapper2 = mount(createTestComponent())

      wrapper1.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper1.vm.dropdown.isOpen.value).toBe(true)

      wrapper2.vm.dropdown.toggle()
      await nextTick()
      expect(wrapper1.vm.dropdown.isOpen.value).toBe(false)
      expect(wrapper2.vm.dropdown.isOpen.value).toBe(true)
    })

    it('should only allow one non-nested dropdown open at a time', async () => {
      const wrapper1 = mount(createTestComponent())
      const wrapper2 = mount(createTestComponent())
      const wrapper3 = mount(createTestComponent())

      wrapper1.vm.dropdown.toggle()
      await nextTick()
      wrapper2.vm.dropdown.toggle()
      await nextTick()
      wrapper3.vm.dropdown.toggle()
      await nextTick()

      expect(wrapper1.vm.dropdown.isOpen.value).toBe(false)
      expect(wrapper2.vm.dropdown.isOpen.value).toBe(false)
      expect(wrapper3.vm.dropdown.isOpen.value).toBe(true)
    })
  })

  describe('nested dropdowns', () => {
    it('should keep parent open when nested child opens', async () => {
      const parent = mount(createTestComponent(false))
      const child = mount(createTestComponent(true))

      parent.vm.dropdown.toggle()
      await nextTick()
      expect(parent.vm.dropdown.isOpen.value).toBe(true)

      child.vm.dropdown.toggle()
      await nextTick()
      expect(parent.vm.dropdown.isOpen.value).toBe(true)
      expect(child.vm.dropdown.isOpen.value).toBe(true)
    })

    it('should close child when parent closes', async () => {
      const parent = mount(createTestComponent(false))
      const child = mount(createTestComponent(true))

      parent.vm.dropdown.toggle()
      await nextTick()
      child.vm.dropdown.toggle()
      await nextTick()

      parent.vm.dropdown.close()
      await nextTick()

      expect(parent.vm.dropdown.isOpen.value).toBe(false)
      expect(child.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should keep parent open when only child closes', async () => {
      const parent = mount(createTestComponent(false))
      const child = mount(createTestComponent(true))

      parent.vm.dropdown.toggle()
      await nextTick()
      child.vm.dropdown.toggle()
      await nextTick()

      child.vm.dropdown.close()
      await nextTick()

      expect(parent.vm.dropdown.isOpen.value).toBe(true)
      expect(child.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should support multiple levels of nesting', async () => {
      const level1 = mount(createTestComponent(false))
      const level2 = mount(createTestComponent(true))
      const level3 = mount(createTestComponent(true))

      level1.vm.dropdown.toggle()
      await nextTick()
      level2.vm.dropdown.toggle()
      await nextTick()
      level3.vm.dropdown.toggle()
      await nextTick()

      expect(level1.vm.dropdown.isOpen.value).toBe(true)
      expect(level2.vm.dropdown.isOpen.value).toBe(true)
      expect(level3.vm.dropdown.isOpen.value).toBe(true)

      level2.vm.dropdown.close()
      await nextTick()

      expect(level1.vm.dropdown.isOpen.value).toBe(true)
      expect(level2.vm.dropdown.isOpen.value).toBe(false)
      expect(level3.vm.dropdown.isOpen.value).toBe(false)
    })

    it('should close all nested when clicking outside', async () => {
      const parent = mount(createTestComponent(false), { attachTo: document.body })
      const child = mount(createTestComponent(true), { attachTo: document.body })

      parent.vm.dropdown.toggle()
      await nextTick()
      child.vm.dropdown.toggle()
      await nextTick()

      const outsideElement = document.createElement('div')
      document.body.appendChild(outsideElement)
      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: outsideElement, enumerable: true })

      documentClickHandler?.(clickEvent)
      await nextTick()

      expect(parent.vm.dropdown.isOpen.value).toBe(false)
      expect(child.vm.dropdown.isOpen.value).toBe(false)
      document.body.removeChild(outsideElement)
      parent.unmount()
      child.unmount()
    })

    it('should reset nested dropdown when non-nested opens', async () => {
      const parent = mount(createTestComponent(false))
      const nested = mount(createTestComponent(true))
      const other = mount(createTestComponent(false))

      parent.vm.dropdown.toggle()
      await nextTick()
      nested.vm.dropdown.toggle()
      await nextTick()

      other.vm.dropdown.toggle()
      await nextTick()

      expect(parent.vm.dropdown.isOpen.value).toBe(false)
      expect(nested.vm.dropdown.isOpen.value).toBe(false)
      expect(other.vm.dropdown.isOpen.value).toBe(true)
    })
  })

  describe('cleanup', () => {
    it('should remove containerRef from registry on unmount', async () => {
      const wrapper = mount(createTestComponent())
      wrapper.vm.dropdown.toggle()
      await nextTick()

      wrapper.unmount()
      await nextTick()

      const outsideElement = document.createElement('div')
      document.body.appendChild(outsideElement)
      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: outsideElement, enumerable: true })

      expect(() => documentClickHandler?.(clickEvent)).not.toThrow()
      document.body.removeChild(outsideElement)
    })
  })
})

describe('usePreview', () => {
  let documentClickHandler: ((event: MouseEvent) => void) | null = null
  let usePreview: any

  beforeEach(async () => {
    vi.resetModules()

    documentClickHandler = null
    vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'click') {
        documentClickHandler = handler as (event: MouseEvent) => void
      }
    })
    vi.spyOn(document, 'removeEventListener')

    const module = await import('@/composables/use-dropdown-state')
    usePreview = module.usePreview
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createPreviewComponent() {
    return defineComponent({
      setup() {
        const preview = usePreview()
        return { preview }
      },
      render() {
        return h('div', { ref: (el) => (this.preview.containerRef.value = el as HTMLElement) }, [
          h('button', { onClick: () => this.preview.open() }, 'Open'),
          this.preview.isOpen.value ? h('div', { class: 'preview' }, 'Preview') : null,
        ])
      },
    })
  }

  it('should initialize with isOpen = false', () => {
    const wrapper = mount(createPreviewComponent())
    expect(wrapper.vm.preview.isOpen.value).toBe(false)
  })

  it('should open when open() is called', async () => {
    const wrapper = mount(createPreviewComponent())
    wrapper.vm.preview.open()
    await nextTick()
    expect(wrapper.vm.preview.isOpen.value).toBe(true)
  })

  it('should close when close() is called', async () => {
    const wrapper = mount(createPreviewComponent())
    wrapper.vm.preview.open()
    await nextTick()
    wrapper.vm.preview.close()
    await nextTick()
    expect(wrapper.vm.preview.isOpen.value).toBe(false)
  })

  it('should close on outside click', async () => {
    const wrapper = mount(createPreviewComponent(), { attachTo: document.body })
    wrapper.vm.preview.open()
    await nextTick()

    const outsideElement = document.createElement('div')
    document.body.appendChild(outsideElement)
    const clickEvent = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(clickEvent, 'target', { value: outsideElement, enumerable: true })

    documentClickHandler?.(clickEvent)
    await nextTick()

    expect(wrapper.vm.preview.isOpen.value).toBe(false)
    document.body.removeChild(outsideElement)
    wrapper.unmount()
  })
})

describe('dropdown and preview interaction', () => {
  let useDropdown: any
  let usePreview: any

  beforeEach(async () => {
    vi.resetModules()
    vi.spyOn(document, 'addEventListener')

    const module = await import('@/composables/use-dropdown-state')
    useDropdown = module.useDropdown
    usePreview = module.usePreview
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createDropdownComponent() {
    return defineComponent({
      setup() {
        const dropdown = useDropdown()
        return { dropdown }
      },
      render() {
        return h('div', [h('button', { onClick: () => this.dropdown.toggle() }, 'Toggle')])
      },
    })
  }

  function createPreviewComponent() {
    return defineComponent({
      setup() {
        const preview = usePreview()
        return { preview }
      },
      render() {
        return h('div', [h('button', { onClick: () => this.preview.open() }, 'Open')])
      },
    })
  }

  it('should close dropdown when preview opens', async () => {
    const dropdown = mount(createDropdownComponent())
    const preview = mount(createPreviewComponent())

    dropdown.vm.dropdown.toggle()
    await nextTick()
    expect(dropdown.vm.dropdown.isOpen.value).toBe(true)

    preview.vm.preview.open()
    await nextTick()

    expect(dropdown.vm.dropdown.isOpen.value).toBe(false)
    expect(preview.vm.preview.isOpen.value).toBe(true)
  })

  it('should close preview when dropdown opens', async () => {
    const preview = mount(createPreviewComponent())
    const dropdown = mount(createDropdownComponent())

    preview.vm.preview.open()
    await nextTick()
    expect(preview.vm.preview.isOpen.value).toBe(true)

    dropdown.vm.dropdown.toggle()
    await nextTick()

    expect(preview.vm.preview.isOpen.value).toBe(false)
    expect(dropdown.vm.dropdown.isOpen.value).toBe(true)
  })
})
