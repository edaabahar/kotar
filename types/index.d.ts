export type Counts = { waiting: number; active: number; done: number; stuck: number }

declare module 'claude-code' {
  interface PluginState {
    kotar: { counts: Counts | null }
  }
}
