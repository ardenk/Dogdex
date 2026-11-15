import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterEach, expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

expect.extend(axeMatchers)
// A quiz round in progress lives in session storage; every test starts without one.
afterEach(() => {
  cleanup()
  sessionStorage.clear()
})
