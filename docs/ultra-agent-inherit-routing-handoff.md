# Gemini Ultra CLI 继承模型与压缩路由交接

日期2026-11-15，WI-222 / E-499至500 / F-180。基线d8f5ee71baf30b4cd0f2359099d4960d2c59e1de，分支codex/ultra-agent-portable。上一goal turn为progress（MCP OAuth取消已推送）。goal active，源码→Windows必要定向验证→功能收敛后最后打包；不打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-180：核对临时模型选择与子Agent路由后，发现三处关联缺陷。AgentRegistry收到ModelChanged只排队异步刷新，setModel返回后的同步派发仍可能读取旧继承alias；LocalAgentExecutor压缩使用definition.modelConfig.model，可把字面inherit传给容量/压缩判断，而实际生成已使用解析后的新模型；ChatCompressionService又把外部模型转成原生chat-compression-default，最终可能经活跃供应商落到保存的旧默认，而非当前临时供应商。

1. registry.ts在ModelChanged同步更新已注册、启用且model=inherit的本地agent alias。完整定义/工具刷新仍走原序列队列，不重载远程Agent，不重写显式模型。disposed门禁及错误日志保护，不把同步alias异常抛回Config.setModel。
2. local-executor.ts压缩与生成一样，通过getModelConfigAlias+overrideScope取得resolved model，再应用agentExecutionModel作用域优先级。容量阈值和压缩参数不再使用inherit字面值；保留原压缩/截断/取消/失败恢复机制。
3. chatCompressionService.ts两轮摘要共用同一模型key。供应商限定路由（含已删除的限定路由）保持原值，已配置的裸外部模型也保持；其余原生模型沿用既有压缩alias。避免临时外部模型摘要暗中落回旧默认；未知限定路由交由既有严格派发诊断拒绝，不先替换成别的模型。未新增设置/依赖/版本，未修改ProviderManager或个人配置。

## E-499 源码定向证据

修前实际复现5个不同失败：registry同步继承1项读到first:saved-model；executor压缩1项传inherit；两轮摘要模型3项（限定/裸已配置/缺失限定路由）均变成chat-compression-default。三份baseline日志/XML退出1，无夹具错误/未处理异常。

修后registry inheritance and refresh+executor Chat Compression/Model Routing选择14通过/146未选；shared compression选择11通过/43未选，包含上述3、原生alias映射、外部容量、强制压缩与原历史保留。合计25不同相关用例（新5+既有20），不重复累加；未跑全量/冒烟。compression单位夹具将ProviderManager路由查询默认隔离为空，指定裸模型用本地stub，避免读个人profile。

core tsc --build首轮及补摘要路由后的最终轮退出0；6个变更TS最终eslint --max-warnings0、Prettier及git diff --check退出0。CLI生产无改动，不重复编译CLI。相关执行器/注册器的其他未选场景不冒称本轮覆盖。

## E-500 Windows实际组件与HTTP/SSE

verify-source-agent-inherit-routing.mjs独立home/profile，真实编译Config/AgentRegistry/ModelConfigService/LocalAgentExecutor/GeminiChat/ChatCompressionService/BaseLlmClient/Universal适配器，原生loopback HTTP及SSE；没有替换生产业务方法。保存的默认为first:saved，second:current容量8192，third:fixed为显式成员控制；推理low，所有凭据假值仅本机。

两次分别临时切换为second:current和已配置裸模型current，在setModel同一同步调用栈（无await）捕获researcher alias，均已更新。对同一内置researcher的独立定义传入较长初始历史、限制1轮、无其他工具，实际调用自动压缩：每次两轮摘要POST及一次生成SSE全部/second/v1/chat/completions、payload.model=current、reasoning_effort=low；真实complete_task使GOAL终止。生成请求有新state_snapshot且旧重复证据已消失，证明压缩结果被采用。原默认first与providers文件原字节始终保持，onModelChange持久化回调调用0。

随后作用域显式third:fixed，真实生成仍走/third、model=fixed，modelsUsed记录third:fixed，主会话second与保存默认first均未变。共14条件true，首次执行退出0，7524ms，7 loopback模型协议请求（4摘要+3生成）、0外部/付费请求，无旧失败任务重放。finally dispose配置、还原fetch、关server/DrillStore，realpath验证后只清真实temp下自有ultra-agent-inherit-routing前缀目录。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-inherit-sync-baseline.log/-baseline-junit.xml；agent-inherit-compression-baseline.log/-baseline-junit.xml；agent-compression-route-baseline.log/-baseline-junit.xml；agent-inherit-routing-tests.log/-junit.xml；agent-compression-route-tests.log/-junit.xml；agent-inherit-routing-core-compile.log/-final-core-compile.log；-lint.log/-final-lint.log与格式日志；verify-source-agent-inherit-routing.mjs、source-agent-inherit-routing.log/-result.json；verify-agent-inherit-routing-preservation.mjs、source-agent-inherit-routing-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466旧失败SHA及false、临时凭据删除保全true；个人数据库/PATH/工具安装与旧被拒清理目录不动。granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。目标池/case同步，Obsidian/源码/工程三份交接全文同SHA。显式stage、skip ci推隔离分支，不合并master/Release。

当前证明源码路由/容量/摘要调用与状态保全，不证明模型理解或摘要事实质量。未重新运行完整Swarm/终端交互/真实账户/跨平台最终包；F-164三次复杂真实任务失败仍保全，整体上线未完成，goal保持active。

## 接续目标（已授权继续）

1. 继续深入F-164原始失败对应的任务契约与独立审核交接，避免把局部正确引用当完整正确交付。
2. 继续核对协作与模型配置其余真实工作路径，只做必要Windows定向检查，不自动重跑旧付费任务。
3. 维护目标池并导出Obsidian交接；功能收敛后才做最终Windows及macOS/Linux分发。
