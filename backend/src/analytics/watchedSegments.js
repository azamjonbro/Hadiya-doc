// The server never trusts a client-reported "percent watched" — it merges
// the actual played intervals a client reports (built from real
// `timeupdate` deltas while genuinely playing, never while paused/seeking)
// into a set of non-overlapping segments, and completion is derived only
// from their total length (spec §10).

export function mergeSegments(existingSegments, newIntervals) {
  // existingSegments may be Mongoose subdocuments (loaded from a saved
  // VideoProgress) rather than plain objects — `{ ...s }` on those copies
  // Mongoose's internal bookkeeping instead of start/end, so read the
  // fields explicitly to get plain, serializable numbers either way.
  const all = [...existingSegments, ...newIntervals]
    .map((s) => ({ start: s.start, end: s.end }))
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

// Floating-point subtraction leaves millisecond slivers behind; anything
// shorter than this is noise, not a gap the learner has to go back and watch.
const MIN_SEGMENT_SECONDS = 0.05

// Cuts the given intervals back out of already-merged segments — the inverse
// of mergeSegments, used for stretches the learner was looking away for.
// Those seconds played, so they arrived as ordinary `progress` events, but
// they must not count toward completion (spec: attention policy
// `requireRewatch`), and the only way to express that against a merged set is
// to punch the holes back out of it.
//
// Re-watching heals the hole on its own: the next batch merges fresh progress
// intervals over the same range, and nothing re-subtracts it.
export function subtractSegments(segments, holes) {
  if (!holes.length) return segments

  // The holes are merged first so overlapping inattention reports (a regain
  // that arrives in the same batch as a later loss) can't split a segment
  // twice over the same range.
  let result = segments.map((s) => ({ start: s.start, end: s.end }))

  for (const hole of mergeSegments([], holes)) {
    const next = []
    for (const segment of result) {
      // Disjoint — the hole is entirely before or after this segment.
      if (hole.end <= segment.start || hole.start >= segment.end) {
        next.push(segment)
        continue
      }
      // Otherwise keep whatever sticks out on either side; a hole strictly
      // inside a segment leaves both, one covering it entirely leaves none.
      if (hole.start > segment.start) next.push({ start: segment.start, end: hole.start })
      if (hole.end < segment.end) next.push({ start: hole.end, end: segment.end })
    }
    result = next
  }

  return result.filter((s) => s.end - s.start >= MIN_SEGMENT_SECONDS)
}
