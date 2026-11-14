# Gemini Ultra CLI Anthropic 工具块完整性交接

2026-11-15；WI-241 / E-537至538 / F-199；基线a15729036dbb92d57270cbba6f64dfb0b7b24b7a，分支codex/ultra-agent-portable。上一goal turn为progress（排队成员Plan复核已推送）。goal active；源码完善→Windows必要定向验证→功能收敛后最后统一Windows/macOS/Linux打包；preview.83保持，无打包/重装/升版/三平台CI/旧付费重跑。

## Evidence → Finding → Path

先沿E-503真实失败检查当前诊断。发现WI-225已实现ProviderToolArgumentsError并由调用链保留，故未重复修改，也没有重跑ULQ或声称其真实根因已被修复。继续人工检查Anthropic参数流的归属，确认F-199。

F-199：streamAnthropic原toolBlocks.set(index)覆盖重复编号，没有约束跨编号工具ID唯一，input_json_delta找不到块时静默丢弃，content_block_stop完全忽略。重复编号/ID、文本编号被重用、未知编号或已关闭块的参数仍可在message_stop后被当成有效工具响应发布，可能丢参数或混淆调用身份。OpenAI侧已有类似ID门禁，但不能据此假设Anthropic也正确。

修复在单响应内记录全部带编号的content_block_start与已见tool ID；重复编号（包括文本→工具）或跨块ID复用立即抛固定诊断。工具块增加closed位，显式stop后不接参数；参数delta必须指向已有且未关闭工具块，未知/缺编号同样失败。工具集合仍到整个响应成功结束后才统一发布，错误诊断不回显上游ID/名字/参数。原合法碎片顺序、不同编号交错、普通文本和初始input对象保持。不新增自动修补JSON、重试或模型切换；未新增要求兼容端点每块必须发stop。

## E-537 必要源码检查

新增anthropicToolBlocks6项：五类异常（编号复用、ID复用、未知参数块、关闭后参数、文本编号重用）要求失败且零工具发布；一个合法控制覆盖普通文本、交错片段和含Unicode初始input。原源码五异常实际失败/正常控制通过，退出1。修后新6+既有参数诊断7共13不同相关检查通过，退出0。

core tsc --build、双TS eslint --max-warnings=0首次退出0。编译较慢，持续按原session等待并确认结束，未另起重编；并非CLI启动耗时。后续Prettier仅格式调整新测试/长throw，两文件check与git diff --check退出0，纯格式不重复行为检查。无CLI重编、全量或冒烟。

## E-538 Windows编译实际执行链

verify-source-anthropic-tool-blocks.mjs独立home/profile，真实Node loopback HTTP/SSE与编译Anthropic适配器。先五异常逐一验证明确固定诊断、零functionCalls、无上游私有marker；每个只请求一次。

随后实际Config.initialize/gateway/ManageSwarmTool/coder/AgentTool/LocalAgentExecutor/GeminiChat/Swarm/export链。失败fixture先发合法write_file完整工具块，再发未知编号参数片段；整批不发布，因此目标must-not-exist.txt不存在。成员paused/任务blocked，requests=1/turns=1/failedTurns=1；异常原因保留在成员报告和导出报告，上游私有marker未进状态/报告。显式取消失败任务后独立合法Anthropic complete_task控制，成员waiting且有CONTROL结果，failedTurns=0，整任务仍active未冒称交付。

18条件全部true/9324ms/首次脚本退出0，共7次真实本地/messages请求（5异常+1原生失败+1合法控制），失败分支无自动重试，provider配置字节保持，0外部fetch/付费调用/旧失败重跑。是实际执行器与工具阻断证据，模型响应仍为本地fixture，不是实际供应商或复杂协作质量验收。

finally stop自有成员并wait、dispose自有Config、恢复fetch/DrillStore并关闭自有server，经realpath父目录/前缀核验只清自建temp根。未触碰历史被拒清理目录。

## 证据、保全与接续

工程C:/Users/Administrator/Documents/ChatGPT/gmncliu：anthropic-tool-blocks-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-core-compile.log、-lint.log、-format-write.log/-format.log；verify-source-anthropic-tool-blocks.mjs与source-anthropic-tool-blocks.log/-result.json；verify-anthropic-tool-blocks-preservation.mjs与source-anthropic-tool-blocks-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败精确SHA与passed=false、ULQ临时凭据删除均保全true。无修改个人数据库/PATH/工具安装或旧未跟踪文件。沿用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。三份交接同SHA、目标池/case同步，显式stage、skip ci推隔离分支，不合并master/Release。

边界：本阶段只保证上述Anthropic工具归属/已显式关闭块的参数处理，不是所有消息状态机或服务器内置工具的完整实现；已有可见文本在失败前可作为未接纳草稿保留。E-503是另一个实际协议/任务，不据此次Anthropic fixture改写旧失败。接续继续模型协议真实可达缺陷与用户可见恢复流程，兼顾启动/加载和可移植逆向；真实复杂协作质量及最终分发未全面完成，goal active。
