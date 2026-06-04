import { useEffect, useState } from 'react'
import { syncEngine, type SyncState } from './sync'

/** Subscribe a component to live sync status (drives the header sync dot). */
export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(syncEngine.getState())
  useEffect(() => syncEngine.subscribe(setState), [])
  return state
}
