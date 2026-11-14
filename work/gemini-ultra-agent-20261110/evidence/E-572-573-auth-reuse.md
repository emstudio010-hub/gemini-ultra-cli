# Gemini Ultra CLI 认证复用交接

2026-11-15；WI-259 / E-572至573 / F-217；基线0609071，分支codex/ultra-agent-portable。goal active，源码优先、Windows定向验证，暂不打包。

## Evidence → Finding → Path

完整 Config 在启动前已通过 partial Config 完成认证并转移启动元数据；initializeApp 随后仍无条件调用 refreshAuth，造成首屏重复握手和额外等待。现在 performInitialAuth 先检查 isAuthReady() 以及同类型 getContentGeneratorConfig().authType，条件成立时复用现有认证结果；未就绪、类型变化和旧 mock 仍走原刷新流程，认证错误处理保持不变。

## E-572至573 定向验证

- auth.test.ts + initializer.test.ts：4 个文件、23 passed、退出 0；新增 ready Config 复用用例通过。
- node node_modules/typescript/bin/tsc --build packages/cli/tsconfig.json：退出 0。
- 定向 ESLint（auth.ts/auth.test.ts/initializer.test.ts）：退出 0。
- Prettier --check 与 git diff --check：退出 0。
- 未调用真实供应商或 OAuth，未改个人 provider/locale/数据库/PATH，未跑全量/冒烟。

## 保全与接续

旧真实失败记录、SHA/ passed=false、ULQ 凭据、preview.83、未跟踪历史文件保持。下一阶段继续认证/设置其余冷加载等待与演练台状态收敛；goal 保持 active，三平台打包后置。
