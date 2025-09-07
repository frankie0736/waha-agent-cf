import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { login } = useAuth()

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    try {
      // Get token from URL params
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const error = params.get('error')

      if (error) {
        setError(decodeURIComponent(error))
        setTimeout(() => {
          navigate({ to: '/login' })
        }, 3000)
        return
      }

      if (!token) {
        setError('No authentication token received')
        setTimeout(() => {
          navigate({ to: '/login' })
        }, 3000)
        return
      }

      // Store token and load user
      await login(token)
      
      // Redirect to dashboard
      navigate({ to: '/dashboard' })
    } catch (err) {
      console.error('Auth callback error:', err)
      setError('Authentication failed. Please try again.')
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 3000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        {error ? (
          <div className="space-y-4">
            <div className="text-red-600 dark:text-red-400">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Authentication Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400">{error}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Redirecting to login page...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Completing authentication...
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we log you in
            </p>
          </div>
        )}
      </div>
    </div>
  )
}