export type ExtensionHostStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ExtensionHostState {
  status: ExtensionHostStatus
  pid?: number
  startedAt?: number
  error?: string
}

export interface LocalExtensionInfo {
  id: string
  name: string
  publisher?: string
  version?: string
  displayName?: string
  description?: string
  path: string
  enabled: boolean
  iconPath?: string
  categories?: string[]
}

export interface ExtensionHostMessage {
  level: 'info' | 'warning' | 'error'
  message: string
}
