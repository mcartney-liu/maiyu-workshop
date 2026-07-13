# 麦语工坊 (Maiyu Workshop)

AI 对话平台。后端 Node.js/Express 端口 3001，前端 React + Vite。

---

## 快速启动

双击项目根目录下的 `start.bat`，自动构建前端并启动服务。

---

## 环境要求
- Node.js 18+

---

## 生产模式（推荐：`start.bat` 一键启动）

双击项目根目录下的 `start.bat`，自动构建前端并启动服务。

或者手动执行：

```bash
# 1. 安装依赖（仅首次）
cd backend && npm install
cd ../frontend && npm install

# 2. 构建前端
cd frontend && npm run build

# 3. 启动后端
cd ../backend && node src/app.js
```

访问 `http://localhost:3001`，登录 `admin` / `admin123`。

---

## 开发模式（前后端分离）

**终端1 — 后端启动命令：**
```bash
cd C:\Users\haizhi\WorkBuddy\2026-06-12-11-13-04\maiyu-workshop\backend
node src/app.js
```
后端运行在 `http://localhost:3001`

**终端2 — 前端启动命令：**
```bash
cd C:\Users\haizhi\WorkBuddy\2026-06-12-11-13-04\maiyu-workshop\frontend
node node_modules/vite/bin/vite.js
```
前端运行在 `http://localhost:3000`（API 自动代理到 3001）

---

## 登录账号

| 字段 | 值 |
|------|-----|
| 用户名 | `admin` |
| 密码 | `admin123` |

---

## 部署到 Vercel（全栈：前端静态 + 后端 Serverless）

仓库已包含 `vercel.json` 与 `api/` 云函数入口，可直接从 GitHub 导入。

**导入时注意（否则 Deploy 按钮会灰色不可用）：**

1. 在 Vercel 导入页把 **Root Directory 改为 `.`**（英文句点 = 仓库根目录）。
   Vercel 默认会把 `frontend/` 误识别成独立前端项目，必须手动改回根目录，否则后端云函数和 `vercel.json` 都不会生效。
2. 展开 **Build and Output Settings**，按下面填：
   | 设置项 | 值 |
   |--------|-----|
   | Framework Preset | `Other` |
   | Build Command | `cd frontend && npm install && npm run build` |
   | Output Directory | `frontend/dist` |
3. 点 **Deploy**，约 1–2 分钟构建完成后会分配 `*.vercel.app` 域名。

**说明：**
- 登录账号 `admin` / `admin123`、已发布的智能体在部署后开箱可见（数据从仓库种子初始化到 `/tmp`）。
- Vercel 文件系统只读，对话记录/上传文件存于 `/tmp`，实例冷启动后会重置（演示够用，非持久）。
- 真实对话需配置大模型 API Key：部署后到「后台 → 模型」填入；若需冷启动不丢失，建议改为环境变量。

---

## 项目结构

```
maiyu-workshop/
├── start.bat          # 一键启动脚本
├── backend/
│   ├── src/
│   │   ├── app.js         # 入口
│   │   ├── routes/        # API 路由
│   │   └── utils/         # 工具函数
│   └── data/              # JSON 数据存储
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/     # 管理后台页面
│   │   │   └── frontend/  # 用户前台页面
│   │   ├── api/           # API 请求封装
│   │   └── contexts/      # React Context
│   └── dist/              # 构建产物
└── README.md
```
