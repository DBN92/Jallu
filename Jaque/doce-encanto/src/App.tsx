import { BrowserRouter as Router, Routes, Route, Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CupcakeCursor } from '@/components/cupcake-cursor'
import { WorkopsChatWidget } from '@/components/workops-chat-widget'
import { SplashScreen } from '@/components/splash-screen'
import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'

// Pages
import HomePage from '@/pages/Home'
import LoginPage from '@/pages/admin/Login'
import DashboardPage from '@/pages/admin/Dashboard'
import AdminLayout from '@/pages/admin/Layout'
import OrdersPage from '@/pages/Orders'

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

function App() {
  const [isLoading, setIsLoading] = useState(() => !window.location.pathname.startsWith('/admin'))

  return (
    <Router>
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
        </Route>
      </Routes>
      <Toaster position="bottom-right" richColors />
    </Router>
  )
}

export default App
