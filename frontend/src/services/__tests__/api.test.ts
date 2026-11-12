import AsyncStorage from '@react-native-async-storage/async-storage'

import api, { TOKEN_KEY } from '@servicios/api'

describe('api service', () => {
  it('creates axios instance with correct baseURL', () => {
    expect(api.defaults.baseURL).toBe('http://localhost:9920')
  })

  it('has Content-Type header set to application/json', () => {
    expect(api.defaults.headers['Content-Type']).toBe('application/json')
  })

  it('has a timeout of 15000ms', () => {
    expect(api.defaults.timeout).toBe(15000)
  })

  it('exports the correct TOKEN_KEY', () => {
    expect(TOKEN_KEY).toBe('@biblioteca_ah_token')
  })

  it('adds Authorization header when token exists in storage', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('test-token-123')

    // Get the request interceptor and run it manually
    const interceptors = (
      api.interceptors.request as unknown as {
        handlers: { fulfilled: (c: unknown) => Promise<{ headers: Record<string, unknown> }> }[]
      }
    ).handlers
    const requestInterceptor = interceptors[0]

    const config = {
      headers: {
        set: jest.fn(),
        get: jest.fn(),
        has: jest.fn(),
        delete: jest.fn(),
      } as Record<string, unknown>,
    }

    const result = await requestInterceptor.fulfilled(config)
    expect(result.headers.Authorization).toBe('Bearer test-token-123')
  })

  it('does not add Authorization header when no token in storage', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null)

    const interceptors = (
      api.interceptors.request as unknown as {
        handlers: { fulfilled: (c: unknown) => Promise<{ headers: Record<string, unknown> }> }[]
      }
    ).handlers
    const requestInterceptor = interceptors[0]

    const config = {
      headers: {
        set: jest.fn(),
        get: jest.fn(),
        has: jest.fn(),
        delete: jest.fn(),
      } as Record<string, unknown>,
    }

    const result = await requestInterceptor.fulfilled(config)
    expect(result.headers.Authorization).toBeUndefined()
  })
})
