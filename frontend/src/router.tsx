import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router'
import { RootLayout } from './components/layouts/RootLayout'
import { DashboardLayout } from './components/layouts/DashboardLayout'
import { LoginPage } from './pages/Login'
import { AuthCallbackPage } from './pages/AuthCallback'
import { SettingsPage } from './pages/Settings'
import { useRequireAuth } from './contexts/AuthContext'

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useRequireAuth()
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }
  
  if (!isAuthenticated) {
    return null // useRequireAuth will redirect
  }
  
  return <>{children}</>
}

// Root route
const rootRoute = createRootRoute({
  component: RootLayout,
})

// Index route
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold mb-4">WA-Agent</h1>
      <p className="text-gray-600">WhatsApp 智能客服系统</p>
    </div>
  ),
})

// Login route
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage,
})

// Auth callback route
const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'auth/callback',
  component: AuthCallbackPage,
})

// Dashboard layout route (protected)
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'dashboard',
  component: () => (
    <ProtectedRoute>
      <DashboardLayout />
    </ProtectedRoute>
  ),
})

// Dashboard index
const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: () => (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Dashboard</h2>
      <p className="text-gray-600">Welcome to your dashboard</p>
    </div>
  ),
})

// Knowledge bases route
const knowledgeBasesRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'knowledge-bases',
  component: () => (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">知识库管理</h2>
      <p className="text-gray-600">管理您的知识库</p>
    </div>
  ),
})

// Agents route
const agentsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'agents',
  component: () => (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">智能体管理</h2>
      <p className="text-gray-600">配置和管理您的智能体</p>
    </div>
  ),
})

// WhatsApp sessions route
const sessionsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'sessions',
  component: () => (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">WhatsApp 账号</h2>
      <p className="text-gray-600">管理您的 WhatsApp 会话</p>
    </div>
  ),
})

// Settings route
const settingsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: 'settings',
  component: SettingsPage,
})

// Create the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authCallbackRoute,
  dashboardRoute.addChildren([
    dashboardIndexRoute,
    knowledgeBasesRoute,
    agentsRoute,
    sessionsRoute,
    settingsRoute,
  ]),
])

// Create the router
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})