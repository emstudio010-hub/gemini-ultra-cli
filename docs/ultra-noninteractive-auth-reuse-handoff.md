# Gemini Ultra CLI 非交互启动重复认证交接

2026-11-16；WI-264 / E-581 / F-223。仓库：C:\Users\Administrator\work\gemini-ultra-cli；分支 codex/ultra-agent-portable。已接续原聊天 01a1c215-8a5c-78a1-bf98-fc401612bcdc，先读 Obsidian 最新交接；R26 code-audit，lead/cae/doc 均在当前聊天执行。沿用 work/gemini-ultra-agent-20261110/scope.md 的本地源码授权，未启动子代理。

## 本阶段结果

先收尾上轮未提交的 WI-263 密钥库隔离改动，提交 1e0554f。E-579/580 的既有定向和编译工厂证据保留；本轮没有重复运行旧用例或脚本。

F-223：非交互 main 在 initializeApp 完成 full Config 认证后，首条提示执行前仍无条件 refreshAuth，重复重置 generator、额度状态和认证元数据。现在末尾仍先执行 validateNonInteractiveAuth，仅当同一 full Config 的 isAuthReady() 为 true 且认证类型一致时跳过刷新。未就绪、类型变化、旧 mock 无就绪接口仍刷新；失败沿原路径抛出。partial Config 认证和 full Config 初始化保留，没有移交 generator 或绕过认证策略。

路径：packages/cli/src/gemini.tsx 的最终非交互认证分支；packages/cli/src/gemini.test.tsx 验证真实 main 与 initializeApp 的控制流，Config、模型执行和外部依赖使用夹具。不是完整 CLI 实机冷启动或真实账号认证验收。

## E-581 定向验证

新增 5 项：full Config 正常就绪、初始化后未就绪、初始化后认证类型变化、认证失败、最终策略校验拒绝。partial/full 是不同对象；正常仅刷新 full 一次，其余应刷新场景保持两次；两类错误都不进入 runNonInteractive，最终策略校验没有跳过。

旧实现基线：修正测试文件内另一个 hoisted mock 对 runNonInteractiveSpy 的覆盖后，3 项中 ready 实际失败（full 刷新 2 次），另外 2 项通过。首轮夹具额外两项假失败、LiteRT 缺少 forScope 的夹具日志均明确处理，不作为产品缺陷。

修复后执行：

```powershell
node node_modules/vitest/vitest.mjs run packages/cli/src/gemini.test.tsx packages/cli/src/core/auth.test.ts packages/cli/src/validateNonInterActiveAuth.test.ts -t "preserve non-interactive auth validation after initialization|should validate and refresh auth|ready Config|enforcedType|useExternalAuth" --exclude "upstreams/**" --reporter=dot --maxWorkers=1 --minWorkers=1
```

该次 10 passed / 1 failed / 67 skipped，54.39 秒。失败为旧环境变量认证用例受到本机活动个人供应商影响，mock Config 缺少 setModel；仅将该用例的 getActiveProvider 夹具隔离为 undefined，未修改个人供应商配置。随后只重验受影响旧用例：

```powershell
node node_modules/vitest/vitest.mjs run packages/cli/src/gemini.test.tsx -t "should validate and refresh auth in non-interactive mode" --exclude "upstreams/**" --reporter=dot --maxWorkers=1 --minWorkers=1
```

1 passed / 53 skipped，34.17 秒，退出 0。两次合计 11 项不同相关检查最终通过，未重复累计；新增五项、原就绪复用及原 enforced/useExternal 校验已通过，没有重跑这些已过用例。

编译与静态检查：

```powershell
node --max-old-space-size=4096 node_modules/typescript/bin/tsc --build packages/cli/tsconfig.json
node --max-old-space-size=1536 node_modules/eslint/bin/eslint.js packages/cli/src/gemini.tsx packages/cli/src/gemini.test.tsx --max-warnings 0
node --max-old-space-size=1024 node_modules/prettier/bin/prettier.cjs --check packages/cli/src/gemini.tsx packages/cli/src/gemini.test.tsx packages/cli/src/core/auth.ts packages/core/src/core/contentGenerator.ts packages/core/src/core/contentGenerator.test.ts packages/core/src/core/contentGeneratorAuthStorage.test.ts
git diff --check
```

CLI/core tsc 退出 0；新改动两 TS 的最终 lint 零 warning；六 TS 格式通过。先前并发运行六文件 lint 与格式检查发生 native OOM；随后串行、限制堆大小后通过上述两个最终命令。上一轮四 TS lint 仍以 E-579 记录为依据，不冒称本轮六 TS lint 全部重跑通过。初次格式检查发现补充夹具后的格式问题，Prettier 修正后通过。

## 边界与接续

本轮没有外部模型调用、OAuth 登录、付费重试、旧真实协作任务重跑、全量或冒烟测试。没有更改个人 provider/locale/数据库/PATH、preview.83 安装、版本或打包产物。源码分支提交带 skip ci；不合 master、不运行三平台分发。

旧四份真实协作失败继续未验收；本轮不能证明真实复杂协作质量、整体冷启动性能或最终跨平台包已完成。项目持续目标仍开启。

下一步按现有顺序：
1. 继续检查交互首屏剩余等待，区分必需认证和可复用元数据。
2. 继续演练台任务状态与原生多 Agent 交付链的实际缺陷。
3. 按新增证据维护报告；源码及 Windows 收敛后再统一最终三平台分发。
