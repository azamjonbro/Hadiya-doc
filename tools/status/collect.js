import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

const CHECKLIST = path.join(ROOT, 'docs/v3/09-master-checklist.md')
const TEST_RESULT = path.join(ROOT, 'tools/status/last-test-run.json')

/**
 * Everything the status page shows, read from the repository itself.
 *
 * Deliberately no database and no server state: the numbers come from the
 * checklist file and from git, which are the two things that are true
 * regardless of which session — or which person — is doing the work. A
 * counter kept in the panel's own memory would drift the moment somebody
 * committed from another window, which is exactly the situation this
 * exists for.
 */

async function git(args) {
  try {
    const { stdout } = await run('git', args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 })
    return stdout.trimEnd()
  } catch {
    // A missing git, a detached repo, no upstream — none of these are worth
    // failing the whole page for. The panel shows what it could read.
    return ''
  }
}

/**
 * The checklist, parsed into blocks.
 *
 * The file is the source of truth for "what is done" because it is what the
 * work is actually tracked against — deriving progress from commit messages
 * instead would count the same item twice whenever something was revisited.
 */
export async function readChecklist() {
  let text = ''
  try {
    text = await readFile(CHECKLIST, 'utf8')
  } catch {
    return { blocks: [], done: 0, total: 0, current: null, updatedAt: null }
  }

  const blocks = []
  let block = null
  let done = 0
  let total = 0
  let current = null

  for (const line of text.split('\n')) {
    const heading = line.match(/^## (BLOK \d+[^\n]*)/)
    if (heading) {
      block = { name: heading[1].trim(), done: 0, total: 0, items: [] }
      blocks.push(block)
      continue
    }
    if (line.startsWith('## Infratuzilma')) {
      block = { name: 'Infratuzilma', done: 0, total: 0, items: [] }
      blocks.push(block)
      continue
    }

    const item = line.match(/^- \[( |x)\] \*\*([\d.]+|INF-\d+)\*\*\s*(.*)$/)
    if (!item || !block) continue

    const isDone = item[1] === 'x'
    const title = item[3].replace(/\*\*/g, '').replace(/[🔴⚠️]/g, '').trim()
    block.total += 1
    total += 1
    if (isDone) {
      block.done += 1
      done += 1
    } else if (!current) {
      // The first unticked item, in file order — which is the order the
      // work is being done in.
      current = { id: item[2], title, block: block.name }
    }
    block.items.push({ id: item[2], title, done: isDone })
  }

  let updatedAt = null
  try {
    updatedAt = (await stat(CHECKLIST)).mtime.toISOString()
  } catch {
    /* the file was read a moment ago; a failed stat is not worth reporting */
  }

  return { blocks, done, total, current, updatedAt }
}

/** Recent commits, and how far ahead of the remote the branch is. */
export async function readGit() {
  const [log, branch, ahead, status, lastFetch] = await Promise.all([
    git(['log', '-40', '--pretty=format:%H%x1f%an%x1f%aI%x1f%s']),
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['rev-list', '--count', '@{u}..HEAD']),
    git(['status', '--porcelain']),
    git(['log', '-1', '--pretty=format:%aI']),
  ])

  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, subject] = line.split('\x1f')
      return { hash: hash.slice(0, 7), author, date, subject }
    })

  const today = new Date().toISOString().slice(0, 10)
  const dirty = status
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ state: line.slice(0, 2).trim(), file: line.slice(3) }))

  return {
    branch,
    unpushed: Number(ahead) || 0,
    commitsToday: commits.filter((commit) => commit.date.slice(0, 10) === today).length,
    lastCommitAt: lastFetch || null,
    commits: commits.slice(0, 20),
    dirty,
  }
}

/**
 * The last recorded test run.
 *
 * Read from a file rather than measured here: running the suite takes about
 * ninety seconds and needs a live MongoDB, which is not something a page
 * refresh should trigger. `npm run status:tests` writes it.
 */
export async function readTests() {
  try {
    const raw = JSON.parse(await readFile(TEST_RESULT, 'utf8'))
    return raw
  } catch {
    return null
  }
}

/** Which feature areas the recent commits touched, for the activity feed. */
export function summariseActivity(commits) {
  const areas = new Map()
  for (const commit of commits) {
    const scope = commit.subject.match(/^\w+\(([^)]+)\)/)?.[1] ?? 'other'
    areas.set(scope, (areas.get(scope) ?? 0) + 1)
  }
  return [...areas.entries()].map(([scope, count]) => ({ scope, count })).sort((a, b) => b.count - a.count)
}

export async function collect() {
  const [checklist, gitState, tests] = await Promise.all([readChecklist(), readGit(), readTests()])
  return {
    generatedAt: new Date().toISOString(),
    checklist,
    git: gitState,
    tests,
    activity: summariseActivity(gitState.commits),
  }
}
