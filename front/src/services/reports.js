import { http } from './http'

/**
 * Strips empty values so a blank filter box does not become `?role=` — which
 * the server reads as a real, unmatchable value rather than as "no filter".
 */
function toParams(filters = {}, extra = {}) {
  const params = { ...extra }
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) params[key] = value
  }
  return params
}

function saveBlob(data, filename) {
  const url = URL.createObjectURL(new Blob([data]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const reportsApi = {
  listTypes() {
    return http.get('/reports').then((r) => r.data.data.types)
  },

  /**
   * Downloads a report and reports back what the server said about it.
   *
   * The return value is the point. A synchronous export is capped at 5 000
   * rows, and the body is a file, so the only place the server can say "this
   * is not all of it" is a header — which this used to drop on the floor.
   * A spreadsheet of 5 000 rows out of 8 000 looks complete, and the 3 000
   * missing people are indistinguishable from people who do not exist.
   *
   * Header names are lowercased: axios normalises them, and reading
   * `X-Report-Truncated` off the object returns undefined on every browser.
   */
  async download(type, format, filters = {}) {
    const response = await http.get(`/reports/${type}/export`, {
      params: toParams(filters, { format }),
      responseType: 'blob',
    })

    saveBlob(response.data, `${type}-${new Date().toISOString().slice(0, 10)}.${format}`)

    const totalRows = Number(response.headers['x-report-total-rows'])
    const exportedRows = Number(response.headers['x-report-exported-rows'])
    return {
      truncated: response.headers['x-report-truncated'] === 'true',
      // NaN when a proxy strips the headers — the caller shows nothing rather
      // than "NaN rows", which is worse than staying quiet.
      totalRows: Number.isFinite(totalRows) ? totalRows : null,
      exportedRows: Number.isFinite(exportedRows) ? exportedRows : null,
    }
  },

  /**
   * Queues the full export — the other half of the cap.
   *
   * PDF is not offered here: the worker writes csv/xlsx only, since a
   * hundred-thousand-row PDF is not a document anybody opens.
   */
  queueExport(type, format, filters = {}) {
    return http
      .post(`/reports/${type}/export-job`, null, { params: toParams(filters, { format }) })
      .then((r) => r.data.data)
  },

  exportJob(jobId) {
    return http.get(`/reports/export-jobs/${jobId}`).then((r) => r.data.data)
  },

  exportJobs() {
    return http.get('/reports/export-jobs').then((r) => r.data.data.items)
  },
}
