# Gemini Ultra CLI ULQ新任务真实协作失败交接

日期2026-11-15，WI-224 / E-503至504 / F-182。基线9733640f50d7f28166bad99ff518c2bf2162ac76，分支codex/ultra-agent-portable。上一goal turn为progress（多审核员一致性修复已推送）。本阶段新增真实质量证据，未改生产业务源码，goal active。源码优先→Windows必要验证→功能收敛后最后打包；不打包/重装/升版本/多平台CI/旧付费任务重跑，全局preview.83保持。

## Evidence → Finding → Path

E-503：实际当前编译源码CLI /swarm，一次全新ULQ1二进制帧解析器修复+中文格式文档任务，非旧ELF/位运算/有符号clamp重放。只使用当前配置供应商的一次有界普通认证生成，不是对端点做安全测试。准备研究protocol、实现implementer、源码审核codecheck、文档审核doccheck四个具名原生成员，各一轮；两审核分别显式声明parser.mjs及FORMAT_REVIEW.md/analysis.json，不允许删除否决者绕过。协调者只读/编排，无shell/测试执行/原生工具/安装/其他网络。无Codex子代理。

新任务提供故障parser.mjs、不可变crc32.mjs/layout.h/fixtures.json/SPEC/INVENTORY和空本地env。契约精确定义20字节头、字节序/非零byteOffset/unsigned sequence、精确长度、1MiB含上界、独立payload副本、strict UTF-8、CRC32为检错非认证，JSON字段分开payload bytes/total frame bytes/Unicode code points，避免旧任务字段含义歧义。输入未包含修后代码或最终数值答案，只有必要协议与原始记录。

主机仅在模型外建立并运行一次原始基线和一次最终验收：ulq-parser-oracle.mjs 31行为条件，基线正常退出0但15失败，证明题目有实际缺陷；不是依赖Agent自写测试。最终仍15失败、parser未改，与任务早停一致。未通过的主机验收不能当产品成功，也没有代写实现使它变绿。

## 真实运行结果

run-source-ulq-live-swarm.mjs一次执行，独立home/profile、当前供应商协议openai-chat、模型deepseek/deepseek-v4.1-flash，low推理，临时输出预算16384/context64000；个人provider原文件未改。/swarm prepare与budget两个本地命令均退出0、0请求。应用32请求/1失败轮/4成员轮，观察器36网络请求/540秒硬限期，maxAttempts1。

运行123901ms（含准备、收集和主机验收），CLI自然退出1，未超时；8实际请求（main4/researcher4），全部HTTP200，观测总prompt_tokens83616、completion_tokens6826（按响应usage相加，不是账单或净缓存费用）。任务phase blocked，requests8/failedTurns1/turns1，唯一protocol/researcher paused，结果原样为 Subagent 'researcher' failed. Error: Provider returned malformed tool argument JSON; the tool was not executed. 后续实现者与两审核没有启动，未写报告或analysis，最终成功标记不存在。

F-182：适配器在解析组装后的工具参数JSON时拒绝，保留失败并触发1失败轮停止，没有自动纠错/重试/增预算/换成员。当前观察器只记录请求工具名/身份及响应字符计数、finish理由、usage，不保存原始工具参数，日志也没有失败调用名/位置。因此不能确认究竟哪一工具调用、上游JSON错误还是流片段组装问题；本阶段不把失败归因为已证明的模型或适配器根因。不执行JSON补全/猜测修复以换取成功。下一步需要无敏感参数内容的工具名、参数长度/解析位置诊断，结合独立本地协议复现，而不是重跑付费任务。

8份wire观测为HTTP200/tool_calls，末两份有reasoning；旁路响应clone常记录incompleteRead=true/AbortError且DONE已见，是适配器完成时取消fetch的既有行为，不据此认定网络截断或重试。应用结果和严格JSON拒绝才是本次失败证据。

## E-504 保全与证据边界

总体passed=false；只有inputsUnchanged/onlyAllowedOutputs/personalFilesPreserved/withinBudget等边界通过，其余交付项false。运行器退出0只表示证据收集成功；CLI退出1、产品任务失败不改变。

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：run-source-ulq-live-swarm.mjs、observe-source-ulq-live.mjs、ulq-parser-oracle.mjs；source-ulq-live-swarm-run.log/-requests.jsonl/-wire.jsonl/-output.txt/-baseline-oracle.json/-final-oracle.json/-result.json；-workspace/与-records/保留输入和原始任务/会话/公开板；-scratch.json记录live=false、临时凭据已删除。未清理原任务或改写成成功，临时workspace保留供只读复盘。个人endpoint/key/custom header在拷贝文本脱敏，不把临时provider配置复制入产物。

新失败result全文SHA256：d36eef0b0cc07036f50b479b20c6348ee85efffffd1fce8cc03ae4b5fbf2a926。verify-ulq-live-preservation.mjs与source-ulq-live-swarm-preservation.json核个人provider/locale/skill-tags固定SHA、ultra-tools不存在、全局83、旧E-294/E-364/E-466和本次E-503四份passed=false结果精确SHA、新临时provider删除均true。

实际packages/core/dist/src/agents/swarm.js含every active auditor门禁，node_modules/@google/gemini-cli-core realpath指向源码packages/core，说明使用当前编译源码而非全局preview.83。无本轮生产源码变更，未重编/重复已通过回归或冒烟。工程脚本仅node --check三份退出0，初保存保全脚本PowerShell嵌套引号解析失败，在运行前改用apply_patch创建脚本后实际保全通过，不影响付费任务。

granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话；只读本地输入、生成普通请求，无外部安全目标。目标池/case更新，Obsidian/源码/工程三份交接全文同SHA，显式stage/skip ci推隔离分支，不合并master/Release。个人数据库/PATH/工具安装与旧被拒清理目录不动。

真实复杂任务质量依然未过。此新失败增加了可复盘证据，不声称修复了F-164或整体上线；不因预算停止把本goal标blocked，仍能继续源码诊断。

## 接续目标（已授权继续）

1. 继续深入工具参数解析失败的无敏感诊断，区分工具身份/参数字节数/解析位置，不回显原参数或思考。
2. 用本地协议覆盖参数解析及失败交接，不重跑ULQ或三份旧付费任务，不自动修复无效JSON。
3. 维护目标池并导出交接；源码收敛、Windows验收后才做最终Windows/macOS/Linux分发。
