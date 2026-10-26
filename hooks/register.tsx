import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Progress } from '../types'

const idle: Progress = {
  isRunning: false,
  startedAt: 0,
  nowMs: 0,
  activity: '',
  steps: 0,
  done: 0,
  total: 0,
  lastSeconds: null,
}

const progress = atom({ plugin: 'task-progress', key: 'progress' } as const, idle)

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} мин ${s % 60} с` : `${s} с`
}

const describe = (e: any): string => {
  const target = e.file_path ?? e.command ?? e.pattern ?? e.url ?? e.query ?? e.description ?? ''
  const text = String(target).replace(/\s+/g, ' ').slice(0, 50)
  return text ? `${e.tool}: ${text}` : String(e.tool)
}

export const register: Register = on => {
  const tasks = new Map<string, string>()
  let tick: { cancel: () => void } | undefined

  const stop = () => {
    tick?.cancel()
    tick = undefined
  }

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    tasks.clear()
    stop()
    await update($, progress, p => ({
      ...idle,
      isRunning: true,
      startedAt: now,
      nowMs: now,
      activity: 'Думает…',
      lastSeconds: p.lastSeconds,
    }))
    tick = $.clock.every(1000, async () => {
      const t = await $.clock.now()
      await update($, progress, p => (p.isRunning ? { ...p, nowMs: t } : p))
    })

    return next(e)
  })

  on('tool.call', async ($, e: any, next) => {
    const now = await $.clock.now()

    if (e.tool === 'TodoWrite') {
      const todos = e.todos as { status: string }[]
      await update($, progress, p => ({
        ...p,
        total: todos.length,
        done: todos.filter(t => t.status === 'completed').length,
      }))
    } else if (e.tool === 'TaskCreate') {
      tasks.set(`new${tasks.size}`, 'pending')
    } else if (e.tool === 'TaskUpdate' && e.status) {
      tasks.set(String(e.taskId), e.status === 'deleted' ? 'deleted' : e.status)
    }

    if (e.tool === 'TaskCreate' || e.tool === 'TaskUpdate') {
      const live = [...tasks.values()].filter(s => s !== 'deleted')
      await update($, progress, p => ({
        ...p,
        total: Math.max(live.length, p.total),
        done: [...tasks.values()].filter(s => s === 'completed').length,
      }))
    }

    await update($, progress, p => ({
      ...p,
      nowMs: now,
      steps: p.steps + 1,
      activity: describe(e),
    }))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    stop()
    const now = await $.clock.now()
    await update($, progress, p => ({
      ...p,
      isRunning: false,
      lastSeconds: Math.round((now - p.startedAt) / 1000),
    }))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, progress)
    if (e.props.hasSurvey || (!p.isRunning && p.lastSeconds === null)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    if (!p.isRunning) {
      return (
        <Box>
          <Text dimColor>
            ✔ Задача завершена за {clock((p.lastSeconds ?? 0) * 1000)} · шагов: {p.steps} · осталось: 0 с
          </Text>
        </Box>
      )
    }

    const elapsed = p.nowMs - p.startedAt
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : null
    const remaining =
      p.total > 0 && p.done > 0 ? clock((elapsed / p.done) * (p.total - p.done)) : null
    const bar =
      pct === null
        ? ''
        : ` [${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))}] ${pct}% (${p.done}/${p.total})`

    return (
      <Box flexDirection="column">
        <Text>
          ⏳ {p.activity}
        </Text>
        <Text dimColor>
          Прошло: {clock(elapsed)} · Шагов: {p.steps}
          {bar} · Осталось: {remaining ? `≈ ${remaining}` : pct === null ? 'оценка появится после плана задач' : 'считаю…'}
        </Text>
      </Box>
    )
  })
}
