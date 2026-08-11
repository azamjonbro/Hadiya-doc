# Analytics Event Architecture

## Universal event schema (spec §42)

```ts
interface AnalyticsEvent {
  userId: string
  sessionId: string
  entityType: 'video' | 'news'
  entityId: string
  eventType: string   // play, pause, resume, seek, seeking, seeked,
                       // progress, buffering, waiting, ended,
                       // playbackRateChanged, qualityChanged, fullscreen,
                       // visibilitychange, tabHidden, tabVisible,
                       // pageLeave, pageReturn, heartbeat, scroll
  timestamp: string    // ISO
  position?: number    // playback position or scroll depth
  duration?: number
  metadata?: Record<string, unknown>
  device?: string
  browser?: string
}
```

New event types are additive — no schema migration needed to introduce one.

## Batching, not per-event writes

- **Frontend**: `useVideoAnalytics(videoId)` / `useScrollAnalytics(newsId)`
  composables push events into an in-memory buffer (`events[]`). The buffer
  flushes every 5-15 seconds AND on `pagehide`, using `fetch` with
  `keepalive: true` for the unload case so the batch survives even if the
  tab closes mid-request — not `navigator.sendBeacon`, since the ingestion
  endpoint is Bearer-token authenticated and `sendBeacon` can't attach
  custom headers; `fetch(..., { keepalive: true })` is the modern
  equivalent that can.
- **Backend**: `POST /analytics/video/events` accepts a batch array and
  performs one bulk insert into `videoAnalyticsEvents`, never one write per
  event. The same request incrementally updates the authoritative
  aggregates in `videoProgress`/`videoSessions`.

## Anti-skip / watch validation (spec §10)

The server **never** trusts a client-reported `currentTime` or percentage.
Clients report *played intervals* (`[start, end]` ranges derived from
`timeupdate` deltas while actually playing — not while seeking or paused).
The server:
1. Merges overlapping/adjacent intervals **within a session** into
   `watchedSegments`.
2. Unions those merged segments **across all sessions** for the same
   user+video to compute `uniqueWatchedSeconds` — this drives
   `completionPercent`.
3. Separately sums total playback time including rewatches into
   `totalWatchedSeconds` — reported alongside, never confused with
   completion.

Example from the spec: a 60-minute video, player open 90 minutes, unique
watched 43 minutes → reported completion is `43/60 = 71.6%`, not derived
from `currentTime` reaching the end.

## Tab-switch tracking (spec §11)

Page Visibility API (`visibilitychange`) events roll up into
`tabSwitches` / `hiddenDurationSeconds` on `videoProgress`. The UI always
labels this **"Detected inactive tab time"** — it is explicitly never
presented as proof the user didn't watch, per the spec's own framing.

## Session analytics (spec §12)

Each `videoSessions` document tracks one continuous watch session:
`startedAt`, `endedAt`, `activeDuration`, `hiddenDuration`,
`watchedDuration`, `completed`. Session boundaries are determined by
sustained inactivity (heartbeat gap) or explicit page-leave, not by a fixed
timeout that would fragment a single sitting into many sessions.

## Scroll analytics for news (spec §15)

Scroll position is throttled/debounced client-side and only meaningful
milestones (25/50/75/90/100%) plus max depth are sent — never a write per
pixel. Scroll velocity and time-between-milestones are computed server-side
from the milestone timestamps.

## Dashboard performance (spec §38)

Heavy admin aggregations — completion rates, most-skipped/most-paused
videos, engagement leaderboards, news engagement — are **pre-aggregated**
by a scheduled BullMQ repeatable job into a cache (Redis first, a
materialized Mongo doc as fallback). The live `/admin` dashboard reads that
cache; it never runs an expensive aggregation pipeline synchronously on
page load.

## Privacy boundary (spec §43)

Only in-platform activity is tracked: video playback behavior and news
reading behavior on this app. No OS-level activity, no other browser tabs'
URLs, no content outside this platform. A monitoring notice is shown to
users so this scope is disclosed, not hidden.
