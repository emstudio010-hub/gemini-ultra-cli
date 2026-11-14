# Gemini Ultra CLI 错误元数据安全交接

日期2026-11-15，WI-231 / E-517至518 / F-189。基线8502e1ec0e2d436af0fe0bcb908d0ce0c83b1d4d，分支codex/ultra-agent-portable。上一goal turn为progress（Legacy/Remote观察器隔离已推送核远端）。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，无打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-189：Local/Legacy fatal事件的code/status原直接放任意值，循环对象/BigInt使JSON.stringify失败；Legacy event-translator.mapError把原structured对象直接放rawError，额外私有字段/循环引用也跨入事件。Legacy fatal消息/stack及Remote父错误消息/stack仍未沿已有脱敏规则。错误属性getter抛错还能破坏诊断生成。基线7场景5实际失败/2正常过，退出1，无夹具收集错误。

新增utils/agentErrorDiagnostic.ts：safeAgentErrorMessage读取可读message并沿现有sanitizeErrorMessage，否则保护性String转换；safeAgentErrorMetadata只新建标量字典，Error类名限128字符ASCII标识符，exitCode限安全整数，code/status限安全整数或不超过256字符的脱敏字符串，stack仅在请求时复制脱敏文本。对象/BigInt/函数/非安全整数/超长code或status/抛错getter不保留，不复制cause/原参数或原错误对象，不修改源异常。没有新增任意私有正文识别规则。

Local/Legacy/Remote fatal出口使用共同metadata函数，Local/Legacy用共同message函数，Remote保留A2A用户友好消息与前缀并脱敏。event-translator.mapError同样采用安全字段，rawError仅在有效status存在时生成新的message/status/可选code快照，原status到gRPC映射与CLI还原仍保留。原任意附加字段不再可从rawError恢复，这是本次边界修复的明确行为；核心父事件不再宣称原对象无损调试。未改调度/观察器隔离/预算/自动重试/工具参数严格解析。原异常仍照原执行路径抛回，不因导出脱敏变成成功。

## E-517 源码与消费端兼容

新增error-metadata10用例：有私有字段和self循环的structured快照、code循环、status BigInt均可安全序列化；message/code已有凭据模式脱敏；429/RESOURCE_EXHAUSTED与FatalError44控制保留；stack脱敏与原对象不变；抛错code/status/stack getter忽略；超长code/非有限status与exitCode省略。10通过，加local-error-handoff旧4、mapper/Legacy fatal meta旧筛选9及CLI消费端4，共27不同相关用例通过。核心86与CLI62未选跳过不计，无全量/冒烟。

CLI4检查使用实际LegacyAgentSession（测试mock保留original类）：plain StructuredError在TEXT归一、字符串status保留code不冒充数值status、StructuredError JSON格式、FatalInputError自定义退出码。由此核实rawError安全投影没有破坏这些既有还原合同，非原生终端验收。

core初/最终tsc --build退出0。首lint不允许Reflect命名空间，改为isRecord索引与受保护的函数name读取；最终6TS零warning lint退出0。此helper改动后单独重验新10通过，其余相关场景未重复。最终7文件格式及git diff --check退出0。CLI生产未改不重编。

## E-518 Windows真实协议与报告落盘

verify-source-session-error-metadata.mjs独立home/profile、假key、fetch只许自有loopback。实际Config/gateway/GeminiClient/Legacy、内置coder/LocalSubagentSession/LocalExecutor/GeminiChat及Remote/A2AClientManager/SDK的HTTP/SSE，没有业务模块替换。

每协议一个凭据模式故障与独立正常控制：Legacy/Local HTTP401带假api_key/token、Remote JSON-RPC错误带假凭据和额外data。父事件JSON均无PRIVATE标记、含脱敏标记、终态failed；Local/Remote getResult仍拒绝原异常。Legacy structured rawError仅含message/status/code。三个独立正常控制保持各自METADATA_CONTROL并completed。

另直接使用实际编译mapError和safeAgentErrorMetadata，对构造的循环code/BigInt status/NaN exitCode错误生成安全诊断，验证可序列化和不含私有标记，普通ENOENT/429/44/Error身份控制保持。这是本地库入口合成输入，不称实际供应商返回了循环对象。事件与安全诊断写入source-session-error-metadata-reports.json并读回确认。

22条件全true，首次执行退出0，16328ms；4Chat/2A2A流请求+1card GET，0外部付费/旧任务重跑/自动模型重试。finally自有session.abort/配置dispose/还原fetch/关闭loopback/DrillStore，realpath与前缀验证后仅清真实temp下自有ultra-session-error-metadata根。未触碰旧被拒清理目录。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：session-error-metadata-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-helper-final-tests.log/-helper-final-junit.xml；-related-tests.log/-related-junit.xml；-cli-tests.log/-cli-junit.xml；-core-compile.log/-final-core-compile.log；-lint.log/-final-lint.log；-format-write.log/-final-format-write.log/-helper-format.log/-format.log/-final-format.log；verify-source-session-error-metadata.mjs、source-session-error-metadata.log/-result.json/-reports.json；verify-session-error-metadata-preservation.mjs、source-session-error-metadata-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true。个人数据库/PATH/工具安装/旧未跟踪文件保持。PRIMARY R26 code-audit、granted scope、lead/cae/doc同会话，无Codex子代理/外部安全目标。目标池/case追加、Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

本轮是错误事件边界修复，不保证所有日志或任意无标识私有正文脱敏，不证明E-503根因或F-164真实协作质量已过；最终分发与真实长任务仍待，goal active。

## 接续顺序（已授权继续）

1. 回到目标池核对启动、模型配置和协作功能的当前证据，选择仍影响实际使用的源码缺陷继续深入。
2. 保留四份真实失败及本轮报告，按最小必要范围验证、更新目标池并导出交接，不自动重跑付费任务。
3. 源码功能收敛后统一Windows最终验收，最后macOS/Linux打包。
