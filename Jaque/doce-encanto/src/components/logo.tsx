
import { cn } from "@/lib/utils"

export function Logo({ className, variant = "default" }: { className?: string, variant?: "default" | "footer" }) {
  const logoSrc = variant === "footer" ? "/logo-white.png" : "/logo.png"

  return (
    <div className={cn("relative h-24 w-auto aspect-[3/1]", className)}>
      <img
        src={logoSrc}
        alt="Jallu Confeitaria"
        className={cn(
          "absolute inset-0 w-full h-full object-contain object-left",
          // variant === "footer" && "brightness-0 invert", // Removed filter as we now use a white logo image
        )}
      />
    </div>
  )
}
