import { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api/client'

const SLOW_AFTER_MS = 1500

/**
 * Wake the API as soon as the page loads, so it's warm by the time the driver submits.
 * If the server is slow to answer (a cold start on the free tier), say so kindly.
 */
export function useWarmup(): void {
  useEffect(() => {
    let settled = false
    let toastId: string | number | undefined
    const timer = window.setTimeout(() => {
      if (settled) return
      toastId = toast.loading('Warming up the dispatcher…', {
        description:
          "Free-tier servers nap when nobody's around. Fill in your trip, it'll be ready in a few seconds.",
      })
    }, SLOW_AFTER_MS)

    api
      .health()
      .then(() => {
        settled = true
        if (toastId !== undefined) {
          toast.success("Dispatcher's awake. Ready when you are.", {
            id: toastId,
            description: undefined,
            duration: 2500,
          })
        }
      })
      .catch(() => {
        settled = true
        toast.error("Can't reach the server right now.", {
          id: toastId,
          description: 'Routes and weather need the API. Try refreshing in a moment.',
        })
      })
      .finally(() => window.clearTimeout(timer))

    return () => window.clearTimeout(timer)
  }, [])
}
