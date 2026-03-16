
import { useEffect } from "react"
import { useNavigate, useLocation, Outlet } from "react-router-dom"
import { useAuthStore } from "@/store/auth-store"

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)
  const init = useAuthStore((state) => state.init)

  useEffect(() => {
    init().catch(() => {})
  }, [init])

  useEffect(() => {
    // Allow access to login page
    if (location.pathname === "/admin/login") {
      // If already authenticated and trying to go to login, redirect to dashboard
      if (!isLoading && isAuthenticated) {
        navigate("/admin/dashboard", { replace: true })
      }
      return
    }

    // Block other admin routes if not authenticated
    if (isLoading) return
    if (!isAuthenticated) {
      navigate("/admin/login", { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname])

  return <Outlet />
}
