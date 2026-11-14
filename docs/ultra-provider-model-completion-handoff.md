# Gemini Ultra CLI 模型补全交接

2026-11-15；WI-260 / E-574至575 / F-218；基线352b1a1，分支codex/ultra-agent-portable。goal active，源码优先、Windows定向验证，暂不打包。

## Evidence → Finding → Path

/provider use 原先只补全供应商 ID，新增的可选模型参数需要手打，降低模型切换便利性。现在单 token 继续补全供应商；输入供应商后空格或模型前缀时，补全该供应商已保存模型并返回可直接插入的 provider-id + model 组合；多余参数返回空列表，不触发配置写入或模型请求。

## E-574至575 定向验证

- providerCommand.test.ts：1 个文件、13 passed、退出 0；新增模型补全用例通过。
- node node_modules/typescript/bin/tsc --build packages/cli/tsconfig.json：退出 0。
- 定向 ESLint（providerCommand.ts/providerCommand.test.ts）：退出 0。
- Prettier --check 与 git diff --check：退出 0。
- 未调用真实供应商、未改个人 provider/locale/数据库/PATH，未跑全量/冒烟。

## 保全与接续

旧真实失败、SHA/ passed=false、ULQ 凭据、preview.83、未跟踪历史文件保持。下一继续演练台任务提交/状态与原生红队可移植链路；goal 保持 active，最终三平台打包后置。
