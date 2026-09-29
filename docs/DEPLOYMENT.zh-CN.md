# V1 部署与恢复

## 基础设施

使用 Node.js 22 或项目提供的容器、PostgreSQL 17，以及 HTTPS 反向代理或托管层。API 和网页应使用固定的 HTTPS 地址。生产环境 Compose 文件适用于单实例部署，不提供高可用架构。

## 配置

将 `.env.example` 复制为由运维人员管理的 `.env.production`，替换所有开发环境值和密钥。生产环境必须配置 `DATABASE_URL`、`NODE_ENV=production`、`API_PORT`、`BETTER_AUTH_SECRET`、HTTPS 的 `BETTER_AUTH_URL` 和 `WEB_URL`、默认机构 slug、所有请求速率限制、邀请有效期及发布版本。网页镜像需要设置 `PUBLIC_API_URL`。保持 `DEMO_SEED_ENABLED=false`，不要将 `.env.production` 提交到版本库。

## 首次部署

1. 部署 PostgreSQL，核对网络和 TLS 规则。
2. 创建部署前的自定义格式备份，并确认备份可读取。
3. 使用 `docker compose -f docker-compose.production.yml build` 构建不可变镜像。
4. 启动新版写入服务前，使用对应版本镜像运行 `prisma migrate deploy`。生产环境不得使用 `migrate reset`。
5. 启动 API 和网页，检查 `/health/live`、`/health/ready`、安全版本信息、HTTPS、响应头、CORS、登录及日志。
6. 全新安装时，使用 `BOOTSTRAP_CONFIRMED=yes`、机构／电子邮件／姓名变量，以及强密码 `BOOTSTRAP_ADMIN_PASSWORD` 运行受保护的初始管理员命令。该命令通过 Better Auth 创建账号并分配预设 Admin 角色，不会输出密码。
7. 生产环境管理员在应用内创建员工资料及一次性员工邀请链接。普通员工启用账号无需命令行权限。

## 备份与恢复演练

创建自定义格式备份：

```powershell
pg_dump --format=custom --no-owner --no-acl --file platform.dump $env:DATABASE_URL
pg_restore --list platform.dump
```

仅恢复到另行命名的数据库，再将 `DATABASE_URL` 指向该数据库，运行 `prisma migrate status`、记录数量检查、`/health/ready` 和发布冒烟测试。演练期间不要覆盖正在使用的数据库。

## 升级与回滚

先备份并记录应用和数据库版本，再运行迁移、部署对应版本应用并执行冒烟测试。优先使用向前修正迁移。如需回滚不兼容的数据库结构，应停止写入服务，并同时恢复经验证的部署前备份和兼容的应用镜像。保留 `_prisma_migrations`。

## 运维

使用 JSON 请求日志和 `X-Request-ID` 关联事件。轮询 `/health/live` 检查进程、`/health/ready` 检查数据库。在托管层配置外部可用性与日志监控；完整指标系统留待后续版本。应用的中英文使用方式见 [语言设置](LANGUAGE-GUIDE.md)。
