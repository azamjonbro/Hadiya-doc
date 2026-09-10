/**
 * The launcher page: the SCORM runtime API, served from the API's own origin.
 *
 * This page exists because of the same-origin policy. A package finds the
 * LMS by walking up the window chain — `window.parent.API` in 1.2,
 * `window.parent.API_1484_11` in 2004 — and reading a property off a window
 * from another origin throws. The SPA is on spring.sds-max.uz and the
 * package's files are served by the API on qollanma.sds-max.uz, so the SPA
 * cannot be the window that holds the API object.
 *
 * So the API serves this small page instead. It sits in the SPA's iframe,
 * defines the runtime API, and nests a second iframe with the package —
 * same origin as this page, which is what makes `window.parent.API` legal.
 * The SPA learns what is happening through postMessage.
 *
 * Rendered as a string rather than as a file with a template engine: it is
 * one page, it has no build step, and the only values interpolated into it
 * are JSON-encoded by `payload` below.
 */
export function renderScormPlayer({ packageId, token, version, launchUrl, statePath, learner, state, masteryScore }) {
  const payload = JSON.stringify({
    packageId: String(packageId),
    version,
    launchUrl,
    statePath,
    token,
    learner,
    state,
    masteryScore: masteryScore ?? null,
  })
    // A closing script tag inside JSON would end this script element early.
    // `</script>` cannot appear in JSON any other way, so this is the whole
    // escaping story.
    .replace(/<\//g, '<\\/')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SCORM</title>
<style>
  html, body { margin: 0; height: 100%; background: #0f1115; color: #e6e6e6; font: 14px/1.4 system-ui, sans-serif; }
  #frame { border: 0; width: 100%; height: 100%; display: block; background: #fff; }
  #failed { display: none; padding: 24px; }
</style>
</head>
<body>
<iframe id="frame" title="SCORM content" allowfullscreen allow="autoplay; fullscreen"></iframe>
<div id="failed"></div>
<script>
(function () {
  var config = ${payload};

  // Everything the content has written, flat, exactly as the API contract
  // describes it: string keys, string values.
  var cmi = Object.assign({}, config.state.cmi || {});
  var initialized = false;
  var terminated = false;
  var lastError = '0';
  var dirty = false;

  var ERRORS = {
    '0': 'No error',
    '101': 'General exception',
    '201': 'Invalid argument error',
    '301': 'Not initialized',
    '401': 'Not implemented error',
    '403': 'Element is read only'
  };

  // What a package may read before it has written anything. Two vocabularies
  // for the same facts (see scormRuntime.service.js); which one is served
  // depends on the manifest, not on a guess.
  function defaults() {
    var s = config.state;
    var resumed = (s.attempts || 0) > 1 || !!s.location || !!s.suspendData;
    if (config.version === '2004') {
      return {
        'cmi._version': '1.0',
        'cmi.learner_id': config.learner.id,
        'cmi.learner_name': config.learner.name,
        'cmi.completion_status': s.completionStatus === 'unknown' ? 'not attempted' : s.completionStatus,
        'cmi.success_status': s.successStatus,
        'cmi.location': s.location || '',
        'cmi.suspend_data': s.suspendData || '',
        'cmi.entry': resumed ? 'resume' : 'ab-initio',
        'cmi.credit': 'credit',
        'cmi.mode': 'normal',
        'cmi.exit': '',
        'cmi.total_time': s.totalTime || 'PT0H0M0S',
        'cmi.score.raw': s.scoreRaw == null ? '' : String(s.scoreRaw),
        'cmi.score.min': s.scoreMin == null ? '' : String(s.scoreMin),
        'cmi.score.max': s.scoreMax == null ? '' : String(s.scoreMax),
        'cmi.score.scaled': '',
        'cmi.scaled_passing_score': config.masteryScore == null ? '' : String(config.masteryScore / 100),
        'cmi.launch_data': '',
        'cmi.progress_measure': '',
        'cmi.interactions._count': '0',
        'cmi.objectives._count': '0'
      };
    }
    return {
      'cmi.core._children': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
      'cmi.core.student_id': config.learner.id,
      'cmi.core.student_name': config.learner.name,
      'cmi.core.lesson_location': s.location || '',
      'cmi.core.credit': 'credit',
      'cmi.core.lesson_status': s.lessonStatus || 'not attempted',
      'cmi.core.entry': resumed ? 'resume' : 'ab-initio',
      'cmi.core.score._children': 'raw,min,max',
      'cmi.core.score.raw': s.scoreRaw == null ? '' : String(s.scoreRaw),
      'cmi.core.score.min': s.scoreMin == null ? '' : String(s.scoreMin),
      'cmi.core.score.max': s.scoreMax == null ? '' : String(s.scoreMax),
      'cmi.core.total_time': s.totalTime || '0000:00:00.00',
      'cmi.core.lesson_mode': 'normal',
      'cmi.core.exit': '',
      'cmi.suspend_data': s.suspendData || '',
      'cmi.launch_data': '',
      'cmi.comments': '',
      'cmi.student_data.mastery_score': config.masteryScore == null ? '' : String(config.masteryScore),
      'cmi.interactions._count': '0',
      'cmi.objectives._count': '0'
    };
  }

  var base = defaults();

  function tell(type, extra) {
    // The SPA draws the progress and the completion badge; it is told rather
    // than polling, and it re-reads the authoritative state from the API
    // when this says something changed.
    try {
      parent.postMessage(Object.assign({ source: 'scorm-player', packageId: config.packageId, type: type }, extra || {}), '*');
    } catch (error) { /* the parent is allowed not to care */ }
  }

  function send(finished) {
    if (!dirty && !finished) return Promise.resolve();
    dirty = false;
    var body = JSON.stringify({ cmi: cmi, finished: !!finished });
    // keepalive so a commit fired from pagehide still leaves the browser.
    return fetch(config.statePath + '?token=' + encodeURIComponent(config.token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true
    })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (data && data.data) tell('committed', { state: data.data });
      })
      .catch(function () {
        // A failed commit is not lost: the values stay in memory and the
        // next commit — including the one on unload — carries them.
        dirty = true;
      });
  }

  function get(element) {
    if (!initialized || terminated) { lastError = '301'; return ''; }
    lastError = '0';
    if (Object.prototype.hasOwnProperty.call(cmi, element)) return String(cmi[element]);
    if (Object.prototype.hasOwnProperty.call(base, element)) return String(base[element]);
    // Unknown element: 401 rather than a made-up value. A package that asks
    // for something we do not keep can handle "not implemented"; it cannot
    // handle being told an interaction exists when it does not.
    lastError = '401';
    return '';
  }

  function set(element, value) {
    if (!initialized || terminated) { lastError = '301'; return 'false'; }
    if (typeof element !== 'string' || element.indexOf('cmi.') !== 0) { lastError = '201'; return 'false'; }
    lastError = '0';
    cmi[element] = value == null ? '' : String(value);
    dirty = true;
    var statusKey = config.version === '2004' ? 'cmi.completion_status' : 'cmi.core.lesson_status';
    if (element === statusKey || element === 'cmi.success_status') tell('status', { element: element, value: cmi[element] });
    return 'true';
  }

  function initialize() {
    if (initialized) { lastError = '101'; return 'false'; }
    initialized = true;
    terminated = false;
    lastError = '0';
    tell('initialized');
    return 'true';
  }

  function finish() {
    if (!initialized || terminated) { lastError = '301'; return 'false'; }
    terminated = true;
    lastError = '0';
    send(true);
    tell('finished');
    return 'true';
  }

  function commit() {
    if (!initialized || terminated) { lastError = '301'; return 'false'; }
    lastError = '0';
    send(false);
    return 'true';
  }

  var api12 = {
    LMSInitialize: initialize,
    LMSFinish: finish,
    LMSGetValue: get,
    LMSSetValue: set,
    LMSCommit: commit,
    LMSGetLastError: function () { return lastError; },
    LMSGetErrorString: function (code) { return ERRORS[String(code)] || ''; },
    LMSGetDiagnostic: function (code) { return ERRORS[String(code)] || ''; }
  };

  var api2004 = {
    Initialize: initialize,
    Terminate: finish,
    GetValue: get,
    SetValue: set,
    Commit: commit,
    GetLastError: function () { return lastError; },
    GetErrorString: function (code) { return ERRORS[String(code)] || ''; },
    GetDiagnostic: function (code) { return ERRORS[String(code)] || ''; }
  };

  // Both are exposed whatever the manifest said. A 2004 package that finds
  // only API_1484_11 is correct; a mislabelled export that looks for the
  // other one is common, and refusing it would be pedantry with a blank
  // screen as the outcome.
  window.API = api12;
  window.API_1484_11 = api2004;

  // Content that never calls Commit still has to be saved: a periodic
  // flush plus one on the way out is the difference between a learner
  // closing the tab and losing an hour, and not.
  setInterval(function () { send(false); }, 30000);
  window.addEventListener('pagehide', function () { send(true); });
  window.addEventListener('beforeunload', function () { send(true); });

  var frame = document.getElementById('frame');
  frame.addEventListener('load', function () { tell('loaded'); });
  frame.src = config.launchUrl;
})();
</script>
</body>
</html>`
}
