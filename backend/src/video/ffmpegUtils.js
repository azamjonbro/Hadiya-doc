import { spawn } from 'node:child_process'

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`))
      }
    })
  })
}

export async function probeVideo(filePath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ])
  const data = JSON.parse(stdout)
  const videoStream = data.streams?.find((s) => s.codec_type === 'video')
  if (!videoStream) {
    throw new Error('No video stream found in file')
  }
  const duration = Number(data.format?.duration ?? videoStream.duration ?? 0)
  return {
    durationSeconds: Math.round(duration),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    // Subtitle streams carried inside the container (9.4). An .mkv or an
    // .mp4 from a recording tool routinely has them, and they are the
    // cheapest captions the platform will ever get: already timed, already
    // in the right language, already in the file.
    subtitleStreams: (data.streams ?? [])
      .filter((stream) => stream.codec_type === 'subtitle')
      .map((stream, order) => ({
        // `-map 0:s:N` counts subtitle streams, not streams — so the
        // position among the subtitle streams is what ffmpeg needs, not
        // the absolute stream index.
        subtitleIndex: order,
        codec: stream.codec_name ?? '',
        language: stream.tags?.language ?? '',
        title: stream.tags?.title ?? '',
      })),
  }
}

/**
 * Which subtitle codecs can become WebVTT.
 *
 * Text formats convert; bitmap ones (DVD, Blu-ray and the VobSub family)
 * are pictures of text and would need OCR. Skipping them with a log beats
 * failing the whole video over a track nobody asked for.
 */
const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'webvtt', 'mov_text', 'ass', 'ssa', 'text'])

export function isConvertibleSubtitle(codec) {
  return TEXT_SUBTITLE_CODECS.has(String(codec ?? '').toLowerCase())
}

/** Pulls one embedded subtitle stream out as a WebVTT file. */
export async function extractSubtitleTrack({ inputPath, subtitleIndex, outputPath }) {
  await runCommand('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-map',
    `0:s:${subtitleIndex}`,
    '-c:s',
    'webvtt',
    outputPath,
  ])
  return outputPath
}

export async function transcodeToHls({ inputPath, outputDir, height, segmentSeconds = 6 }) {
  const playlistPath = `${outputDir}/index.m3u8`
  await runCommand('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `scale=-2:${height}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-hls_time',
    String(segmentSeconds),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    `${outputDir}/segment_%03d.ts`,
    playlistPath,
  ])
  return playlistPath
}

export async function extractThumbnail({ inputPath, outputPath, atSeconds = 1 }) {
  await runCommand('ffmpeg', [
    '-y',
    '-ss',
    String(atSeconds),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    outputPath,
  ])
}
