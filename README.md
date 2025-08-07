# NodeProbe

Lightweight self-hosted probe service for testing global connectivity to a target VPS — with real-time network diagnostics and public result visualization.

## Development

- **Backend**: FastAPI with SQLite located in `backend/`
- **Frontend**: React + Vite + Tailwind CSS located in `frontend/`

### Quick start

```bash
./deploy.sh
```

The script installs dependencies and launches the FastAPI server together with the Vite development server.

## Docker 化部署

本项目已支持一键部署，整合所有必要服务：

- HTTP 服务：用于展示和访问探针结果
- 数据库服务：持久化存储所有测试记录
- 定时任务服务：可扩展的每日任务

### 📦 快速启动

```bash
git clone https://github.com/podcctv/NodeProbe.git
cd NodeProbe
docker compose up -d
```

默认数据会存储在 `/opt/nodeprobe/data/` 下。

访问示例：

```
http://your-server-ip:8000/tests
```

### 🚀 使用部署脚本

仓库提供 `deploy.sh` 脚本实现一键部署或更新。脚本会自动切换到自身所在目录，可在任意位置通过绝对路径执行：

```bash
git clone https://github.com/podcctv/NodeProbe.git
chmod +x ./NodeProbe/deploy.sh
./NodeProbe/deploy.sh
```

脚本会自动设置持久化目录、拉取最新代码并通过 Docker Compose 重建并启动服务。

### 🐳 使用预构建镜像一键部署

如果只需要运行服务，可直接使用预构建的镜像：

```bash
docker pull ghcr.io/podcctv/nodeprobe:latest
docker run -d --name nodeprobe -p 8000:8000 \
  -v /opt/nodeprobe/data:/app/data \
  ghcr.io/podcctv/nodeprobe:latest
```

默认数据同样会保存到 `/opt/nodeprobe/data/`。
