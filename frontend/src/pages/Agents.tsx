import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Slider } from '../components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog'
import {
  Plus,
  Bot,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  Save,
  Copy,
  TestTube,
  MessageSquare,
  Brain,
  Sparkles,
  Settings,
  Database,
  Play,
  Code,
  Download,
  Upload,
  FileText,
  Loader2,
  Send,
  RefreshCw,
  X,
  Zap,
  Briefcase,
  HelpCircle
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Agent {
  id: string
  userId: string
  name: string
  description?: string
  systemPrompt: string
  model: string
  temperature: number
  maxTokens: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  createdAt: number
  updatedAt: number
  knowledgeBases?: Array<{
    kbId: string
    priority: number
    name?: string
  }>
}

interface AgentTemplate {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  systemPrompt: string
  model: string
  temperature: number
  maxTokens: number
}

const agentTemplates: AgentTemplate[] = [
  {
    id: 'customer-service',
    name: '客服助手',
    description: '专业的客户服务代表，友好、耐心、高效',
    icon: <HelpCircle className="w-5 h-5" />,
    systemPrompt: `你是一位专业的客服代表，具有以下特点：
1. 友好、耐心、理解客户需求
2. 快速准确地回答问题
3. 提供专业的解决方案
4. 保持积极正面的态度
5. 适时表达同理心

请基于知识库内容回答客户问题，如果知识库中没有相关信息，请礼貌地告知并建议联系人工客服。`,
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000,
  },
  {
    id: 'sales-assistant',
    name: '销售助手',
    description: '专业的销售顾问，善于挖掘需求、推荐产品',
    icon: <Briefcase className="w-5 h-5" />,
    systemPrompt: `你是一位专业的销售顾问，具有以下特点：
1. 主动了解客户需求
2. 准确推荐合适的产品或服务
3. 专业介绍产品优势和特点
4. 处理客户疑虑和异议
5. 引导客户完成购买决策

请基于知识库中的产品信息，为客户提供专业的购买建议。`,
    model: 'gpt-3.5-turbo',
    temperature: 0.8,
    maxTokens: 1200,
  },
  {
    id: 'tech-support',
    name: '技术支持',
    description: '专业的技术支持工程师，解决技术问题',
    icon: <Zap className="w-5 h-5" />,
    systemPrompt: `你是一位专业的技术支持工程师，具有以下特点：
1. 准确识别技术问题
2. 提供清晰的解决步骤
3. 使用简单易懂的语言
4. 耐心指导操作过程
5. 记录和跟进问题状态

请基于知识库中的技术文档，帮助用户解决技术问题。如果问题复杂，建议用户联系高级技术支持。`,
    model: 'gpt-4',
    temperature: 0.5,
    maxTokens: 1500,
  },
]

const availableModels = [
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { value: 'gpt-4', label: 'GPT-4', provider: 'OpenAI' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
  { value: 'gemini-pro', label: 'Gemini Pro', provider: 'Google' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'Google' },
]

export function AgentsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)
  
  // Form states
  const [agentForm, setAgentForm] = useState({
    name: '',
    description: '',
    systemPrompt: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  })
  
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<
    Array<{ kbId: string; priority: number }>
  >([])
  
  const [testMessage, setTestMessage] = useState('')
  const [testResponse, setTestResponse] = useState('')
  const [isTestLoading, setIsTestLoading] = useState(false)

  // Fetch agents
  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/agents`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      })
      if (!response.ok) throw new Error('Failed to fetch agents')
      return response.json()
    },
  })

  // Fetch knowledge bases for association
  const { data: knowledgeBases } = useQuery({
    queryKey: ['knowledge-bases-for-agents'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/knowledge-base`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      })
      if (!response.ok) throw new Error('Failed to fetch knowledge bases')
      return response.json()
    },
  })

  // Create agent mutation
  const createAgentMutation = useMutation({
    mutationFn: async (data: typeof agentForm & { knowledgeBases?: typeof selectedKnowledgeBases }) => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to create agent')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setIsCreateDialogOpen(false)
      setIsTemplateDialogOpen(false)
      resetForm()
    },
  })

  // Update agent mutation
  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof agentForm & { knowledgeBases?: typeof selectedKnowledgeBases }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/agents/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify(data),
        }
      )
      if (!response.ok) throw new Error('Failed to update agent')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setIsEditDialogOpen(false)
      resetForm()
    },
  })

  // Delete agent mutation
  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/agents/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
        }
      )
      if (!response.ok) throw new Error('Failed to delete agent')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setSelectedAgent(null)
      setIsDeleteDialogOpen(false)
    },
  })

  // Test agent
  const testAgent = async () => {
    if (!selectedAgent || !testMessage) return
    
    setIsTestLoading(true)
    setTestResponse('')
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/agents/${selectedAgent.id}/test`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({ message: testMessage }),
        }
      )
      
      if (!response.ok) throw new Error('Failed to test agent')
      
      const data = await response.json()
      setTestResponse(data.response)
    } catch (error) {
      console.error('Test failed:', error)
      setTestResponse('测试失败，请检查配置并重试')
    } finally {
      setIsTestLoading(false)
    }
  }

  const resetForm = () => {
    setAgentForm({
      name: '',
      description: '',
      systemPrompt: '',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    })
    setSelectedKnowledgeBases([])
    setSelectedTemplate(null)
  }

  const applyTemplate = (template: AgentTemplate) => {
    setAgentForm({
      ...agentForm,
      name: template.name,
      description: template.description,
      systemPrompt: template.systemPrompt,
      model: template.model,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
    })
    setSelectedTemplate(template)
    setIsTemplateDialogOpen(false)
    setIsCreateDialogOpen(true)
  }

  const exportConfig = (agent: Agent) => {
    const config = {
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      topP: agent.topP,
      frequencyPenalty: agent.frequencyPenalty,
      presencePenalty: agent.presencePenalty,
      knowledgeBases: agent.knowledgeBases,
    }
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agent.name.replace(/\s+/g, '-')}-config.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getModelBadge = (model: string) => {
    const modelInfo = availableModels.find(m => m.value === model)
    if (!modelInfo) return <Badge variant="secondary">{model}</Badge>
    
    const providerColors: Record<string, string> = {
      OpenAI: 'bg-green-100 text-green-800',
      Anthropic: 'bg-blue-100 text-blue-800',
      Google: 'bg-purple-100 text-purple-800',
    }
    
    return (
      <Badge className={providerColors[modelInfo.provider] || 'bg-gray-100 text-gray-800'}>
        {modelInfo.label}
      </Badge>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">智能体管理</h1>
          <p className="text-gray-600 mt-2">配置和管理您的 AI 智能体</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsTemplateDialogOpen(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            从模板创建
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} disabled={!user?.verified}>
            <Plus className="w-4 h-4 mr-2" />
            创建智能体
          </Button>
        </div>
      </div>

      {!user?.verified && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            您的账户正在等待审核。审核通过后才能创建和管理智能体。
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                我的智能体
              </CardTitle>
              <CardDescription>
                配额: {agents?.length || 0} / {user?.agentLimit || 0}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : agents?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>暂无智能体</p>
                  <p className="text-sm mt-2">创建您的第一个智能体</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {agents?.map((agent: Agent) => (
                    <div
                      key={agent.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedAgent?.id === agent.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => setSelectedAgent(agent)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            {agent.name}
                          </h4>
                          {agent.description && (
                            <p className="text-sm text-gray-600 mt-1">{agent.description}</p>
                          )}
                          <div className="mt-2">
                            {getModelBadge(agent.model)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Agent Details */}
        <div className="lg:col-span-2">
          {selectedAgent ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="w-5 h-5" />
                      {selectedAgent.name}
                    </CardTitle>
                    {selectedAgent.description && (
                      <CardDescription className="mt-2">{selectedAgent.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => exportConfig(selectedAgent)}
                      title="导出配置"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setAgentForm({
                          name: selectedAgent.name,
                          description: selectedAgent.description || '',
                          systemPrompt: selectedAgent.systemPrompt,
                          model: selectedAgent.model,
                          temperature: selectedAgent.temperature,
                          maxTokens: selectedAgent.maxTokens,
                          topP: selectedAgent.topP || 1,
                          frequencyPenalty: selectedAgent.frequencyPenalty || 0,
                          presencePenalty: selectedAgent.presencePenalty || 0,
                        })
                        setSelectedKnowledgeBases(selectedAgent.knowledgeBases || [])
                        setIsEditDialogOpen(true)
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsDeleteDialogOpen(true)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="config" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="config">配置</TabsTrigger>
                    <TabsTrigger value="prompt">提示词</TabsTrigger>
                    <TabsTrigger value="test">测试</TabsTrigger>
                  </TabsList>

                  <TabsContent value="config" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-gray-600">模型</Label>
                        <div className="mt-1">{getModelBadge(selectedAgent.model)}</div>
                      </div>
                      <div>
                        <Label className="text-sm text-gray-600">温度</Label>
                        <p className="font-medium">{selectedAgent.temperature}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-gray-600">最大 Tokens</Label>
                        <p className="font-medium">{selectedAgent.maxTokens}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-gray-600">Top P</Label>
                        <p className="font-medium">{selectedAgent.topP || 1}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-gray-600">频率惩罚</Label>
                        <p className="font-medium">{selectedAgent.frequencyPenalty || 0}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-gray-600">存在惩罚</Label>
                        <p className="font-medium">{selectedAgent.presencePenalty || 0}</p>
                      </div>
                    </div>
                    
                    {selectedAgent.knowledgeBases && selectedAgent.knowledgeBases.length > 0 && (
                      <div>
                        <Label className="text-sm text-gray-600 mb-2 block">关联知识库</Label>
                        <div className="space-y-2">
                          {selectedAgent.knowledgeBases.map((kb, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 border rounded">
                              <Database className="w-4 h-4 text-gray-500" />
                              <span className="flex-1">{kb.name || kb.kbId}</span>
                              <Badge variant="secondary">优先级 {kb.priority}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <Label className="text-sm text-gray-600">创建时间</Label>
                      <p className="font-medium">
                        {new Date(selectedAgent.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="prompt" className="space-y-4">
                    <div>
                      <Label className="text-sm text-gray-600 mb-2 block">系统提示词</Label>
                      <div className="relative">
                        <Textarea
                          value={selectedAgent.systemPrompt}
                          readOnly
                          className="min-h-[400px] font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedAgent.systemPrompt)
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {selectedAgent.systemPrompt.length} 字符
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="test" className="space-y-4">
                    <div>
                      <Label htmlFor="test-message">测试消息</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="test-message"
                          placeholder="输入测试消息..."
                          value={testMessage}
                          onChange={(e) => setTestMessage(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !isTestLoading) {
                              testAgent()
                            }
                          }}
                        />
                        <Button
                          onClick={testAgent}
                          disabled={!testMessage || isTestLoading}
                        >
                          {isTestLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {testResponse && (
                      <div>
                        <Label className="text-sm text-gray-600 mb-2 block">AI 响应</Label>
                        <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                          <p className="whitespace-pre-wrap">{testResponse}</p>
                        </div>
                      </div>
                    )}
                    
                    <Alert>
                      <TestTube className="h-4 w-4" />
                      <AlertDescription>
                        测试功能会实际调用 AI 模型，可能产生费用。测试时会使用当前配置和关联的知识库。
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Brain className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-gray-500">选择一个智能体查看详情</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false)
          setIsEditDialogOpen(false)
          resetForm()
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditDialogOpen ? '编辑智能体' : '创建智能体'}
              {selectedTemplate && (
                <Badge className="ml-2" variant="secondary">
                  基于 {selectedTemplate.name} 模板
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              配置智能体的基本信息、系统提示词和参数
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="prompt">提示词</TabsTrigger>
              <TabsTrigger value="params">参数</TabsTrigger>
              <TabsTrigger value="knowledge">知识库</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4">
              <div>
                <Label htmlFor="agent-name">名称 *</Label>
                <Input
                  id="agent-name"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  placeholder="例如：客服助手"
                />
              </div>
              
              <div>
                <Label htmlFor="agent-description">描述</Label>
                <Textarea
                  id="agent-description"
                  value={agentForm.description}
                  onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                  placeholder="描述智能体的用途和特点..."
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="agent-model">模型 *</Label>
                <Select
                  value={agentForm.model}
                  onValueChange={(value) => setAgentForm({ ...agentForm, model: value })}
                >
                  <SelectTrigger id="agent-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map(model => (
                      <SelectItem key={model.value} value={model.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{model.label}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {model.provider}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            
            <TabsContent value="prompt" className="space-y-4">
              <div>
                <Label htmlFor="system-prompt">系统提示词 *</Label>
                <Textarea
                  id="system-prompt"
                  value={agentForm.systemPrompt}
                  onChange={(e) => setAgentForm({ ...agentForm, systemPrompt: e.target.value })}
                  placeholder="定义智能体的角色、行为和回答风格..."
                  className="min-h-[300px] font-mono text-sm"
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">
                    {agentForm.systemPrompt.length} / 4000 字符
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(agentForm.systemPrompt)}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    复制
                  </Button>
                </div>
              </div>
              
              <Alert>
                <Code className="h-4 w-4" />
                <AlertDescription>
                  系统提示词定义了智能体的行为模式。可以使用变量如 {'{knowledge}'} 引用知识库内容。
                </AlertDescription>
              </Alert>
            </TabsContent>
            
            <TabsContent value="params" className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>温度 (Temperature)</Label>
                  <span className="text-sm font-medium">{agentForm.temperature}</span>
                </div>
                <Slider
                  value={[agentForm.temperature]}
                  onValueChange={([value]) => setAgentForm({ ...agentForm, temperature: value })}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  控制回复的随机性，0 = 确定性，2 = 最大创造性
                </p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>最大 Tokens</Label>
                  <span className="text-sm font-medium">{agentForm.maxTokens}</span>
                </div>
                <Slider
                  value={[agentForm.maxTokens]}
                  onValueChange={([value]) => setAgentForm({ ...agentForm, maxTokens: value })}
                  min={100}
                  max={4000}
                  step={100}
                />
                <p className="text-xs text-gray-500 mt-1">
                  控制回复的最大长度
                </p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Top P</Label>
                  <span className="text-sm font-medium">{agentForm.topP}</span>
                </div>
                <Slider
                  value={[agentForm.topP]}
                  onValueChange={([value]) => setAgentForm({ ...agentForm, topP: value })}
                  min={0}
                  max={1}
                  step={0.1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  核采样参数，控制词汇选择的多样性
                </p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>频率惩罚</Label>
                  <span className="text-sm font-medium">{agentForm.frequencyPenalty}</span>
                </div>
                <Slider
                  value={[agentForm.frequencyPenalty]}
                  onValueChange={([value]) => setAgentForm({ ...agentForm, frequencyPenalty: value })}
                  min={-2}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  减少重复词汇的使用
                </p>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>存在惩罚</Label>
                  <span className="text-sm font-medium">{agentForm.presencePenalty}</span>
                </div>
                <Slider
                  value={[agentForm.presencePenalty]}
                  onValueChange={([value]) => setAgentForm({ ...agentForm, presencePenalty: value })}
                  min={-2}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  鼓励谈论新话题
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="knowledge" className="space-y-4">
              <div>
                <Label>关联知识库</Label>
                <p className="text-sm text-gray-600 mb-3">
                  选择智能体可以访问的知识库，并设置优先级
                </p>
                
                {knowledgeBases && knowledgeBases.length > 0 ? (
                  <div className="space-y-2">
                    {knowledgeBases.map((kb: any) => {
                      const isSelected = selectedKnowledgeBases.find(skb => skb.kbId === kb.id)
                      return (
                        <div
                          key={kb.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'border-primary bg-primary/5' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedKnowledgeBases(
                                selectedKnowledgeBases.filter(skb => skb.kbId !== kb.id)
                              )
                            } else {
                              setSelectedKnowledgeBases([
                                ...selectedKnowledgeBases,
                                { kbId: kb.id, priority: selectedKnowledgeBases.length + 1 }
                              ])
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Database className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{kb.name}</span>
                              {kb.description && (
                                <span className="text-sm text-gray-500">- {kb.description}</span>
                              )}
                            </div>
                            {isSelected && (
                              <Badge>优先级 {isSelected.priority}</Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      暂无可用的知识库。请先创建知识库。
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false)
                setIsEditDialogOpen(false)
                resetForm()
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                const data = {
                  ...agentForm,
                  knowledgeBases: selectedKnowledgeBases,
                }
                
                if (isEditDialogOpen && selectedAgent) {
                  updateAgentMutation.mutate({ id: selectedAgent.id, ...data })
                } else {
                  createAgentMutation.mutate(data)
                }
              }}
              disabled={
                !agentForm.name ||
                !agentForm.systemPrompt ||
                createAgentMutation.isPending ||
                updateAgentMutation.isPending
              }
            >
              {createAgentMutation.isPending || updateAgentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {isEditDialogOpen ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Selection Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择模板</DialogTitle>
            <DialogDescription>
              从预设模板快速创建智能体
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            {agentTemplates.map(template => (
              <div
                key={template.id}
                className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => applyTemplate(template)}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    {template.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{template.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    <div className="flex gap-2 mt-2">
                      {getModelBadge(template.model)}
                      <Badge variant="outline">温度 {template.temperature}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>测试智能体</DialogTitle>
            <DialogDescription>
              与智能体进行对话测试，验证配置效果
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="min-h-[300px] max-h-[400px] overflow-y-auto border rounded-lg p-4 space-y-3">
              {/* Chat messages would go here */}
              <Alert>
                <MessageSquare className="h-4 w-4" />
                <AlertDescription>
                  开始输入消息进行测试对话
                </AlertDescription>
              </Alert>
            </div>
            
            <div className="flex gap-2">
              <Input
                placeholder="输入测试消息..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    // Send test message
                  }
                }}
              />
              <Button>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除智能体 "{selectedAgent?.name}" 吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedAgent) {
                  deleteAgentMutation.mutate(selectedAgent.id)
                }
              }}
              disabled={deleteAgentMutation.isPending}
            >
              {deleteAgentMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}