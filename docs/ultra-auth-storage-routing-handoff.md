# Gemini Ultra CLI 启动认证密钥库隔离交接

2026-11-16；WI-263 / E-579至580 /
F-222；基线 ed15205c102d6f003ff78b378d85fe4fb4691f8f，分支 codex/ultra-agent-portable。goal
active；源码优先、Windows 必要定向验证，暂不打包。

## Evidence → Finding → Path

F-222：createContentGeneratorConfig 在判断 Vertex AI/网关分支前无条件 await
loadApiKey()。无 GEMINI_API_KEY 时，这些不使用 Gemini 保存密钥的路由仍会等待密钥缓存/HybridTokenStorage；底层密钥库不可用或不返回即可阻塞认证准备。已把保存密钥读取放入 USE_GEMINI 分支。Vertex 的 GOOGLE_API_KEY/项目与位置凭据、网关的显式/环境密钥/空密钥行为保持；Gemini 的显式参数 → 配置/环境变量 → 保存密钥优先级保持。没有新增超时后绕过必需凭据的逻辑。

补充更正：performInitialAuth 的 ready 复用只针对同一 Config 已完成的 generator；partial
Config 的 metadata handoff 不会认证新 full
Config。已纠正源码注释，保留必需的新 Config 初始化。本阶段不把旧 ready 分支测试当作整机冷启动提速证明。

## E-579 定向源码验证

新增 5 项检查，旧代码上 3 个非 Gemini 场景实际失败、2 个 Gemini 对照通过；修复后最终合并选择性执行 2 文件 /
15 passed / 45 skipped，退出 0，21.71 秒：

```powershell
node node_modules/vitest/vitest.mjs run packages/core/src/core/contentGeneratorAuthStorage.test.ts packages/core/src/core/contentGenerator.test.ts -t "createContentGeneratorConfig|credential storage|saved Gemini|Gemini key precedence" --exclude "upstreams/**" --reporter=dot --maxWorkers=1 --minWorkers=1
node --max-old-space-size=4096 node_modules/typescript/bin/tsc --build packages/cli/tsconfig.json
node --max-old-space-size=4096 node_modules/eslint/bin/eslint.js packages/core/src/core/contentGenerator.ts packages/core/src/core/contentGenerator.test.ts packages/core/src/core/contentGeneratorAuthStorage.test.ts packages/cli/src/core/auth.ts --max-warnings 0
node node_modules/prettier/bin/prettier.cjs --check packages/core/src/core/contentGenerator.ts packages/core/src/core/contentGenerator.test.ts packages/core/src/core/contentGeneratorAuthStorage.test.ts packages/cli/src/core/auth.ts
git diff --check
```

最终 tsc、四 TS
lint 零 warning、格式及 diff 检查退出 0。首轮旧配置用例两项受活动个人供应商影响，已将该组夹具隔离为空活动供应商；同时首次路径筛选误匹配 upstream 缺 ajv 的集合失败，随后排除 upstream。新测试最初三个类型错误已修正后重编通过；这些中间失败保留在本次执行记录中，没有修改 upstream 或安装依赖。

## E-580 Windows 编译链证据

工程目录保留 auth-storage-windows.mjs 与 auth-storage-windows-result.json。运行：

```powershell
node "C:\Users\Administrator\Documents\ChatGPT\gmncliu\auth-storage-windows.mjs" "C:\Users\Administrator\work\gemini-ultra-cli"
```

Node v24.19.0 / win32，退出 0，passed=true。使用实际 core
dist 公开入口和实际 loadApiKey，仅控制 HybridTokenStorage.getCredentials 边界为永不返回；Vertex
key、Vertex
project、无保存供应商网关配置均在 250ms 观察预算内完成且 storageReads=0（观测 0.44/0.03/0.92ms，仅工厂调用）。切回可返回的夹具密钥后 Gemini 保存密钥读取恰好一次；未创建供应商文件，0 外部模型请求。首次以内部 HybridTokenStorage 模块为入口触发循环导入 TDZ，发生于验证操作之前；调整夹具从产品公开 dist/index.js 入口加载后通过，不把该夹具启动错误归为运行时认证失败。

脚本 SHA256：8218caf7c8ee2424abde4cc5ee41536137bddb5bc58dd376c3a5d9ac47da6853。结果 SHA256：40f2012d812606c4e997dd2c731b2eccf5153083022a47c4c6e1a4cbeb725537。

## 接续与边界

未写个人密钥/provider/locale/数据库/PATH，未调用付费模型、重跑旧真实失败、运行全量/冒烟、打包、升版或合 master。旧真实协作失败和最终跨平台未验收边界保持。本阶段证明不相关密钥库不再阻塞这三个配置路径，不证明整个 CLI 冷启动性能、真实账号认证或全部初始化等待均完成。

下一继续真正首屏认证的剩余等待/重复刷新，再推进原生多 Agent 交付质量、演练台和可移植逆向链路；完成源码及 Windows 验证后才安排最终三平台分发。
