import { http } from './http'

export const faceApi = {
  enroll(userId, photos) {
    const form = new FormData()
    form.append('userId', userId)
    photos.forEach((blob, i) => form.append('photos', blob, `frame-${i}.jpg`))
    return http.post('/auth/face/enroll', form).then((r) => r.data.data)
  },

  reEnroll(userId, photos) {
    const form = new FormData()
    form.append('userId', userId)
    photos.forEach((blob, i) => form.append('photos', blob, `frame-${i}.jpg`))
    return http.post('/auth/face/re-enroll', form).then((r) => r.data.data)
  },

  // Two call shapes: an already-authenticated user needs only the photo (the
  // http instance attaches their bearer token automatically); the mid-login
  // case has no session yet, so it passes verificationToken instead — the
  // backend resolves identity from whichever one shows up.
  verify(photo, { verificationToken } = {}) {
    const form = new FormData()
    form.append('photo', photo, 'verify.jpg')
    if (verificationToken) form.append('verificationToken', verificationToken)
    return http.post('/auth/face/verify', form).then((r) => r.data.data)
  },

  status(userId) {
    const path = userId ? `/auth/face/status/${userId}` : '/auth/face/status'
    return http.get(path).then((r) => r.data.data)
  },

  setEnabled(userId, enabled) {
    return http.patch(`/auth/face/${userId}`, { enabled }).then((r) => r.data.data)
  },

  // Streamed by the API behind SUPERADMIN-only + audited access — no public
  // URL, so it is fetched as a blob and shown from an object URL, same
  // pattern as proctorApi.imageObjectUrl.
  async referenceImageObjectUrl(userId) {
    const r = await http.get(`/auth/face/${userId}/reference-image`, { responseType: 'blob' })
    return URL.createObjectURL(r.data)
  },
}
