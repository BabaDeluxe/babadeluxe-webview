/* eslint-disable @typescript-eslint/naming-convention */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import OllamaSection from '@/components/settings/OllamaSection.vue'

describe('OllamaSection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  const globalConfig = {
    stubs: {
      BaseButton: {
        template: '<button><slot /></button>',
      },
      BaseInput: {
        template:
          '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        props: ['modelValue'],
      },
      BaseSpinner: true,
    },
  }

  it('renders correctly', () => {
    const wrapper = mount(OllamaSection, {
      props: { modelValue: 'http://localhost:11434' },
      global: globalConfig,
    })
    expect(wrapper.find('[data-testid="ollama-section"]').exists()).toBe(true)
    expect(wrapper.find('input').element.value).toBe('http://localhost:11434')
  })

  it('validates URL and enables/disables test button', async () => {
    const wrapper = mount(OllamaSection, {
      props: { modelValue: 'not-a-url' },
      global: {
        stubs: {
          BaseButton: {
            template: '<button :disabled="disabled"><slot /></button>',
            props: ['disabled'],
          },
          BaseInput: true,
          BaseSpinner: true,
        },
      },
    })

    const button = wrapper.find('button')
    expect(button.element.disabled).toBe(true)

    await wrapper.setProps({ modelValue: 'http://localhost:11434' })
    expect(button.element.disabled).toBe(false)
  })

  it('shows success message on successful connection', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const wrapper = mount(OllamaSection, {
      props: { modelValue: 'http://localhost:11434' },
      global: globalConfig,
    })

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('[data-testid="ollama-test-result"]').text()).toContain(
      'Successfully connected'
    )
  })
})
