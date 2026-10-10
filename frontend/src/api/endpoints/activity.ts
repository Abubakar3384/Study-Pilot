import { api } from '../client'
import type { ActivityItemDto } from '../types'

export const activityApi = {
  recent: (limit = 20, signal?: AbortSignal) =>
    api<{ items: ActivityItemDto[] }>(`/activity?limit=${limit}`, { signal }).then((r) => r.items),
}
