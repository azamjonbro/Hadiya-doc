import { ref } from 'vue'
import type { ApiResponse } from '@lms/shared'
import { http } from '@/services/http'

type HealthStatus = 'checking' | 'online' | 'offline'

export function useHealthCheck() {
  const status = ref<HealthStatus>('checking')

  async function check(): Promise<void> {
    status.value = 'checking'
    try {
      const { data } = await http.get<ApiResponse<{ status: string }>>('/health')
      status.value = data.success ? 'online' : 'offline'
    } catch {
      status.value = 'offline'
    }
  }

  return { status, check }
}
