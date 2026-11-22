import type { Counts } from '../types'

// status values come from skills/kotar/SKILL.md: new|queued wait, running|merge-pending run.
export const tally = (statuses: string[]): Counts => {
  const c: Counts = { waiting: 0, active: 0, done: 0, stuck: 0 }
  for (const d of statuses) {
    if (d === 'new' || d === 'queued') c.waiting++
    else if (d === 'running' || d === 'merge-pending') c.active++
    else if (d === 'done') c.done++
    else if (d === 'stuck') c.stuck++
  }
  return c
}

export const statusOf = (note: string): string | undefined => note.match(/^status:\s*(\S+)/m)?.[1]

export const boardDir = (config: string): string | undefined => config.match(/Board folder:\s*`([^`$]+)`/)?.[1]
