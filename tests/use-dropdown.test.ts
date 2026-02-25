/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useDropdown, type UseDropdownOptions } from '@/composables/use-dropdown'

describe('useDropdown()', () => {
  const containers: HTMLElement[] = []

  function setupDropdown(options?: UseDropdownOptions) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    containers.push(container)

    const dropdown = useDropdown(options)
    dropdown.containerRef.value = container

    return { dropdown, container }
  }

  async function clickOutside(): Promise<void> {
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.click()
    await nextTick()
    document.body.removeChild(outside)
  }

  afterEach(() => {
    containers.forEach((el) => document.body.removeChild(el))
    containers.length = 0
  })

  describe('core state management', () => {
    it('toggles open and closed', () => {
      const { dropdown } = setupDropdown()

      dropdown.toggle()
      expect(dropdown.isOpen.value).toBe(true)

      dropdown.toggle()
      expect(dropdown.isOpen.value).toBe(false)
    })

    it('closes programmatically', () => {
      const { dropdown } = setupDropdown()
      dropdown.toggle()

      dropdown.close()

      expect(dropdown.isOpen.value).toBe(false)
    })
  })

  describe('click outside behavior', () => {
    it('closes on outside click', async () => {
      const { dropdown } = setupDropdown()
      dropdown.toggle()

      await clickOutside()

      expect(dropdown.isOpen.value).toBe(false)
    })

    it('stays open when clicking inside container', async () => {
      const { dropdown, container } = setupDropdown()
      dropdown.toggle()

      container.click()
      await nextTick()

      expect(dropdown.isOpen.value).toBe(true)
    })
  })

  describe('ignore configuration (production pattern)', () => {
    it('ignores teleported menu with data-dropdown-layer attribute', async () => {
      const { dropdown } = setupDropdown()
      dropdown.toggle()

      const teleportedMenu = document.createElement('div')
      teleportedMenu.setAttribute('data-dropdown-layer', 'true')
      document.body.appendChild(teleportedMenu)
      containers.push(teleportedMenu)

      teleportedMenu.click()
      await nextTick()

      expect(dropdown.isOpen.value).toBe(true)
    })

    it('ignores custom menu ref (BaseDropdown/BaseDropdownMenu pattern)', async () => {
      const menuRef = ref<HTMLElement>()
      const { dropdown } = setupDropdown({ ignore: [menuRef] })
      dropdown.toggle()

      const menu = document.createElement('div')
      menuRef.value = menu
      document.body.appendChild(menu)
      containers.push(menu)

      menu.click()
      await nextTick()

      expect(dropdown.isOpen.value).toBe(true)
    })

    it('closes when clicking outside all ignored elements', async () => {
      const menuRef = ref<HTMLElement>()
      const { dropdown } = setupDropdown({ ignore: [menuRef] })

      const menu = document.createElement('div')
      menuRef.value = menu
      document.body.appendChild(menu)
      containers.push(menu)

      dropdown.toggle()
      await clickOutside()

      expect(dropdown.isOpen.value).toBe(false)
    })
  })
})
