import { BrowserRouter as Router, Routes, Route, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CupcakeCursor } from '@/components/cupcake-cursor'
import { WorkopsChatWidget } from '@/components/workops-chat-widget'
import { SplashScreen } from '@/components/splash-screen'
import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'

import { useProductStore } from '@/store/product-store'
import { useConfigStore } from '@/store/config-store'

// Pages
import HomePage from '@/pages/Home'
import LoginPage from '@/pages/admin/Login'
import DashboardPage from '@/pages/admin/Dashboard'
import AdminLayout from '@/pages/admin/Layout'
import OrdersPage from '@/pages/Orders'
import MobileOrdersPage from '@/pages/admin/MobileOrders'

function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      const element = document.getElementById(id)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname, hash])

  return null
}

function Layout() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')

  return (
    <div className="flex min-h-screen flex-col font-sans">
      <CupcakeCursor />
      {!isAdmin && <Header />}
      <main className="flex-1">
        <Outlet />
      </main>
      {!isAdmin && <Footer />}
      {!isAdmin && <WorkopsChatWidget />}
    </div>
  )
}

function AppShell() {
  const fetchProducts = useProductStore((state) => state.fetchProducts)
  const fetchConfig = useConfigStore((state) => state.fetchConfig)
  const [isLoading, setIsLoading] = useState(() => !window.location.pathname.startsWith('/admin'))
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    fetchProducts()
    fetchConfig()
  }, [fetchProducts, fetchConfig])

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    if (!isStandalone) return

    if (location.pathname === '/' || location.pathname === '/index.html') {
      navigate('/admin/mobile', { replace: true })
    }
  }, [location.pathname, navigate])

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && <SplashScreen finishLoading={() => setIsLoading(false)} />}
      </AnimatePresence>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="orders" element={<OrdersPage />} />
        </Route>

        <Route path="/admin" element={<AdminLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="mobile" element={<MobileOrdersPage />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" richColors />
    </>
  )
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  )
}

export default App
