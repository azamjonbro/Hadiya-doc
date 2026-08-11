import { http } from './http'

export const uploadsApi = {
  image(file) {
    const formData = new FormData()
    formData.append('image', file)
    return http.post('/uploads/image', formData).then((r) => r.data.data)
  },
}
