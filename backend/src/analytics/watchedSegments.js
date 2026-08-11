// The server never trusts a client-reported "percent watched" — it merges
// the actual played intervals a client reports (built from real
// `timeupdate` deltas while genuinely playing, never while paused/seeking)
// into a set of non-overlapping segments, and completion is derived only
// from their total length (spec §10).

export function mergeSegments(existingSegments, newIntervals) {
  const all = [...existingSegments, ...newIntervals]
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start)

  if (all.length === 0) return []

  const merged = [{ ...all[0] }]
  for (let i = 1; i < all.length; i += 1) {
    const last = merged[merged.length - 1]
    const curr = all[i]
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end)
    } else {
      merged.push({ ...curr })
    }
  }
  return merged
}

export function sumSegmentSeconds(segments) {
  return segments.reduce((total, s) => total + (s.end - s.start), 0)
}
