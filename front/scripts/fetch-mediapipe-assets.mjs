#!/usr/bin/env node
/**
 * Stages the MediaPipe runtime and face-landmark model into front/public.
 *
 * These are ~26MB of binaries, so they are gitignored and fetched here
 * instead of being committed. They are served from our own origin rather
 * than Google's CDN so attention monitoring keeps working offline and does
 * not leak a request per learner to a third party.
 *
 * Run: npm run assets:mediapipe --workspace front
 */
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const here = dirname(fileURLToPath(import.meta.url))
const frontRoot = join(here, '..')
const publicDir = join(frontRoot, 'public', 'mediapipe')
const wasmDir = join(publicDir, 'wasm')
const packageWasmDir = join(frontRoot, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')

// Both SIMD and non-SIMD builds: the loader picks at runtime based on what
// the browser reports, and shipping only one strands the other.
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const MODEL_PATH = join(publicDir, 'face_landmarker.task')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  await mkdir(wasmDir, { recursive: true })

  for (const file of WASM_FILES) {
    const source = join(packageWasmDir, file)
    if (!(await exists(source))) {
      throw new Error(`Missing ${source} — run npm install first.`)
    }
    await copyFile(source, join(wasmDir, file))
    console.log(`copied  ${file}`)
  }

  if (await exists(MODEL_PATH)) {
    console.log('present face_landmarker.task (delete it to re-download)')
    return
  }

  console.log('fetching face_landmarker.task ...')
  const response = await fetch(MODEL_URL)
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${response.statusText}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(MODEL_PATH))
  console.log('fetched face_landmarker.task')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
