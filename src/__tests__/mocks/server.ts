import { setupServer } from 'msw/node'
import { handlers, serverErrorHandlers } from './handlers'

export const server = setupServer(...handlers)

export function useServerError() {
  server.use(...serverErrorHandlers)
}
