import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Loader2, AlertCircle } from 'lucide-react'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Redirect to backend Google OAuth endpoint
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8787'
      window.location.href = `${baseUrl}/api/auth/signin/google`
    } catch (err) {
      setError('Failed to initiate Google login. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            WA-Agent
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            智能 WhatsApp 客服平台
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>登录到您的账户</CardTitle>
            <CardDescription>
              使用 Google 账号快速登录，开始管理您的智能客服
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在连接...
                </>
              ) : (
                <>
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  使用 Google 账号登录
                </>
              )}
            </Button>

            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              <p>首次登录将自动创建账户</p>
              <p className="mt-1">登录即表示您同意我们的服务条款</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          <p>需要帮助？请联系管理员</p>
        </div>
      </div>
    </div>
  )
}