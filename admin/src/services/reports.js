import { http } from './http'

export const reportsApi = {
  listTypes() {
    return http.get('/reports').then((r) => r.data.data.types)
  },

  async download(type, format) {
    const response = await http.get(`/reports/${type}/export`, { params: { format }, responseType: 'blob' })
    const blob = new Blob([response.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
