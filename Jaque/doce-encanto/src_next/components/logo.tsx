"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

export function Logo({ className, variant = "default" }: { className?: string, variant?: "default" | "footer" }) {
  const logoSrc = variant === "footer" ? "/logo-white.png" : "/logo.png"

  return (
    <div className={cn("relative h-32 w-auto aspect-[3/1]", className)}>
      <Image
        src={logoSrc}
        alt="Jallu Confeitaria"
        fill
        className={cn(
          "object-contain object-left",
          // variant === "footer" && "brightness-0 invert", // Removed filter as we now use a white logo image
        )}
        priority
      />
    </div>
  )
}
