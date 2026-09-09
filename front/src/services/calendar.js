import { http } from './http'

export const calendarApi = {
  list(params = {}) {
    return http.get('/calendar', { params }).then((r) => r.data.data)
  },

  /**
   * Downloads the .ics.
   *
   * Fetched through `http` rather than pointed at with a link, because the
   * endpoint needs the Authorization header — a plain <a href> would arrive
   * without it and download a 401 page named calendar.ics.
   */
  async download(params = {}) {
    const response = await http.get('/calendar/export.ics', { params, responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([response.data], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `qollanma-${new Date().toISOString().slice(0, 10)}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
