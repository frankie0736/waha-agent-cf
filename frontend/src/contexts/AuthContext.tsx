import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { apiClient } from '../lib/api-client'

interface User {
  id: string
  email: string
  name?: string
  image?: string
  verified: boolean
  aihubmixKey?: string
  kbLimit?: number
  agentLimit?: number
  waLimit?: number
  createdAt: string
  lastActiveAt?: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (token: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load user from session on mount
  useEffect(() => {
    loadUserFromSession()
  }, [])

  const loadUserFromSession = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setIsLoading(false)
        return
      }

      // Verify token and get user info from backend
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/auth/session`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
      } else {
        // Token invalid, clear it
        localStorage.removeItem('auth_token')
      }
    } catch (error) {
      console.error('Failed to load user session:', error)
      localStorage.removeItem('auth_token')
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (token: string) => {
    localStorage.setItem('auth_token', token)
    await loadUserFromSession()
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setUser(null)
    // Redirect to login page
    window.location.href = '/login'
  }

  const refreshUser = async () => {
    await loadUserFromSession()
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper hook for requiring authentication
export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/login'
    }
  }, [isAuthenticated, isLoading])

  return { isAuthenticated, isLoading }
}