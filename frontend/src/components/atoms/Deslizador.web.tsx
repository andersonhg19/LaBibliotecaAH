import React, { useEffect, useState } from 'react'

import { PropsDeslizador } from '@componentes/atoms/Deslizador'
import { useTheme } from '@contextos/ThemeContext'
import { teclaMueveDeslizador } from '@utils/teclas'

let estilosPuestos = false
/** Las reglas del pulgar del range no se pueden poner en línea: se inyectan una vez. */
function ponerEstilos() {
  if (estilosPuestos || typeof document === 'undefined') return
  estilosPuestos = true
  const s = document.createElement('style')
  s.textContent = `
  input.bah-rango{-webkit-appearance:none;appearance:none;width:100%;height:44px;background:transparent;margin:0;cursor:pointer;touch-action:pan-y}
  input.bah-rango:focus-visible{outline:2px solid var(--bah-acento);outline-offset:2px;border-radius:6px}
  input.bah-rango::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--bah-acento) 0 var(--bah-p),var(--bah-pista) var(--bah-p) 100%)}
  input.bah-rango::-moz-range-track{height:6px;border-radius:3px;background:var(--bah-pista)}
  input.bah-rango::-moz-range-progress{height:6px;border-radius:3px;background:var(--bah-acento)}
  input.bah-rango::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-8px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFF1C8,#C9A227 60%,#8C6A1C);border:1px solid rgba(0,0,0,.35);box-shadow:0 2px 6px rgba(0,0,0,.45)}
  input.bah-rango::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFF1C8,#C9A227 60%,#8C6A1C);border:1px solid rgba(0,0,0,.35)}
  `
  document.head.appendChild(s)
}

/** Deslizador de latón (web): un <input type="range"> accesible por teclado y lector de pantalla. */
const Deslizador: React.FC<PropsDeslizador> = ({
  valor,
  min,
  max,
  paso,
  etiqueta,
  textoValor,
  onCambio,
  onSoltar,
  testID,
}) => {
  const { colors } = useTheme()
  const [local, setLocal] = useState(valor)
  const [arrastrando, setArrastrando] = useState(false)
  useEffect(() => ponerEstilos(), [])
  useEffect(() => {
    if (!arrastrando) setLocal(valor)
  }, [valor, arrastrando])
  const p = max > min ? ((local - min) / (max - min)) * 100 : 0
  const soltar = () => {
    setArrastrando(false)
    onSoltar(local)
  }
  return (
    <input
      type="range"
      className="bah-rango"
      data-testid={testID}
      aria-label={etiqueta}
      aria-valuetext={textoValor ? textoValor(local) : undefined}
      min={min}
      max={max}
      step={paso}
      value={local}
      style={
        {
          ['--bah-p' as string]: `${p}%`,
          ['--bah-acento' as string]: colors.primary,
          ['--bah-pista' as string]: colors.border,
        } as React.CSSProperties
      }
      onPointerDown={() => setArrastrando(true)}
      onChange={(e) => {
        const v = Number(e.target.value)
        setLocal(v)
        onCambio?.(v)
        if (!arrastrando) onSoltar(v)
      }}
      onPointerUp={soltar}
      onKeyUp={(e) => {
        /* Solo las teclas que lo mueven fijan el valor (QA LV-P6): llegar con Tab no salta a ninguna parte. */
        if (teclaMueveDeslizador(e.key)) onSoltar(local)
      }}
    />
  )
}

export default Deslizador
