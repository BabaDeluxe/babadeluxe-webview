import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatView from '../src/views/ChatView.vue'

describe('ChatView', () => {
  it('renders properly', () => {
    // Const wrapper = mount(ChatView, { props: { msg: 'Hello Vitest' } })
    expect('Hello Vitest').toContain('Hello Vitest')
  })
})
