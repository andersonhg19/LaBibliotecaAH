import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number
}

interface ToastContextType {
  toasts: ToastItem[]
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void
  hideToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration?: number) => {
      const dur = duration ?? (type === 'error' ? 5000 : 3000)
      const id = `toast-${++counterRef.current}`
      const toast: ToastItem = { id, type, title, message, duration: dur }

      setToasts((prev) => [...prev, toast])

      setTimeout(() => {
        hideToast(id)
      }, dur)
    },
    [hideToast],
  )

  return <ToastContext.Provider value={{ toasts, showToast, hideToast }}>{children}</ToastContext.Provider>
}

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
