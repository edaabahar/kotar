import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Counts } from '../types'
import { boardDir, statusOf, tally } from './count'

const counts = atom({ plugin: 'kotar', key: 'counts' } as const, null)
const PANE = 'kotar'

let isOpened = false // the pane opens once per load, so a person's close stays closed
let isPlaced = false // a surface draws the pane (desktop widget); where none does, the band below stands in

// Reads the board named in <project>/.claude/kotar.md; no kotar.md, no band.
async function refresh($: any): Promise<void> {
  let next: Counts | null = null
  try {
    const root: string = await $.session.cwd() // shortcut: in a worktree this is the worktree's copy of the board, upgrade by resolving the main checkout
    const dir = boardDir(await $.fs.read(`${root}/.claude/kotar.md`))
    if (dir !== undefined) {
      const statuses: string[] = []
      for (const sub of ['Bugs', 'Enhancements', 'Experiments']) {
        const path = `${root}/${dir}/${sub}`.replace(/\/+/g, '/')
        if (!(await $.fs.exists(path))) continue
        for (const f of await $.fs.list(path)) {
          if (!f.name.endsWith('.md')) continue
          const d = statusOf(await $.fs.read(`${path}/${f.name}`, { length: 600 }))
          if (d !== undefined) statuses.push(d)
        }
      }
      next = tally(statuses)
    }
  } catch {
    next = null
  }
  await update($, counts, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    $.clock.every(15000, () => refresh($))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, counts)
    if (e.props.hasSurvey || c === null || isPlaced) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>
          kotar · {c.waiting} waiting · {c.active} active · {c.done} done
          {c.stuck > 0 ? ` · ${c.stuck} stuck` : ''}
        </Text>
      </Box>
    )
  })
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const c = await read($, counts)
    const { Box, Text } = $.ui.resolve(e)
    if (c === null) return <Text dimColor>no board</Text>
    if (e.props.placement === 'widget') {
      return (
        <Text>
          {c.waiting} waiting · {c.active} active · {c.done} done{c.stuck > 0 ? ` · ${c.stuck} stuck` : ''}
        </Text>
      )
    }
    return (
      <Box flexDirection="column">
        <Text>{c.waiting} waiting</Text>
        <Text>{c.active} active</Text>
        <Text>{c.done} done</Text>
        {c.stuck > 0 && <Text color="red">{c.stuck} stuck</Text>}
      </Box>
    )
  })
}
