/* eslint-disable @typescript-eslint/naming-convention */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import ChatReasoningBlock from '@/components/ChatReasoningBlock.vue'

const markdownRendererMock = defineComponent({
  props: {
    content: { type: String, required: true },
  },
  template: '<div>{{ content }}</div>',
})

describe('ChatReasoningBlock', () => {
  it('renders reasoning content when provided', () => {
    const wrapper = mount(ChatReasoningBlock, {
      props: {
        reasoning: 'I am thinking about the answer.',
        isStreaming: false,
      },
      global: {
        stubs: {
          MarkdownRenderer: markdownRendererMock,
        },
      },
    })
    expect(wrapper.find('[data-testid="reasoning-content"]').text()).toContain(
      'I am thinking about the answer.'
    )
  })

  it('shows "Thinking…" when streaming', () => {
    const wrapper = mount(ChatReasoningBlock, {
      props: {
        reasoning: 'Thinking...',
        isStreaming: true,
      },
      global: {
        stubs: {
          MarkdownRenderer: markdownRendererMock,
        },
      },
    })
    expect(wrapper.find('[data-testid="reasoning-summary"]').text()).toContain('Thinking…')
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
  })

  it('shows "Reasoning" when not streaming', () => {
    const wrapper = mount(ChatReasoningBlock, {
      props: {
        reasoning: 'Thought complete.',
        isStreaming: false,
      },
      global: {
        stubs: {
          MarkdownRenderer: markdownRendererMock,
        },
      },
    })
    expect(wrapper.find('[data-testid="reasoning-summary"]').text()).toContain('Reasoning')
    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
  })

  it('calculates token count correctly (heuristic)', () => {
    const reasoning = '12345678' // 8 chars -> 2 tokens
    const wrapper = mount(ChatReasoningBlock, {
      props: {
        reasoning,
        isStreaming: false,
      },
      global: {
        stubs: {
          MarkdownRenderer: markdownRendererMock,
        },
      },
    })
    expect(wrapper.find('[data-testid="reasoning-tokens"]').text()).toBe('2 tokens')
  })
})
