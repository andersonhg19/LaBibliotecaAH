import { useEffect, useState } from 'react'

/** La hora, refrescada cada `cadaMs` mientras `activo` (para cuentas atrás como «≈ 20 s»). */
export function useAhora(activo: boolean, cadaMs = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!activo) return
    setAhora(Date.now())
    const t = setInterval(() => setAhora(Date.now()), cadaMs)
    return () => clearInterval(t)
  }, [activo, cadaMs])
  return ahora
}
