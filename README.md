# 亏死了么（原型）

极简原型：两个按钮记录「赚了 / 亏了」，提交后在地区排行榜展示汇总数据。

英文名候选：

- LostMuch?
- LossCheck
- AreYouDown
- DidYouLose
- Lossometer

功能更新说明：

- 支持移动端响应式界面。
- 前端可选择币种（USD/USDT/CNY/BTC/ETH/EUR），提交时服务器会把金额归一为 USD。
- IP 自动识别地区（若用户未手动选择），并返回删除令牌用于后续删除。

隐私：不收集 PII。每次记录返回 `deletion_token`，可调用 `POST /api/delete` 删除对应记录（参数 `id`/`token`）。

快速运行：

```bash
cd kuisileme-proto
npm install
npm start
```

后端：Node + Express + SQLite。前端：纯静态页面（HTML/CSS/JS）。

下一步（请选择一项或都做）:
A) 我现在准备好执行 D：生成部署脚本（Dockerfile + systemd 或简单 dokku/heroku 指南），并帮你把服务部署到小型云（我会创建部署脚本与步骤）。
B) 我帮你改进汇率回退：增加本地缓存（SQLite 表）并周期拉取汇率实现离线兜底。  
C) 其他（请说明）。

部署（快速指南）：

- 使用 Docker 构建镜像：

```bash
cd kuisileme-proto
docker build -t kuisileme-proto:latest .
docker run -p 3000:3000 kuisileme-proto:latest
```

- 部署建议：小型云如 Render / Fly.io / Railway / DigitalOcean App Platform 均可快速运行容器。若希望我帮你推到某个平台，请告知目标平台与凭证（或我给出步骤你自己执行）。

汇率缓存：已实现本地 SQLite 缓存与 6 小时周期刷新；也提供 `POST /api/update_rates` 手动触发刷新。

CI & 自动部署说明：

- 本仓库包含一个 GitHub Actions 工作流：`.github/workflows/deploy.yml`。工作流在 `main` 分支有提交时执行，功能：
	1. 构建 Docker 镜像并推送到 GitHub Container Registry（`ghcr.io/<OWNER>/kuisileme-proto`），标签包含 `latest` 与提交 SHA。
	2. 若你在仓库 Secrets 中配置了 `RENDER_API_KEY` 与 `RENDER_SERVICE_ID`，工作流会调用 Render API 触发一次手动部署。

设置建议：

1. 在 GitHub 仓库的 Settings → Secrets 中添加：
	- `RENDER_API_KEY`（可选）
	- `RENDER_SERVICE_ID`（可选）

2. 若只需构建镜像并推到 GHCR，不需 Render，确保仓库允许 `GITHUB_TOKEN` 推送 package（默认允许）。

现在你可以把代码推到 `main`，工作流就会自动执行：

```bash
git add .
git commit -m "Add CI workflow for build & deploy"
git push origin main
```

