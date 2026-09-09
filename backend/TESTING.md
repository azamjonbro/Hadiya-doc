# Running the tests

```bash
npm --prefix backend test
```

## Why `--test-concurrency=2`

The suite runs against a **live MongoDB and Redis**, not mocks — that is
deliberate, and it is what catches the failures that only exist in the
database: a `sparse` compound index that silently rejects the second row, a
missing-field query that drops every pre-migration document, a unique index
doing the work two concurrent requests cannot do by checking first.

The cost is that the test files are not independent of each other. Node's
default concurrency is one process per CPU — eight here — and eight files
hammering one MongoDB produced failures that moved around between runs:
timeouts in one file, a rate limiter exhausted by another, a count that had
been correct a moment earlier. None of them were real, and chasing them
wasted more time than the parallelism saved.

Two at a time is stable and takes about ninety seconds. If a file needs to
be genuinely isolated, give it its own data (every suite here suffixes its
fixtures with a timestamp) rather than raising the concurrency again.

## Known failures

Two face-recognition tests fail on machines where `tfjs-node`'s native
addon has not been built. They are unrelated to application code; the rest
of the suite must be green.

## The HTTP tests

Several files (`security`, `roleScope`, `notificationPrefs`,
`certificatePublic`, …) drive a **running backend** rather than importing
the app:

```bash
PORT=4055 node src/server.js &
TEST_BASE_URL=http://localhost:4055/api/v1 npm --prefix backend test
```

A route mounted in the wrong place passes every mock, which is why these
exist. Port 4000 is often taken by another project on the dev machines, so
4055 is the convention.

The API's own rate limiter is per-IP and in-memory: running the whole suite
several times inside fifteen minutes will exhaust it and produce a wave of
429s that look like failures. Restart the server to clear it.
