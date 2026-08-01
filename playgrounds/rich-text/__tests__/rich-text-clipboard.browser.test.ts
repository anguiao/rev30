import { afterEach, expect, test } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import RichTextEditorHarness from './fixtures/RichTextEditorHarness.vue'

afterEach(async () => {
  await commands.setClipboard('')
})

test('applies link-on-paste through the native clipboard shortcut', async () => {
  const screen = render(RichTextEditorHarness)
  await screen.getByTestId('set-paste-document').click()
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await userEvent.click(editable)
  await userEvent.keyboard('{ControlOrMeta>}{a}{/ControlOrMeta}')
  await commands.setClipboard('https://example.com/pasted')

  if (navigator.userAgent.includes('Macintosh')) {
    await userEvent.keyboard('{Meta>}{v}{/Meta}')
  } else {
    await userEvent.keyboard('{Control>}{v}{/Control}')
  }

  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"link"')
  await expect
    .element(screen.getByTestId('model-json'))
    .toHaveTextContent('https://example.com/pasted')
})
