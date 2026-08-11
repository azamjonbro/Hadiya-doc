import { ref } from 'vue'
import { http } from '@/services/http'

export function useHealthCheck() {
  const status = ref('checking')

  async function check() {
    status.value = 'checking'
    try {
      const { data } = await http.get('/health')
      status.value = data.success ? 'online' : 'offline'
    } catch {
      status.value = 'offline'
    }
  }

  return { status, check }
}
