import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './errors'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx answers (404 "not generated yet", 409 "not ready") are facts, not glitches: don't retry them.
        retry: (count, err) => !(err instanceof ApiError && !err.retryable) && count < 2,
      },
      mutations: { retry: false },
    },
  })
}

/** The app's single cache, shared by React (QueryClientProvider) and non-React code such as the upload store. */
export const queryClient = createQueryClient()

