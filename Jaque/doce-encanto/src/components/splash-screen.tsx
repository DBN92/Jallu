import { motion } from "framer-motion"
import { useEffect, useState } from "react"

interface SplashScreenProps {
  finishLoading: () => void
}

export function SplashScreen({ finishLoading }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      finishLoading()
    }, 1500)

    return () => clearTimeout(timer)
  }, [finishLoading])

  const [particles, setParticles] = useState<Array<{
    id: number
    color: string
    left: number
    width: number
    height: number
    duration: number
    delay: number
  }>>([])

  useEffect(() => {
    setParticles([...Array(30)].map((_, i) => ({
      id: i,
      color: ['bg-pink-300', 'bg-blue-300', 'bg-yellow-300', 'bg-purple-300'][i % 4],
      left: Math.random() * 100,
      width: Math.random() * 8 + 4,
      height: Math.random() * 8 + 4,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 2
    })))
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/60 backdrop-blur-xl"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-pink-50/50 to-white/20 opacity-50" />

        {/* Falling Sugar Sprinkles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    className={`absolute rounded-full ${particle.color}`}
                    initial={{
                        top: -20,
                        left: `${particle.left}%`,
                        width: particle.width,
                        height: particle.height,
                        rotate: 0,
                        opacity: 0.6
                    }}
                    animate={{
                        top: "110%",
                        rotate: 360,
                    }}
                    transition={{
                        duration: particle.duration,
                        repeat: Infinity,
                        ease: "linear",
                        delay: particle.delay
                    }}
                />
            ))}
        </div>

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
        className="relative flex flex-col items-center z-10"
      >
        {/* Bouncing Cupcake */}
        <motion.div
            animate={{
                y: [0, -20, 0],
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
            }}
            transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
            }}
            className="text-8xl filter drop-shadow-xl cursor-default"
        >
            🧁
        </motion.div>

      </motion.div>
    </motion.div>
  )
}
