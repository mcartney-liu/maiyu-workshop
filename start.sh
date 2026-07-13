#!/bin/bash

echo "========================================"
echo "  麦语工坊 - AI智能问答平台"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未检测到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "backend/node_modules" ]; then
    echo "安装后端依赖..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "安装前端依赖..."
    cd frontend && npm install && cd ..
fi

# Start backend
echo "启动后端服务 (端口 3001)..."
cd backend && npm start &
BACKEND_PID=$!
cd ..

sleep 2

# Start frontend
echo "启动前端应用 (端口 3000)..."
cd frontend && npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 麦语工坊已启动！"
echo ""
echo "前台地址: http://localhost:3000"
echo "后台地址: http://localhost:3000/admin"
echo "API地址:  http://localhost:3001/api/health"
echo ""
echo "按 Ctrl+C 停止所有服务"

wait $BACKEND_PID $FRONTEND_PID
