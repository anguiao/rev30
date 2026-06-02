import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UserAvatar from '../../../src/features/users/UserAvatar.vue'

function mountAvatar(props: InstanceType<typeof UserAvatar>['$props']) {
  return mount(UserAvatar, {
    props,
  })
}

describe('UserAvatar', () => {
  it('renders a default initial when avatar id is missing', () => {
    const wrapper = mountAvatar({
      avatarId: null,
      nickname: 'Ada Lovelace',
      username: 'ada',
    })

    expect(wrapper.text()).toContain('A')
  })

  it('falls back to username when nickname is blank', () => {
    const wrapper = mountAvatar({
      avatarId: null,
      nickname: '   ',
      username: 'grace',
    })

    expect(wrapper.text()).toContain('G')
  })

  it('renders stable avatar images when available', () => {
    const wrapper = mountAvatar({
      avatarId: '11111111-1111-4111-8111-111111111111',
      nickname: 'Ada Lovelace',
      username: 'ada',
    })

    const img = wrapper.get('img')
    expect(img.attributes('src')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111/content',
    )
  })

  it('falls back to initials when image loading fails', async () => {
    const wrapper = mountAvatar({
      avatarId: '22222222-2222-4222-8222-222222222222',
      nickname: 'Alan Turing',
      username: 'alan',
    })

    await wrapper.get('img').trigger('error')
    expect(wrapper.text()).toContain('A')
  })
})
