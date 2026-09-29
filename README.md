# Reusable Management Platform — V1

简体中文是网页的默认语言，可在页面顶部切换英文。使用说明见 [语言设置](docs/LANGUAGE-GUIDE.md)，生产部署说明见 [中文版](docs/DEPLOYMENT.zh-CN.md) 或 [English](docs/DEPLOYMENT.md)。

Tenant-scoped booking management for customers, staff, and organization administrators. V1 includes identity and permissions, customer/staff/service/resource management, scheduling and booking snapshots, assignments, attendance, leave, manual payment/commission records, reports/CSV, notifications, audit, and policy-driven cancellation/rescheduling.

## Local development

Copy `.env.example` to `.env`, start PostgreSQL with `docker compose up -d`, and run `corepack pnpm install`. Apply migrations with `corepack pnpm --filter @platform/database exec prisma migrate deploy`, seed the development organization, then run the API and web workspaces.

Quality gates are `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build`. Release/UAT, deployment, permission, security, and recovery guidance lives in `docs/`.
