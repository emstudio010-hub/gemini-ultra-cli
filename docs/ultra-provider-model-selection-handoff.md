# Gemini Ultra CLI 模型选择便利交接

2026-11-15；WI-258 / E-570至571 / F-216；基线0367071，分支codex/ultra-agent-portable。goal active，源码优先、先Windows定向验证，暂不打包。

## Evidence → Finding → Path

/provider use <名称或ID> [模型] 现在支持在切换供应商时直接选择该供应商已保存的模型。未指定模型时保留原有默认模型回退；指定但未保存时返回中英文错误和可用模型列表，不改变当前活动路由。旧的仅供应商参数行为保持，实时会话模型同步继续生效。

## E-570至571 定向验证

- node node_modules/typescript/bin/tsc --build packages/cli/tsconfig.json：退出 0。
- providerCommand.test.ts 选择性 Vitest：1 个文件，3 passed，9 skipped，退出 0；新增直接模型选择用例通过。
- node node_modules/eslint/bin/eslint.js packages/cli/src/ui/commands/providerCommand.ts packages/cli/src/ui/commands/providerCommand.test.ts --max-warnings 0：退出 0。
- Prettier --check 与 git diff --check：退出 0。
- 未调用真实供应商、未改个人 provider/locale/数据库/PATH，未跑全量或冒烟。

## 保全与接续

四份旧真实失败及 SHA/ passed=false 保持；ULQ 凭据、全局 preview.83、未跟踪历史文件保持。下一阶段继续认证/设置加载与演练台任务状态收敛，随后再处理可移植逆向链路；goal 保持 active。最终三平台打包仍后置。
