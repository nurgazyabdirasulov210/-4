import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'task-progress',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

test('панель показывает действие, время и оценку остатка', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let t = 1_000_000
  on('clock.now', () => ({ value: (t += 1000) }))
  on('clock.every', () => ({ value: { cancel() {} } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({}))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'сделай' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'a', status: 'completed', activeForm: 'a' },
      { content: 'b', status: 'pending', activeForm: 'b' },
    ],
  })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = (await ui.find({ type: 'Text', text: /Прошло/ }))?.text ?? ''
  expect(text).toMatch(/Шагов: 2/)
  expect(text).toMatch(/50%/)
  expect(text).toMatch(/Осталось/)
  expect((await ui.find({ type: 'Text', text: /Bash/ }))?.text).toMatch(/Bash: ls/)
  await ui.unmount()
})
