# Gemini Ultra CLI 工具参数安全诊断交接

日期2026-11-15，WI-225 / E-505至506 / F-183。基线941f32f5ceb49c201422915e31e448d9eedbfa1f，分支codex/ultra-agent-portable。上一goal turn为progress（新ULQ真实失败证据/临时凭据清理/目标池已落地），本阶段补源码诊断，goal active。源码优先→Windows必要验证→功能收敛后最后打包；不打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-183来自E-503真实任务：外部响应组装参数解析失败时只返回通用Error，Swarm只能保留malformed tool argument JSON，无法知道工具身份或大致失败位置。既有严格拒绝本身正确；当前没有原参数，不能反向证明上游或适配器根因。本轮不修补/补全JSON、不放行无效工具、不重跑ULQ，而补安全且可导出的诊断。

新增providers/providerToolArguments.ts：ProviderToolArgumentsError稳定字段protocol、toolName可选、argumentBytes（UTF-8字节数）、argumentChars（UTF-16码元数）、reason=invalid-json或non-object、jsonPosition可选（零基UTF-16码元偏移，非字节）。只接受本次请求已声明且匹配有界安全字符的工具名，否则unknown，避免把供应商塞入工具名的任意内容回显。原始参数/JSON.parse消息/原Error/cause均不保留；仅提取并检查0..text.length的数值position，Unexpected end时用结尾，其他运行时无位置则省略。中英错误说明该响应工具未执行、应先查响应格式再显式重试，正文不显示。

universalContentGenerator四个既有parseArgs调用点统一接新解析器：Chat非流、Chat流、Responses流、Anthropic流。JSON对象校验沿既有isRecord；空实参既有默认{}行为保持，合法参数原样返回。Gemini原生对象参数未改。工具调用仍整批收集，任何一条参数无效时不发布任何functionCall，前面有效调用也不执行；无新增自动重试策略。docs/resources/troubleshooting.md补诊断量纲/位置解释与排错边界。

## E-505 定向回归与静态检查

新providerArgumentDiagnostic最初7项旧源码6失败/合法对照1过，退出1，无夹具错误。覆盖四个适配入口错误类型/安全工具身份/Unicode字节与码元长度及position、私有内容不出现在Error字符串或序列化、非object根分类与未声明工具名隐藏、中英反馈、合法参数不变。

修后新7+既有工具身份/片段顺序6，共13通过；另补整批前一个合法read_file、后一个坏complete_task场景，0工具释放且私有标记不泄露，单项通过/6未选；最终解析器改用既有类型guard后只重验新suite7通过。合计14不同相关（新8+旧6），不把重复运行相加；无全量/冒烟。

core tsc --build首/最终退出0。首lint发现新类型assertion过窄与重复type import，改用既有isRecord并合并导入后4TS最终eslint --max-warnings0退出0。首最终format发现新增suite样式，修后5代码/文档最后Prettier退出0；git diff --check退出0。CLI生产未改，不重编；无新依赖/设置/版本。

## E-506 Windows实际HTTP/SSE与原生成员交接

verify-source-tool-argument-diagnostic.mjs独立home/profile、实际编译Universal四入口与Config/gateway/ManageSwarmTool/内置coder/AgentTool/LocalAgentExecutor/GeminiChat/Swarm/报告导出；原生loopback HTTP/SSE、假凭据，未替换业务方法，fetch限定自有origin。

四入口各一次实际无效参数请求，均ProviderToolArgumentsError，tool=complete_task、bytes48/UTF-16码元42/position35，协议区分正确，0functionCall释放；Error无原私有标记/无cause。包含汉字与emoji，证明字节数和UTF-16位置没有混同。

原生coder场景同响应里先给合法write_file，再给complete_task坏参数；实际解析拒绝后Swarm blocked/author paused，requests1/turns1/failedTurns1，must-not-exist.txt确实未创建。失败正文保留protocol/tool/bytes/position，members、board及导出报告不含原私有参数标记，导出仍含可用诊断。只显式cancel该隔离任务，再创建独立合法complete_task对照，成员waiting且CONTROL_COMPLETED，失败0；没有审核员，不把这个成员成功冒称整个Swarm完成。

21条件全true，首次实际执行退出0，8809ms，6 loopback模型协议请求（四适配错误+原生成员错误+合法成员对照），0外部/付费/ULQ重跑。Windows执行后lint仅用相同语义的既有isRecord替换类型收窄写法，相关新suite最终重验；未重复完整Windows链。finally只停自有成员、等待收尾/dispose配置/恢复fetch/关闭server/DrillStore，realpath核实后清真实temp下自有ultra-tool-argument-diagnostic前缀根。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：tool-argument-diagnostic-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-batch-tests.log/-batch-junit.xml；-final-tests.log/-final-junit.xml；-core-compile.log/-final-core-compile.log；-lint.log/-final-lint.log；-final-format.log（首样式失败）/-last-format.log及write日志；verify-source-tool-argument-diagnostic.mjs、source-tool-argument-diagnostic.log/-result.json；verify-tool-argument-diagnostic-preservation.mjs、source-tool-argument-diagnostic-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466/E-503四份passed=false精确SHA、ULQ临时凭据删除均保全true。个人数据库/PATH/工具安装与旧被拒清理目录不动，ULQ原工作区与证据不动。granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。目标池/case同步、Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

此诊断不能单凭位置区分供应商生成与stream组装，不保存原始敏感响应、不中途修复，不证明E-503已修好。真实复杂协作F-164/F-182仍未通过，终端UI、其他机器与最终包未新验收，goal保持active。

## 接续目标（已授权继续）

1. 继续深入流式工具参数的片段归属与完整性，寻找可本地复现的组装缺陷，避免猜测性JSON修复。
2. 核对失败诊断在两种子执行入口及任务恢复中的一致性，不重跑四份付费失败任务。
3. 维护目标池并导出交接；源码功能收敛后才做最终Windows及macOS/Linux分发。
