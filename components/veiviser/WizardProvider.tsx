'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Veiviser } from './Veiviser'

/**
 * Where the Veiviser lives: once, in the signed-in shell, so any screen can open it and
 * it survives navigation beneath it (D-76). The design opens it from Oversikt's
 * "Veiviser" and Oppsett's "Kjør veiviseren", and by itself on the first run.
 *
 * "First run" is the database's answer (`getWizardGate`): no round at all, and the wizard
 * neither finished nor put aside. "Fortsett senere" keeps the step and closes; it does
 * not put the wizard aside, so it opens again in a later session — but not again in this
 * one, which is what the session flag is for.
 */
const LATER = 'op_wizard_later'

const Ctx = createContext<{ open: () => void; canRun: boolean }>({ open: () => {}, canRun: false })

export function WizardProvider({
  gate,
  face,
  children,
}: {
  gate: { canRun: boolean; autoOpen: boolean }
  face: string
  children: React.ReactNode
}) {
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    if (!gate.autoOpen) return
    let later = false
    try {
      later = sessionStorage.getItem(LATER) === '1'
    } catch {}
    if (!later) setOpen(true)
  }, [gate.autoOpen])

  const open = useCallback(() => setOpen(true), [])
  const close = useCallback((later: boolean) => {
    if (later) {
      try {
        sessionStorage.setItem(LATER, '1')
      } catch {}
    }
    setOpen(false)
  }, [])

  return (
    <Ctx.Provider value={{ open, canRun: gate.canRun }}>
      {children}
      {isOpen && gate.canRun ? <Veiviser face={face} onClose={close} /> : null}
    </Ctx.Provider>
  )
}

/** A control that opens the wizard; renders nothing for anyone who could not complete it. */
export function WizardButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { open, canRun } = useContext(Ctx)
  if (!canRun) return null
  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  )
}
