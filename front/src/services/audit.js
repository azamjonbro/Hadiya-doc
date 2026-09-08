import { http } from './http'

function withoutEmpty(filters) {
  const params = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) params[key] = value
  }
  return params
}

export const auditApi = {
  list(query = {}) {
    return http.get('/audit-logs', { params: withoutEmpty(query) }).then((r) => r.data.data)
  },

  // The action list comes from the log itself rather than a constant in the
  // frontend, so a newly recorded action is filterable without a rebuild.
  filters() {
    return http.get('/audit-logs/filters').then((r) => r.data.data)
  },

  async downloadCsv(filters = {}) {
    const response = await http.get('/audit-logs/export', {
      params: withoutEmpty(filters),
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
