# 部署到 Render（快速指南）

此项目已包含 `Dockerfile` 与 `render.yaml`，可直接连接 GitHub 仓库到 Render 自动部署。

步骤：

1. 将代码提交并推送到 GitHub（推荐分支 `main`）：

```bash
git add .
git commit -m "Add render deployment config"
git push origin main
```

2. 登录 https://render.com，选择 **New → Web Service**，授权并选择你的 GitHub 仓库。
3. 选择分支 `main`，Environment 选 `Docker`，Render 会使用仓库内 `render.yaml` 中的配置。确认 `Dockerfile` 路径为 `Dockerfile`。
4. 可在 Render 的 Environment 中设置环境变量（可选）:

- `PORT`：默认 3000（Render 会自动注入）。
- `NODE_ENV`：`production`

注意事项：

- 当前使用 SQLite (`data.db`) 存储记录。容器内的 SQLite 文件在重建时可能丢失。建议生产化使用外部数据库（Postgres/MySQL）或在 Render 上启用 Persistent Disk（付费或按需）。
- 推荐在 Render 的 Health Check 中设置端口 `3000`。

手动触发初次汇率更新（部署后在 Render 控制台的 Logs / Shell 执行）：

```bash
curl -X POST https://<your-service>.onrender.com/api/update_rates -H "Content-Type: application/json" -d '{}'
```

如果你愿意，我可以帮你生成一个 GitHub Actions 工作流来自动构建并在每次推送时触发部署（需要在仓库启用 Actions）。
