// node --experimental-strip-types hooks/count.test.mjs
import assert from 'assert'
import { tally, statusOf, boardDir } from './count.ts'
assert.deepEqual(tally(['new', 'queued', 'running', 'merge-pending', 'done', 'done', 'stuck', 'x']), { waiting: 2, active: 2, done: 2, stuck: 1 })
assert.equal(statusOf('---\nstatus: merge-pending\n---\n'), 'merge-pending')
assert.equal(statusOf('no frontmatter'), undefined)
assert.equal(boardDir('- Board folder: `vault/`\n'), 'vault/')
console.log('count ok')
