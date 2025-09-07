import { Hono } from "hono";
import { createAuth } from "../lib/auth";
import type { Env } from "../index";

const authDemo = new Hono<{ Bindings: Env }>();

// 认证演示页面
authDemo.get("/demo", async (c) => {
  const auth = createAuth(c.env, c.req.raw.cf as any);
  
  // 获取当前会话
  const sessionResult = await auth.api.getSession({
    headers: c.req.raw.headers,
  });
  
  const isLoggedIn = sessionResult && 'user' in sessionResult;
  const userData = isLoggedIn ? sessionResult : null;

  const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WA-Agent 认证演示</title>
        <style>
            body { font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
            .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0; }
            button { background: #0066cc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 5px; }
            button:hover { background: #0052a3; }
            .user-info { background: #f0f9ff; }
            .error { background: #fef2f2; color: #dc2626; }
            .success { background: #f0fdf4; color: #16a34a; }
        </style>
    </head>
    <body>
        <h1>🚀 WA-Agent 认证系统演示</h1>
        
        <div class="card">
            <h2>当前认证状态</h2>
            ${userData 
              ? `<div class="user-info">
                   <h3>✅ 已登录</h3>
                   <p><strong>用户ID:</strong> ${userData.user.id}</p>
                   <p><strong>姓名:</strong> ${userData.user.name || '未设置'}</p>
                   <p><strong>邮箱:</strong> ${userData.user.email}</p>
                   <p><strong>邮箱验证:</strong> ${userData.user.emailVerified ? '✅ 已验证' : '❌ 未验证'}</p>
                   <p><strong>头像:</strong> ${userData.user.image ? `<img src="${userData.user.image}" alt="头像" style="width:40px;height:40px;border-radius:50%;">` : '无'}</p>
                   <p><strong>创建时间:</strong> ${new Date(userData.user.createdAt).toLocaleString('zh-CN')}</p>
                 </div>`
              : `<div class="error">
                   <h3>❌ 未登录</h3>
                   <p>请使用下面的按钮登录</p>
                 </div>`
            }
        </div>
        
        <div class="card">
            <h2>认证操作</h2>
            ${!userData 
              ? `<button onclick="signInWithGoogle()">🔐 Google 登录</button>
                 <button onclick="signInWithEmail()">📧 邮箱登录</button>`
              : `<button onclick="signOut()">🚪 退出登录</button>`
            }
        </div>
        
        <div class="card">
            <h2>认证端点测试</h2>
            <p><a href="/api/auth/session" target="_blank">GET /api/auth/session</a> - 获取当前会话</p>
            <p><a href="/api/auth/sign-in/google" target="_blank">GET /api/auth/sign-in/google</a> - Google 登录</p>
            <p><strong>注意:</strong> Google 登录需要先在 .dev.vars 中配置正确的 OAuth 凭据</p>
        </div>

        <script>
            function signInWithGoogle() {
                window.location.href = '/api/auth/sign-in/google';
            }
            
            function signInWithEmail() {
                const email = prompt('请输入邮箱地址:');
                const password = prompt('请输入密码:');
                if (email && password) {
                    fetch('/api/auth/sign-in/email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    }).then(() => {
                        window.location.reload();
                    }).catch(err => {
                        alert('登录失败: ' + err.message);
                    });
                }
            }
            
            function signOut() {
                fetch('/api/auth/sign-out', {
                    method: 'POST'
                }).then(() => {
                    window.location.reload();
                });
            }
        </script>
    </body>
    </html>
  `;

  return c.html(html);
});

export { authDemo };