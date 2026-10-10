import { runGeneration, runningJob, trackGeneration, useGenerations, waitForIdle } from './generation'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => useGenerations.setState({ jobs: {} }))

describe('runGeneration', () => {
  it('tracks the job while it runs and hands the result to onSuccess', async () => {
    const d = deferred<string>()
    const onSuccess = vi.fn()
    const run = runGeneration('doc', 'notes', () => d.promise, { onSuccess })
    expect(runningJob()).toMatchObject({ docId: 'doc', kind: 'notes', status: 'running' })
    d.resolve('done')
    await expect(run).resolves.toBe('done')
    expect(onSuccess).toHaveBeenCalledWith('done')
    expect(runningJob()).toBeUndefined()
  })

  it('refuses a second AI job while one is running', async () => {
    const d = deferred<string>()
    const first = runGeneration('doc', 'notes', () => d.promise)
    const second = vi.fn(() => Promise.resolve('x'))
    await expect(runGeneration('doc', 'flashcards', second)).resolves.toBeUndefined()
    expect(second).not.toHaveBeenCalled()
    d.resolve('ok')
    await first
  })

  it('keeps a failed job as an error, and frees the lock', async () => {
    const onError = vi.fn()
    await runGeneration('doc', 'quiz', () => Promise.reject(new Error('boom')), { onError, silentError: true })
    expect(onError).toHaveBeenCalled()
    expect(runningJob()).toBeUndefined()
    expect(useGenerations.getState().jobs['doc:quiz']).toMatchObject({ status: 'error' })
  })
})

describe('waitForIdle', () => {
  it('resolves only after the running job finishes', async () => {
    const d = deferred<void>()
    const job = trackGeneration('doc', 'summary', () => d.promise)
    let idle = false
    const wait = waitForIdle().then(() => {
      idle = true
    })
    await Promise.resolve()
    expect(idle).toBe(false)
    d.resolve()
    await job
    await wait
    expect(idle).toBe(true)
  })
})
