"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuthStore } from "@/store/auth-store"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isAuthenticated && pathname !== "/admin/login") {
      router.push("/admin/login")
    }
  }, [mounted, isAuthenticated, router, pathname])

  if (!mounted) {
    return null
  }

  // Allow access to login page without authentication
  if (pathname === "/admin/login") {
    return <>{children}</>
  }

  // Block other admin routes if not authenticated
  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
