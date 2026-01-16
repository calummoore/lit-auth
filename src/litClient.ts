import { createLitClient, type LitClientType } from '@lit-protocol/lit-client'
import { nagaDev } from '@lit-protocol/networks'

let cachedClient: Promise<LitClientType> | null = null

export const getLitClient = async (): Promise<LitClientType> => {
  if (!cachedClient) {
    cachedClient = createLitClient({
      network: nagaDev,
    })
  }

  return cachedClient
}

export const litNetworkName = 'Naga Dev'
