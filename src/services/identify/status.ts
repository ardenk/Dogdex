/**
 * Whether a photo may be sent for breed suggestions right now, and if not, why. Pure so the Log screen's
 * wording can be tested without a network.
 */
export type IdentifyStatus = 'on' | 'off' | 'sign-in' | 'offline' | 'unavailable'

export function identifyStatus(input: { cloudEnabled: boolean; signedIn: boolean; optedIn: boolean; online: boolean }): IdentifyStatus {
  if (!input.cloudEnabled) return 'unavailable'
  if (!input.optedIn) return 'off'
  if (!input.signedIn) return 'sign-in'
  if (!input.online) return 'offline'
  return 'on'
}

/** What the Reveal screen says instead of suggestions. `null` when suggestions are being fetched normally. */
export function identifyStatusMessage(status: IdentifyStatus): string | null {
  switch (status) {
    case 'on':
      return null
    case 'off':
      return 'Breed suggestions from photos are off. You can turn them on in You. Pick the breed below.'
    case 'sign-in':
      return 'Sign in to get breed suggestions from your photo. Pick the breed below.'
    case 'offline':
      return 'You’re offline, so there are no suggestions. Pick the breed below.'
    case 'unavailable':
      return 'Breed suggestions need the cloud connection, which isn’t set up here. Pick the breed below.'
  }
}
