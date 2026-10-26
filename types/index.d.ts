export type Progress = {
  isRunning: boolean
  startedAt: number
  nowMs: number
  activity: string
  steps: number
  done: number
  total: number
  lastSeconds: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'task-progress': { progress: Progress }
  }
}
