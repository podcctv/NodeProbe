[English](README.md)

## 功能特性

- 支持 ICMP Ping 延迟测试
- 提供 Traceroute，并可选择下载路径报告
- HTTP Speedtest，带进度显示、可视化图表和彩色进度条
- 自动收集并展示客户端网络信息（IP、ASN、ISP 及地理位置）
- 管理员注册、登录与测试管理界面
- 使用 SQLite 持久化存储测试记录
- 按浏览器与 IP 分组的测试统计并按小时聚合
- 一键复制测试结果为包含汇总表格的 Markdown
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

### 管理员登录

首次启动时后台会自动创建一个管理员账户：

- 用户名：`NodeProbe`
- 密码：`nodeprobe` 加上服务器**公网**IP 的最后一段  
  （例如公网 IP `203.0.113.5` 对应密码 `nodeprobe5`）

若服务无法自动获取公网 IP，可通过 `SERVER_IP` 环境变量手动指定。

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

### Windows 一键部署

Windows 用户可使用以下 PowerShell 脚本一键部署，在管理员权限的 PowerShell 中运行即可：

```powershell
# === NodeProbe 一键部署 (Docker Desktop / Windows) ===
$ErrorActionPreference = 'Stop'

# 1) 可自定义变量
$Repo      = "https://github.com/podcctv/NodeProbe"
$Branch    = "main"
$WorkDir   = "$env:USERPROFILE\NodeProbe"
$ZipTmp    = "$env:TEMP\nodeprobe.zip"
$Image     = "nodeprobe:latest"
$Container = "nodeprobe"
$HostPort  = 8000        # 如端口冲突可改这里
$AppPort   = 8000        # 容器内服务端口，若项目不同请改

# 2) 检查 Docker 是否可用
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "未检测到 docker 命令。请先安装并启动 Docker Desktop。"
}
try { docker version | Out-Null } catch { throw "Docker Desktop 未启动或无权限访问 Docker 引擎。" }

# 3) 准备目录
if (Test-Path $WorkDir) {
  Write-Host "=> 目录已存在：$WorkDir"
} else {
  New-Item -ItemType Directory -Path $WorkDir | Out-Null
  Write-Host "=> 已创建目录：$WorkDir"
}

# 4) 获取源码（优先 git，其次 ZIP）
if (Get-Command git -ErrorAction SilentlyContinue) {
  if (Test-Path (Join-Path $WorkDir ".git")) {
    Write-Host "=> 已存在 Git 仓库，执行拉取..."
    git -C $WorkDir fetch --all --prune
    git -C $WorkDir checkout $Branch
    git -C $WorkDir reset --hard origin/$Branch
  } else {
    Write-Host "=> 使用 git clone 获取源码..."
    git clone --depth 1 --branch $Branch $Repo $WorkDir
  }
} else {
  Write-Host "=> 未检测到 git，改用 ZIP 下载..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest "$Repo/archive/refs/heads/$Branch.zip" -OutFile $ZipTmp
  # 清理旧目录再解压
  if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
  Expand-Archive -LiteralPath $ZipTmp -DestinationPath (Split-Path $WorkDir) -Force
  Rename-Item -Path (Join-Path (Split-Path $WorkDir) ("NodeProbe-" + $Branch)) -NewName (Split-Path $WorkDir -Leaf)
}

# 5) 若缺少 Dockerfile，则按通用 Python 项目生成一个
$Dockerfile = Join-Path $WorkDir "Dockerfile"
if (-not (Test-Path $Dockerfile)) {
  Write-Host "=> 未发现 Dockerfile，自动生成通用版本..."
  @"
FROM python:3.11-slim
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# 基础依赖（按需追加系统库）
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY . .
RUN python -m pip install --upgrade pip && \
    if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
EXPOSE ${AppPort}
# 入口：如你的项目入口不同，请修改该行（例如 backend.main:app / app:app 等）
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "${AppPort}"]
"@ | Set-Content -Path $Dockerfile -Encoding UTF8
}

# 6) 构建镜像
Write-Host "=> 开始构建镜像：$Image"
docker build -t $Image $WorkDir

# 7) 若已有同名容器则替换
if ((docker ps -a --format '{{.Names}}') -contains $Container) {
  Write-Host "=> 发现已有容器，先移除：$Container"
  docker rm -f $Container | Out-Null
}

# 8) 运行容器
Write-Host "=> 启动容器：$Container  映射端口 $HostPort -> $AppPort"
docker run -d --name $Container -p $HostPort:$AppPort --restart unless-stopped $Image | Out-Null

# 9) 简要健康检查与访问
Start-Sleep -Seconds 2
Write-Host "=> 近期日志（截断显示，Ctrl+C 结束跟随）："
docker logs --tail 50 $Container
Write-Host "=> 打开浏览器访问：http://localhost:$HostPort"
try { Start-Process "http://localhost:$HostPort" } catch {}
Write-Host "=== 部署完成 ==="
```

## 更新日志

查看 [CHANGELOG.zh.md](CHANGELOG.zh.md) 或 [英文版](CHANGELOG.md) 了解最新功能与修复。

