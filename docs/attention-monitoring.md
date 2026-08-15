# Camera Attention Monitoring

Checks, through the learner's own webcam, whether they are actually looking at
a lesson while it plays. Looking away long enough produces an on-screen
warning, pauses the video, and is written into the reports; repeated lapses
lock the player for a cooldown, and the missed seconds have to be re-watched.

Off by default. Nothing happens until an admin turns it on.

## The rule

The policy is resolved in three layers, each one only overriding what it
actually disagrees with:

```
ATTENTION_POLICY_DEFAULTS   (packages/shared/src/attention.js)
  ↓ overridden by
GLOBAL policy row            (Admin → Settings)
  ↓ overridden by
COURSE policy row            (Admin → course page)
```

A field that is unset at a layer inherits from the layer above; storing
`null` through the API is how a layer stops overriding a field. This is why
tightening one knob on one course does not freeze a copy of everything else —
later changes to the global rule still reach it.

| Setting | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Ask for the camera before playback and monitor. |
| `graceSeconds` | `4` | Continuous seconds of looking away before it counts. |
| `pauseOnWarning` | `true` | Pause the video while attention is lost. |
| `lockoutAfterWarnings` | `3` | Warnings in one session before the player locks. `0` disables. |
| `lockoutSeconds` | `20` | How long the lockout holds. |
| `requireRewatch` | `true` | Inattentive stretches are not credited as watched. |
| `notifyManagerAfter` | `5` | Lapses on one video before the learner's manager is notified. `0` disables. |

There is deliberately no "camera optional" setting. On a monitored course the
camera is mandatory — an opt-out button would make the policy advisory, since
anyone who did not want to be watched would simply click it. A learner who
refuses the camera does not watch the lesson; `enabled: false` is the only way
a course goes unmonitored.

Ranges are enforced by `attentionPolicy.validator.js` and mirrored on the
mongoose schema.

## Privacy boundary

**No image ever leaves the browser.** `useAttentionMonitor` pulls a 320×240
stream into an off-document `<video>`, hands each frame straight to a
MediaPipe FaceLandmarker running in wasm on the same page, and drops it. No
canvas capture, no upload, no recording, and no third-party request: the wasm
runtime and the model are served from our own origin
(`front/public/mediapipe/`, staged by `npm run assets:mediapipe`).

What is transmitted is the verdict only — the same analytics events as any
other playback signal:

| Event | Carries |
| --- | --- |
| `attentionLost` | `position`, `metadata.reason` (`noFace` / `lookingAway`) |
| `attentionRegained` | `duration` (wall-clock), `metadata.fromPosition`, `metadata.toPosition` |
| `attentionWarning` | `position` |
| `attentionLockout` | `duration` |
| `cameraDenied` / `cameraError` | `metadata.message` |

Consent is asked for in-app before the browser permission prompt, and a red
"camera on" badge stays visible for the whole session. Consent here means
"start the camera or close the lesson" — there is no third option. A refused
or failed camera is still recorded (`cameraBlocked`), so if monitoring is ever
turned off mid-course a report cannot present an unmonitored watch as an
attentive one.

Whether this is lawful to run on a given workforce is a policy decision for
whoever enables it, not something the software settles.

## Detection

`front/src/composables/useAttentionMonitor.js`, sampling at ~7fps:

- **Baseline calibration.** The first 25 frames with a face present are
  averaged into the learner's resting head pose. Everything afterwards is
  measured as deviation from *that*, never from an absolute zero — people sit
  at different angles to their webcam, and an absolute threshold only suits a
  centred desktop camera.
- **Head pose** from the face transformation matrix: >28° yaw or >22° pitch
  off baseline counts as looking away.
- **Gaze** from blendshapes: `eyeLookOut/Up/Down*` above 0.62 catches the
  head-forward-eyes-on-phone case.
- **No face** in frame counts as away.
- **Hysteresis**: a lapse must persist for the whole `graceSeconds` before it
  fires; attention must hold for 600ms before the warning clears. Reaching
  for a cup does not trigger anything.

Monitoring pauses while the learner has the video paused themselves, but
keeps running through a policy-imposed pause — otherwise the return to
attention that ends the pause could never be observed.

## Why watch time drops

With `requireRewatch`, inattentive ranges are cut back out of the stored
watched segments (`subtractSegments` in `backend/src/analytics/watchedSegments.js`).
The seconds did play, so they arrive as ordinary `progress` events and are
merged in first; the hole is punched afterwards. Watching 100s of a 100s
video with 20s of inattention therefore reads as 80% complete, below the 90%
completion threshold.

Re-watching heals it with no special case: fresh progress intervals merge
back over the hole and nothing re-subtracts them.

## Where it surfaces

- `videoProgress`: `attentionLostCount`, `inattentiveSeconds`,
  `attentionWarnings`, `attentionLockouts`, `cameraBlocked`,
  `inattentionReportedAt`.
- Video report API: an `attention` block per learner per video.
- Manager alert: `ATTENTION_ALERT` notification to active MANAGER/ADMIN users
  in the learner's department. `inattentionReportedAt` latches it to once per
  learner per video — without it every 10-second batch after the threshold
  would notify again. Failures are logged and swallowed: losing an alert is
  recoverable, losing the watch progress batch it rode in on is not.

## Setup

```bash
npm install                               # postinstall stages the assets
npm run assets:mediapipe --workspace front  # or re-stage them manually
```

The ~26MB of wasm and the face model are gitignored and fetched rather than
committed.
