#!/usr/bin/env node
/**
 * Stages the face-api.js detection/recognition models into backend/models.
 *
 * ~12MB total, so gitignored and fetched here instead of committed — same
 * approach as front/scripts/fetch-mediapipe-assets.mjs. Served from our own
 * disk (loadFromDisk), never a CDN: face verification must keep working
 * without outbound access, and a photo never needs to leave the process to
 * be checked against a model.
 *
 * Run: npm run assets:face-models --workspace backend
 */
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const here = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(here, '..')
const modelsDir = join(backendRoot, 'models', 'face-api')

const BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model'

const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
]

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function fetchFile(name) {
  const dest = join(modelsDir, name)
  if (await exists(dest)) {
    console.log(`present ${name} (delete it to re-download)`)
    return
  }
  console.log(`fetching ${name} ...`)
  const response = await fetch(`${BASE_URL}/${name}`)
  if (!response.ok) throw new Error(`Download failed for ${name}: ${response.status} ${response.statusText}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest))
  console.log(`fetched ${name}`)
}

async function main() {
  await mkdir(modelsDir, { recursive: true })
  for (const file of FILES) {
    // Sequential on purpose — GitHub's raw host rate-limits bursts of
    // concurrent requests from the same IP more aggressively than a slow
    // trickle of six.
    await fetchFile(file)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
