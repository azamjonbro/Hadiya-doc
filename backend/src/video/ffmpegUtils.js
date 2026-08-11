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
  }
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
