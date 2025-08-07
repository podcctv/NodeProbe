```
VPSTOWN · NODEPROBE
```

轻量级自托管探针服务，用于测试目标 VPS 的全球连通性，提供实时网络诊断和公共结果可视化。

[English](README.md)

## 功能特性

- 支持 ICMP Ping 延迟测试
- 提供 Traceroute，并可选择下载路径报告
- HTTP Speedtest，带进度显示与结果记录
- 自动收集并展示客户端网络信息（IP、ASN、ISP 及地理位置）
- 管理员注册、登录与测试管理界面
- 使用 SQLite 持久化存储测试记录
- 通过 Docker Compose 或预构建镜像一键部署

## 开发环境

- **后端**：位于 `backend/` 的 FastAPI + SQLite
- **前端**：位于 `frontend/` 的 React + Vite + Tailwind CSS

### 快速开始

```bash
./deploy.sh
```

脚本会安装依赖并同时启动 FastAPI 服务和 Vite 开发服务器。

## Docker 化部署

项目提供整合所有必要服务的一键 Docker 部署：

- HTTP 服务：用于展示和访问探针结果
- 数据库服务：持久化存储所有测试记录
- 定时任务服务：每日任务扩展

### docker compose 示例

```bash
git clone https://github.com/podcctv/NodeProbe.git
cd NodeProbe
docker compose up -d
```

默认数据存储于 `/opt/NodeProbe/data/`。
可通过设置 `DATA_DIR` 环境变量自定义该目录，运行 Docker Compose 或
`deploy.sh` 时会自动使用此路径。

访问示例：

```
http://your-server-ip:8380
```

### 使用部署脚本

仓库自带 `deploy.sh`，可一键部署或更新。脚本会自动切换到自身目录，可在任意位置通过绝对路径执行：

```bash
git clone https://github.com/podcctv/NodeProbe.git
chmod +x ./NodeProbe/deploy.sh
./NodeProbe/deploy.sh
```

脚本会设置持久化目录、拉取最新代码并通过 Docker Compose 重建并启动服务。

### 使用预构建镜像

如果只需运行服务，可直接使用预构建镜像：

```bash
docker pull ghcr.io/podcctv/nodeprobe:latest
docker run -d --name nodeprobe -p 8380:8380 \
  -v /opt/NodeProbe/data:/app/data \
  ghcr.io/podcctv/nodeprobe:latest
```

默认数据会保存到 `/opt/NodeProbe/data/`。
同样可通过 `DATA_DIR` 环境变量进行更改。

## 更新日志

查看 [CHANGELOG.zh.md](CHANGELOG.zh.md) 了解最新功能与修复。

