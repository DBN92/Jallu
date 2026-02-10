"use client"

import { useEffect, useState } from "react"
import { motion, useSpring, useMotionValue } from "framer-motion"

export function CupcakeCursor() {
  const [isVisible, setIsVisible] = useState(false)
  const [trail, setTrail] = useState<{ x: number; y: number; id: number }[]>([])
  const cursorX = useMotionValue(-100)
  const cursorY = useMotionValue(-100)
  
  // Suavização do movimento
  const springConfig = { damping: 25, stiffness: 300 }
  const cursorXSpring = useSpring(cursorX, springConfig)
  const cursorYSpring = useSpring(cursorY, springConfig)

  useEffect(() => {
    // Apenas ativa em desktop
    const mediaQuery = window.matchMedia("(pointer: fine)")
    setIsVisible(mediaQuery.matches)

    const handleResize = () => setIsVisible(mediaQuery.matches)
    mediaQuery.addEventListener("change", handleResize)
    return () => mediaQuery.removeEventListener("change", handleResize)
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX + 8) // Desloca para a direita
      cursorY.set(e.clientY + 12) // Desloca para baixo

      // Adiciona partículas ao rastro
      if (Math.random() > 0.8) {
        setTrail((prev) => [
          ...prev.slice(-15), // Mantém apenas os últimos 15 flocos
          { 
            x: e.clientX + 20 + (Math.random() * 10 - 5), // Centralizado no cupcake (8px offset + 12px meio)
            y: e.clientY + 24 + (Math.random() * 10 - 5), // Centralizado no cupcake (12px offset + 12px meio)
            id: Date.now() 
          },
        ])
      }
    }

    window.addEventListener("mousemove", moveCursor)

    return () => {
      window.removeEventListener("mousemove", moveCursor)
    }
  }, [cursorX, cursorY, isVisible])

  if (!isVisible) return null

  return (
    <>
      {/* Rastro de Flocos de Açúcar */}
      {trail.map((flake) => (
        <motion.div
          key={flake.id}
          initial={{ opacity: 0.8, scale: 1, y: 0 }}
          animate={{ opacity: 0, scale: 0, y: 20 }}
          transition={{ duration: 1 }}
          className="pointer-events-none fixed z-[9998] h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
          style={{
            left: flake.x,
            top: flake.y,
          }}
        />
      ))}

      {/* Cupcake */}
      <motion.div
        className="pointer-events-none fixed left-0 top-0 z-[9999] flex h-8 w-8 items-center justify-center text-2xl"
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
        }}
      >
        🧁
      </motion.div>
    </>
  )
}
