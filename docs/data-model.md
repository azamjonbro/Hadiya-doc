# Data Model

## Relationship overview

```
roles ──< users >── courseAssignments >── courses ──< topics ──< videos
  │                        │                                       │
  │                        │                                       ├──< videoProgress >── users
permissions                │                                       ├──< videoSessions >── users
                            │                                       └──< videoAnalyticsEvents
                            ├──< tasks (assignedTo/assignedBy = users)
                            ├──< notifications
                            ├──< aiChats (courseId/topicId/videoId, userId)
                            └──< sessions (refresh-token sessions)

news ──< newsViews >── users
events ──< participants (users[])
auditLogs (actor = users, entity/entityId = polymorphic reference)
```

`videoProgress` and `videoSessions` are the **authoritative, server-computed**
aggregates dashboards read from. `videoAnalyticsEvents` is high-volume raw
input, TTL-expired after 180 days, and dashboards never query it directly.

## Collections

### `roles`
Dynamic role → permission mapping so new roles need zero code changes.

| Field | Type | Notes |
|---|---|---|
| name | string | e.g. `SUPERADMIN`, `CALL_OPERATOR` |
| permissions | string[] | permission keys, e.g. `course:create` |
| isSystem | boolean | true for the 6 seeded roles; prevents deletion |

Indexes: `{name:1}` unique.

### `permissions`
Canonical permission catalogue (documentation + validation source, not just
implicit strings scattered in code).

| Field | Type |
|---|---|
| key | string (e.g. `video:upload`) |
| module | string (e.g. `videos`) |
| description | string |

Indexes: `{key:1}` unique.

### `users`

| Field | Type | Notes |
|---|---|---|
| fullName, phone | string | |
| jshshir | string | 14 digits, required, the primary login handle |
| passportSeries | string \| absent | e.g. `AA1234567`, optional alternative login handle |
| email | string \| absent | optional |
| passwordHash | string | argon2id |
| roleId | ObjectId → roles | |
| department, position | string | |
| avatar | string (storage key) | |
| isActive | boolean | |
| failedLoginAttempts | number | reset on success |
| lockedUntil | Date \| null | account lockout |
| createdAt/updatedAt | Date | |

Indexes: `{jshshir:1}` unique, `{roleId:1}`. `{passportSeries:1}` and `{email:1}` are
unique *partial* indexes (`$type: 'string'`) — both fields are optional, and a plain
sparse index still stores explicit nulls, so the second employee without one would
collide with the first.

### `courses`

| Field | Type |
|---|---|
| title, slug, description | string |
| cover, banner | string (storage key) |
| status | `DRAFT \| PUBLISHED \| ARCHIVED` |
| createdBy, updatedBy | ObjectId → users |

Indexes: `{slug:1}` unique.

### `topics`

| Field | Type |
|---|---|
| courseId | ObjectId → courses |
| title, slug, description | string |
| cover, banner | string |
| order | number |
| status | `DRAFT \| PUBLISHED` |
| duration | number (seconds, sum of child videos) |
| createdBy, updatedBy | ObjectId → users |

Indexes: `{courseId:1, order:1}`.

### `videos`

| Field | Type | Notes |
|---|---|---|
| topicId, courseId | ObjectId | courseId denormalized for query efficiency |
| title, description | string |
| posterUrl, thumbnailUrl | string (storage key) |
| duration | number (seconds) |
| fileSize | number (bytes) |
| originalKey | string (storage key, private) |
| hlsManifestKey | string (storage key of master playlist) |
| qualities | string[] (e.g. `["360p","720p"]`, actually produced) |
| processingStatus | `PENDING\|VALIDATING\|TRANSCODING\|PACKAGING\|READY\|FAILED` |
| status | `DRAFT \| PUBLISHED` |
| required | boolean |
| order | number |
| createdBy, updatedBy | ObjectId → users |

Indexes: `{topicId:1, order:1}`, `{processingStatus:1}`.

### `courseAssignments`

| Field | Type |
|---|---|
| userId, courseId | ObjectId |
| mandatory | boolean |
| assignedBy | ObjectId → users |
| assignedAt, startAt, deadline, expiresAt | Date |
| status | `ACTIVE\|COMPLETED\|OVERDUE\|EXPIRED` |

Indexes: `{userId:1, courseId:1}` unique, `{deadline:1, status:1}` (for the
scheduled expiry-checker job).

### `videoProgress` — server-computed, per user+video

| Field | Type | Notes |
|---|---|---|
| userId, videoId, courseId | ObjectId |
| watchedSegments | `[{start:number,end:number}]` | merged, non-overlapping intervals |
| uniqueWatchedSeconds | number | sum of merged segment lengths |
| totalWatchedSeconds | number | sum including rewatches |
| completionPercent | number | `uniqueWatchedSeconds / duration`, server-computed only |
| playsCount, pausesCount, seeksCount | number |
| forwardSeekSeconds, backwardSeekSeconds | number |
| bufferingSeconds | number |
| tabSwitches, hiddenDurationSeconds | number |
| firstWatchedAt, lastWatchedAt, completedAt | Date |

Indexes: `{userId:1, videoId:1}` unique, `{courseId:1, userId:1}`.

### `videoSessions` — one doc per watch session

| Field | Type |
|---|---|
| sessionId | string (uuid) |
| userId, courseId, topicId, videoId | ObjectId |
| startedAt, endedAt | Date |
| activeDuration, hiddenDuration, watchedDuration | number (seconds) |
| completed | boolean |
| device, browser | string |

Indexes: `{userId:1, videoId:1, startedAt:-1}`.

### `videoAnalyticsEvents` — raw batched events

| Field | Type |
|---|---|
| userId, sessionId, videoId | ObjectId / string |
| eventType | string (play, pause, seek, heartbeat, ...) |
| timestamp | Date |
| position, duration | number |
| metadata | object |

Indexes: `{sessionId:1, timestamp:1}`, `{userId:1, videoId:1, timestamp:-1}`,
**TTL index on `timestamp`, 180 days**.

### `news`

| Field | Type |
|---|---|
| title, content (sanitized HTML) | string |
| cover, images[], attachments[] | string (storage keys) |
| tags[] | string[] |
| departmentTargets[], roleTargets[] | string[] |
| publishAt, expiryAt | Date |
| createdBy | ObjectId → users |

Indexes: `{publishAt:-1}`, `{tags:1}`.

### `newsViews`

| Field | Type |
|---|---|
| userId, newsId | ObjectId |
| firstOpenedAt, lastOpenedAt | Date |
| openCount | number |
| maxScrollDepth | number (0-100) |
| milestones | `[{depth:number, at:Date}]` |
| timeSpentSeconds | number |
| completed | boolean |

Indexes: `{userId:1, newsId:1}` unique.

### `tasks`

| Field | Type |
|---|---|
| title, description | string |
| assignedTo, assignedBy | ObjectId → users |
| priority | `LOW\|MEDIUM\|HIGH` |
| deadline | Date |
| attachments[] | string (storage keys) |
| status | `TODO\|IN_PROGRESS\|COMPLETED\|OVERDUE\|CANCELLED` |
| completedAt | Date |

Indexes: `{assignedTo:1, status:1}`, `{deadline:1}`.

### `events`

| Field | Type |
|---|---|
| title, description | string |
| type | `MEETING\|TRAINING\|SEMINAR\|EVENT\|ANNOUNCEMENT` |
| startAt, endAt | Date |
| location | string |
| participants[] | ObjectId → users |
| createdBy | ObjectId → users |

Indexes: `{startAt:1}`.

### `notifications`

| Field | Type |
|---|---|
| userId | ObjectId |
| type | string |
| title, message | string |
| relatedEntityType, relatedEntityId | string / ObjectId |
| severity | `INFO\|WARNING\|CRITICAL` |
| read | boolean |
| createdAt | Date |

Indexes: `{userId:1, read:1, createdAt:-1}`.

### `auditLogs`

| Field | Type |
|---|---|
| actor | ObjectId → users |
| action | string (e.g. `USER_CREATED`, `COURSE_ASSIGNED`) |
| entity, entityId | string / ObjectId |
| metadata | object |
| ip, userAgent | string |
| timestamp | Date |

Indexes: `{actor:1, timestamp:-1}`, `{entity:1, entityId:1}`.

### `sessions` — refresh-token session tracking

| Field | Type |
|---|---|
| userId | ObjectId |
| refreshTokenHash | string |
| userAgent, ip | string |
| createdAt, expiresAt | Date |
| revoked | boolean |
| replacedBy | ObjectId → sessions (rotation chain, for reuse detection) |

Indexes: `{userId:1, revoked:1}`, `{refreshTokenHash:1}` unique.

### `aiChats`

| Field | Type |
|---|---|
| userId | ObjectId |
| courseId, topicId, videoId | ObjectId (nullable, whichever scope applies) |
| messages | `[{role, content, at}]` |
| createdAt, updatedAt | Date |

Indexes: `{userId:1, videoId:1}`.

## Indexing strategy notes

- Every analytics/report query is designed to hit a compound index led by
  `userId` or `courseId`/`videoId` — never a full collection scan.
- TTL indexes bound the growth of the one truly high-volume collection
  (`videoAnalyticsEvents`); everything users see in reports lives in the
  much smaller aggregate collections.
- Unique compound indexes (`courseAssignments`, `videoProgress`, `newsViews`,
  `sessions.refreshTokenHash`) double as data-integrity constraints, not
  just performance aids.
