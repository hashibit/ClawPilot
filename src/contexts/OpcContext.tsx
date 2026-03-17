import React, { createContext, useContext, useEffect, useState } from 'react'
import type { OpcConfig } from '../lib/types'
import { getAllOpcs, setCurrentOpc } from '../lib/api'

interface OpcContextValue {
  opcs: OpcConfig[]
  currentOpc: OpcConfig | null
  loading: boolean
  reload: () => Promise<void>
  selectOpc: (opc: OpcConfig) => Promise<void>
}

const OpcContext = createContext<OpcContextValue | null>(null)

export function OpcProvider({ children }: { children: React.ReactNode }) {
  const [opcs, setOpcs] = useState<OpcConfig[]>([])
  const [currentOpc, setCurrentOpcState] = useState<OpcConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    try {
      const list = await getAllOpcs()
      setOpcs(list)
      const active = list.find(o => o.is_active) ?? list[0] ?? null
      setCurrentOpcState(active)
    } catch (e) {
      console.error('Failed to load opcs:', e)
    } finally {
      setLoading(false)
    }
  }

  const selectOpc = async (opc: OpcConfig) => {
    await setCurrentOpc(opc.id)
    setCurrentOpcState(opc)
    // reflect is_active change locally
    setOpcs(prev => prev.map(o => ({ ...o, is_active: o.id === opc.id })))
  }

  useEffect(() => { reload() }, [])

  return (
    <OpcContext.Provider value={{ opcs, currentOpc, loading, reload, selectOpc }}>
      {children}
    </OpcContext.Provider>
  )
}

export function useOpc() {
  const ctx = useContext(OpcContext)
  if (!ctx) throw new Error('useOpc must be used within OpcProvider')
  return ctx
}
