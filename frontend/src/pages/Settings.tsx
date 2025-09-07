import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { 
  User, 
  Key, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Database,
  Bot,
  MessageSquare,
  Save,
  LogOut
} from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth()
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Query to get current API key status
  const { data: apiKeyStatus } = useQuery({
    queryKey: ['api-key-status'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/user/api-key-status`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      })
      return response.json()
    },
  })

  // Mutation to save API key
  const saveApiKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/user/api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ apiKey: key }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to save API key')
      }
      
      return response.json()
    },
    onSuccess: () => {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      refreshUser()
    },
  })

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      saveApiKeyMutation.mutate(apiKey)
    }
  }

  const getVerificationBadge = () => {
    if (user?.verified) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          已验证
        </Badge>
      )
    }
    return (
      <Badge variant="secondary">
        <Clock className="w-3 h-3 mr-1" />
        待审核
      </Badge>
    )
  }

  const getQuotaUsage = (used: number = 0, limit: number = 0) => {
    if (limit === 0) return '无限制'
    return `${used} / ${limit}`
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">账户设置</h1>

      {/* User Profile Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            个人信息
          </CardTitle>
          <CardDescription>您的账户基本信息</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {user?.image && (
                  <img
                    src={user.image}
                    alt={user.name || user.email}
                    className="w-16 h-16 rounded-full"
                  />
                )}
                <div>
                  <p className="font-semibold text-lg">{user?.name || '未设置昵称'}</p>
                  <p className="text-gray-600">{user?.email}</p>
                </div>
              </div>
              {getVerificationBadge()}
            </div>

            {!user?.verified && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  您的账户正在等待管理员审核。审核通过后，您将获得系统使用权限。
                </AlertDescription>
              </Alert>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600">
                注册时间：{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}
              </p>
              <p className="text-sm text-gray-600">
                最后活动：{user?.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString('zh-CN') : '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key Configuration */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            AIHubMix API 配置
          </CardTitle>
          <CardDescription>
            配置您的 AIHubMix API Key 以使用 AI 功能
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {apiKeyStatus?.hasKey ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  API Key 已配置
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  请配置您的 AIHubMix API Key 以使用智能回复功能
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? '隐藏' : '显示'}
                </Button>
              </div>
              <p className="text-sm text-gray-600">
                您可以从 <a href="https://aihubmix.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AIHubMix</a> 获取 API Key
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim() || saveApiKeyMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                保存 API Key
              </Button>
              
              {saveSuccess && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  保存成功
                </span>
              )}
            </div>

            {saveApiKeyMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  保存失败，请重试
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quota Usage */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>配额使用情况</CardTitle>
          <CardDescription>您的资源使用限制和当前使用量</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Database className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">知识库</p>
                  <p className="font-semibold">{getQuotaUsage(0, user?.kbLimit)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Bot className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">智能体</p>
                  <p className="font-semibold">{getQuotaUsage(0, user?.agentLimit)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <MessageSquare className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">WhatsApp 账号</p>
                  <p className="font-semibold">{getQuotaUsage(0, user?.waLimit)}</p>
                </div>
              </div>
            </div>

            {(!user?.verified || (user?.kbLimit === 0 && user?.agentLimit === 0 && user?.waLimit === 0)) && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  配额由管理员分配。如需调整配额，请联系管理员。
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logout Button */}
      <Card>
        <CardHeader>
          <CardTitle>账户操作</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}