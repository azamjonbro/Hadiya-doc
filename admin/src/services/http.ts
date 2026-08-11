import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  withCredentials: true,
})

// Auth-refresh-on-401 interceptor is added in Phase 2 once /auth/refresh exists.
