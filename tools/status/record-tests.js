import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT } from './collect.js'

/**
 * Runs the backend suite and records the result for the status page.
 *
 * Separate from the page because the suite takes about ninety seconds and
 * needs a live MongoDB — not something a browser refresh should set off.
 *
 *   npm run status:tests
 *
 * `spawn` with the output collected by hand rather than `execFile`: piping
 * a child's stdout to the terminal consumes the stream, so execFile's own
 * buffer arrives empty and the summary cannot be parsed. Doing both means
 * doing both explicitly.
 */
const child = spawn('npm', ['test'], {
  cwd: path.join(ROOT, 'backend'),
  env: {
    // The HTTP-driven suites need a running backend. 4055 is the
    // convention (see backend/TESTING.md) because port 4000 is usually
    // taken by another project on these machines — defaulted here so the
    // command works without having to remember it.
    TEST_BASE_URL: 'http://localhost:4055/api/v1',
    ...process.env,
  },
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => process.stderr.write(chunk))

child.on('close', async (code) => {
  const read = (label) => Number(output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? 0)
  const tests = read('tests')
  const result = {
    at: new Date().toISOString(),
    tests,
    pass: read('pass'),
    fail: read('fail'),
    // A non-zero exit with no counts means the run never got going — a
    // missing database, usually — and recording "0 of 0 passed" would look
    // like a catastrophe rather than a setup problem.
    ran: tests > 0,
    exitCode: code ?? 0,
  }
  await writeFile(path.join(ROOT, 'tools/status/last-test-run.json'), JSON.stringify(result, null, 2))
  console.log(
    result.ran
      ? `Recorded: ${result.pass}/${result.tests} passing, ${result.fail} failing`
      : 'The suite did not run — is MongoDB up, and the backend listening on 4055?'
  )
})
