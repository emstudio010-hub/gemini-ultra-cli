# Gemini Ultra CLI 原生成员token模型交接

日期：2026-11-13。WI-138 / E-330至331 /
F-097。持续目标active。源码优先、Windows必要定向验证、最后统一打包。全局安装仍preview.83，本轮没有打包、重装、版本变化或跨平台CI。

## 修复

F-097：UniversalContentGenerator的生成与容量查找使用native成员选择，但countTokens只解析了路由，没有把传给原生计数器的request.model替换为成员模型。BaseLlmClient进行普通计数或context-calibrator校准时可能带主模型/校准模型，导致实际计数模型与成员生成模型不一致。

现在原生计数请求同样使用当前作用域的native模型ID，保持原取消信号、其他参数及清洗后的上下文；不修改传入对象或全局模型。计数器失败时的本地估算及外部供应商本地估算路径保持。token元数据不增加模型生成观察记录或调度预算。

## 验证

E-330：旧并行native成员经真实BaseLlmClient计数场景失败，两次均按主模型/校准模型返回夹具999，预期成员计数17/29；本地估算失败对照旧实现通过。修后两项加既有native生成选择、外部并行模型隔离2个相关对照共4项通过，11项不相关场景跳过。strict
core类型检查及源码编译、两个修改文件eslint退出0。没有全量/冒烟。

packages/core命令：`npx vitest run src/agents/agentModelRouting.test.ts --coverage.enabled=false --testNamePattern='counts tokens for parallel native member models|retains local token estimation|selects native fallback explicitly|isolates parallel member routes'`。根目录`npx tsc -p packages/core/tsconfig.json`只编译源码，未运行package构建脚本。

E-331：Windows Node
v24.19.0，实际编译源码BaseLlmClient、AsyncLocal成员作用域和UniversalContentGenerator，受控原生token/容量适配器加并发屏障。两个成员实际传入gemini-reader/gemini-reviewer，普通与校准调用分别返回17/29，容量32000/64000；取消信号同一对象、源上下文保持、无作用域泄漏或生成模型观察。故障计数仍用相同成员模型并返回既有本地估算；供应商文件和预置active工作流预算字节保持。10条件通过，5084ms/退出0。没有网络、模型生成或真实Google计数请求，数字是夹具，不是token精度测量。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu。native-member-tokens-before.log/-junit.xml、native-member-tokens.log/-junit.xml、native-member-tokens-source-compile.log、native-member-tokens-lint.log、verify-source-native-member-tokens.mjs、source-native-member-tokens-result.json、source-native-member-tokens.log。辅助脚本不随包分发。

## 边界

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由本会话承担。没有付费任务重跑、个人数据库修改、外部安全目标或原生逆向工具调用。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

这只证明计数/容量/生成选择的模型路由一致性，不证明Google认证已配置、真实计数精度、完整压缩语义或长会话稳定性；仅外部gateway认证仍不凭此获得原生Google调用能力。没有本轮终端UI或最终跨平台验收。更多源码完整性、复杂任务及最终Windows/macOS/Linux交付仍待收敛，目标保持active。隔离codex分支同步带skip
ci，不合并master或正式Release。
