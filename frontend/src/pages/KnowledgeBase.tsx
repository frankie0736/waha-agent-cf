import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Progress } from '../components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
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
  Upload,
  Link,
  FileText,
  Search,
  Trash2,
  Edit,
  Database,
  AlertCircle,
  CheckCircle,
  Clock,
  Globe,
  Loader2,
  File,
  X,
  FolderOpen,
  TestTube,
  Eye,
  RefreshCw,
  Download,
  Sitemap
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface KnowledgeBase {
  id: string
  userId: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  documentCount?: number
  totalSize?: number
  status?: 'active' | 'processing' | 'error'
}

interface Document {
  id: string
  kbId: string
  filename: string
  filetype: string
  filesize: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  chunks?: number
  createdAt: number
  error?: string
}

export function KnowledgeBasePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([])

  // Form states
  const [kbForm, setKbForm] = useState({ name: '', description: '' })
  const [urlForm, setUrlForm] = useState({ url: '', type: 'single' as 'single' | 'sitemap' })

  // Fetch knowledge bases
  const { data: knowledgeBases, isLoading: kbLoading } = useQuery({
    queryKey: ['knowledge-bases'],
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

  // Fetch documents for selected KB
  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', selectedKb?.id],
    queryFn: async () => {
      if (!selectedKb) return []
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/documents/list/${selectedKb.id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
        }
      )
      if (!response.ok) throw new Error('Failed to fetch documents')
      return response.json()
    },
    enabled: !!selectedKb,
  })

  // Create knowledge base mutation
  const createKbMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/knowledge-base`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error('Failed to create knowledge base')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
      setIsCreateDialogOpen(false)
      setKbForm({ name: '', description: '' })
    },
  })

  // Update knowledge base mutation
  const updateKbMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name: string; description?: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/knowledge-base/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify(data),
        }
      )
      if (!response.ok) throw new Error('Failed to update knowledge base')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
      setIsEditDialogOpen(false)
    },
  })

  // Delete knowledge base mutation
  const deleteKbMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/knowledge-base/${id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
        }
      )
      if (!response.ok) throw new Error('Failed to delete knowledge base')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
      setSelectedKb(null)
      setIsDeleteDialogOpen(false)
    },
  })

  // Upload documents
  const handleFileUpload = async (files: FileList) => {
    if (!selectedKb) return

    const filesArray = Array.from(files)
    setUploadingFiles(filesArray)
    setUploadProgress(0)

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i]
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kb_id', selectedKb.id)

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/documents/upload`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            },
            body: formData,
          }
        )

        if (!response.ok) throw new Error(`Failed to upload ${file.name}`)
        
        const doc = await response.json()
        
        // Process the document
        await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/documents/process/${doc.id}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            },
          }
        )

        setUploadProgress(((i + 1) / filesArray.length) * 100)
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error)
      }
    }

    queryClient.invalidateQueries({ queryKey: ['documents', selectedKb.id] })
    setUploadingFiles([])
    setIsUploadDialogOpen(false)
  }

  // Crawl URL
  const crawlUrlMutation = useMutation({
    mutationFn: async (data: { url: string; type: 'single' | 'sitemap'; kb_id: string }) => {
      const endpoint = data.type === 'sitemap' 
        ? '/api/web-scraper/sitemap'
        : '/api/web-scraper/crawl'
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({
            [data.type === 'sitemap' ? 'sitemapUrl' : 'url']: data.url,
            kb_id: data.kb_id,
          }),
        }
      )
      if (!response.ok) throw new Error('Failed to crawl URL')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', selectedKb?.id] })
      setIsUrlDialogOpen(false)
      setUrlForm({ url: '', type: 'single' })
    },
  })

  // Search knowledge base
  const searchKbMutation = useMutation({
    mutationFn: async ({ kb_id, query }: { kb_id: string; query: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/knowledge-base/${kb_id}/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({ query, limit: 5 }),
        }
      )
      if (!response.ok) throw new Error('Failed to search knowledge base')
      return response.json()
    },
    onSuccess: (data) => {
      setSearchResults(data.results || [])
    },
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />完成</Badge>
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />处理中</Badge>
      case 'failed':
      case 'error':
        return <Badge className="bg-red-100 text-red-800"><AlertCircle className="w-3 h-3 mr-1" />失败</Badge>
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />待处理</Badge>
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">知识库管理</h1>
          <p className="text-gray-600 mt-2">管理您的知识库和文档</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} disabled={!user?.verified}>
          <Plus className="w-4 h-4 mr-2" />
          创建知识库
        </Button>
      </div>

      {!user?.verified && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            您的账户正在等待审核。审核通过后才能创建和管理知识库。
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Knowledge Base List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                我的知识库
              </CardTitle>
              <CardDescription>
                配额: {knowledgeBases?.length || 0} / {user?.kbLimit || 0}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {kbLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : knowledgeBases?.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>暂无知识库</p>
                  <p className="text-sm mt-2">点击上方按钮创建第一个知识库</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {knowledgeBases?.map((kb: KnowledgeBase) => (
                    <div
                      key={kb.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedKb?.id === kb.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => setSelectedKb(kb)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold">{kb.name}</h4>
                          {kb.description && (
                            <p className="text-sm text-gray-600 mt-1">{kb.description}</p>
                          )}
                          <div className="flex gap-4 text-xs text-gray-500 mt-2">
                            <span>{kb.documentCount || 0} 文档</span>
                            <span>{formatFileSize(kb.totalSize || 0)}</span>
                          </div>
                        </div>
                        {kb.status && getStatusBadge(kb.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Knowledge Base Details */}
        <div className="lg:col-span-2">
          {selectedKb ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{selectedKb.name}</CardTitle>
                    {selectedKb.description && (
                      <CardDescription className="mt-2">{selectedKb.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setKbForm({
                          name: selectedKb.name,
                          description: selectedKb.description || '',
                        })
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
                <Tabs defaultValue="documents" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="documents">文档管理</TabsTrigger>
                    <TabsTrigger value="search">搜索测试</TabsTrigger>
                    <TabsTrigger value="settings">设置</TabsTrigger>
                  </TabsList>

                  <TabsContent value="documents" className="space-y-4">
                    <div className="flex gap-2">
                      <Button onClick={() => setIsUploadDialogOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        上传文档
                      </Button>
                      <Button variant="outline" onClick={() => setIsUrlDialogOpen(true)}>
                        <Globe className="w-4 h-4 mr-2" />
                        抓取网页
                      </Button>
                    </div>

                    {docsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : documents?.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>暂无文档</p>
                        <p className="text-sm mt-2">上传文档或抓取网页内容</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {documents?.map((doc: Document) => (
                          <div key={doc.id} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <File className="w-5 h-5 text-gray-500" />
                                <div>
                                  <p className="font-medium">{doc.filename}</p>
                                  <p className="text-sm text-gray-500">
                                    {doc.filetype} • {formatFileSize(doc.filesize)}
                                    {doc.chunks && ` • ${doc.chunks} 切片`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(doc.status)}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    if (confirm('确定要删除这个文档吗？')) {
                                      await fetch(
                                        `${import.meta.env.VITE_API_URL || 'http://localhost:8787'}/api/documents/${doc.id}`,
                                        {
                                          method: 'DELETE',
                                          headers: {
                                            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                                          },
                                        }
                                      )
                                      queryClient.invalidateQueries({ queryKey: ['documents', selectedKb.id] })
                                    }
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            {doc.error && (
                              <Alert className="mt-2" variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{doc.error}</AlertDescription>
                              </Alert>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="search" className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          placeholder="输入搜索内容..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && searchQuery) {
                              searchKbMutation.mutate({
                                kb_id: selectedKb.id,
                                query: searchQuery,
                              })
                            }
                          }}
                        />
                        <Button
                          onClick={() => {
                            if (searchQuery) {
                              searchKbMutation.mutate({
                                kb_id: selectedKb.id,
                                query: searchQuery,
                              })
                            }
                          }}
                          disabled={!searchQuery || searchKbMutation.isPending}
                        >
                          {searchKbMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </Button>
                      </div>

                      {searchResults.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium">搜索结果</h4>
                          {searchResults.map((result, index) => (
                            <Card key={index}>
                              <CardContent className="pt-4">
                                <p className="text-sm">{result.text}</p>
                                <div className="flex gap-4 text-xs text-gray-500 mt-2">
                                  <span>相似度: {(result.score * 100).toFixed(1)}%</span>
                                  <span>文档: {result.metadata?.filename}</span>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="settings" className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <Label>知识库 ID</Label>
                        <Input value={selectedKb.id} readOnly className="mt-1" />
                      </div>
                      <div>
                        <Label>创建时间</Label>
                        <Input
                          value={new Date(selectedKb.createdAt).toLocaleString('zh-CN')}
                          readOnly
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>更新时间</Label>
                        <Input
                          value={new Date(selectedKb.updatedAt).toLocaleString('zh-CN')}
                          readOnly
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Database className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-gray-500">选择一个知识库查看详情</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建知识库</DialogTitle>
            <DialogDescription>创建一个新的知识库来存储和管理文档</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="kb-name">名称</Label>
              <Input
                id="kb-name"
                value={kbForm.name}
                onChange={(e) => setKbForm({ ...kbForm, name: e.target.value })}
                placeholder="输入知识库名称"
              />
            </div>
            <div>
              <Label htmlFor="kb-description">描述（可选）</Label>
              <Textarea
                id="kb-description"
                value={kbForm.description}
                onChange={(e) => setKbForm({ ...kbForm, description: e.target.value })}
                placeholder="输入知识库描述"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => createKbMutation.mutate(kbForm)}
              disabled={!kbForm.name || createKbMutation.isPending}
            >
              {createKbMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑知识库</DialogTitle>
            <DialogDescription>修改知识库的名称和描述</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-kb-name">名称</Label>
              <Input
                id="edit-kb-name"
                value={kbForm.name}
                onChange={(e) => setKbForm({ ...kbForm, name: e.target.value })}
                placeholder="输入知识库名称"
              />
            </div>
            <div>
              <Label htmlFor="edit-kb-description">描述（可选）</Label>
              <Textarea
                id="edit-kb-description"
                value={kbForm.description}
                onChange={(e) => setKbForm({ ...kbForm, description: e.target.value })}
                placeholder="输入知识库描述"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (selectedKb) {
                  updateKbMutation.mutate({ id: selectedKb.id, ...kbForm })
                }
              }}
              disabled={!kbForm.name || updateKbMutation.isPending}
            >
              {updateKbMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传文档</DialogTitle>
            <DialogDescription>
              支持的格式: TXT, MD, PDF, Word, Excel, PPT (最大 50MB)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 mb-2">拖拽文件到这里，或点击选择文件</p>
              <Input
                type="file"
                multiple
                accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFileUpload(e.target.files)
                  }
                }}
                className="hidden"
                id="file-upload"
              />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <Button as="span" variant="outline">
                  选择文件
                </Button>
              </Label>
            </div>
            {uploadingFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">上传中...</h4>
                <Progress value={uploadProgress} />
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {uploadingFiles.map((file, index) => (
                    <div key={index} className="text-sm text-gray-600">
                      {file.name} ({formatFileSize(file.size)})
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* URL Crawl Dialog */}
      <Dialog open={isUrlDialogOpen} onOpenChange={setIsUrlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>抓取网页内容</DialogTitle>
            <DialogDescription>从指定的 URL 或 Sitemap 抓取内容</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={urlForm.type} onValueChange={(v) => setUrlForm({ ...urlForm, type: v as 'single' | 'sitemap' })}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">
                  <Link className="w-4 h-4 mr-2" />
                  单个页面
                </TabsTrigger>
                <TabsTrigger value="sitemap">
                  <Sitemap className="w-4 h-4 mr-2" />
                  Sitemap
                </TabsTrigger>
              </TabsList>
              <TabsContent value="single">
                <div className="space-y-2">
                  <Label htmlFor="single-url">页面 URL</Label>
                  <Input
                    id="single-url"
                    type="url"
                    value={urlForm.url}
                    onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                    placeholder="https://example.com/page"
                  />
                  <p className="text-sm text-gray-600">
                    输入要抓取的单个网页 URL
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="sitemap">
                <div className="space-y-2">
                  <Label htmlFor="sitemap-url">Sitemap URL</Label>
                  <Input
                    id="sitemap-url"
                    type="url"
                    value={urlForm.url}
                    onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                    placeholder="https://example.com/sitemap.xml"
                  />
                  <p className="text-sm text-gray-600">
                    输入 sitemap.xml 的 URL，将批量抓取所有页面
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUrlDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (selectedKb && urlForm.url) {
                  crawlUrlMutation.mutate({
                    url: urlForm.url,
                    type: urlForm.type,
                    kb_id: selectedKb.id,
                  })
                }
              }}
              disabled={!urlForm.url || crawlUrlMutation.isPending}
            >
              {crawlUrlMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              开始抓取
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除知识库 "{selectedKb?.name}" 吗？此操作将同时删除所有相关文档和数据，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedKb) {
                  deleteKbMutation.mutate(selectedKb.id)
                }
              }}
              disabled={deleteKbMutation.isPending}
            >
              {deleteKbMutation.isPending ? (
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