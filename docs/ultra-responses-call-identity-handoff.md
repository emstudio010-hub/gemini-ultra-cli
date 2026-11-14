# Gemini Ultra CLI Responses工具片段归属交接

日期2026-11-15，WI-226 / E-507至508 / F-184。基线19f488e4f89be56d5d02841c8993d3d2d795b9e2，分支codex/ultra-agent-portable。上一goal turn为progress（工具参数安全诊断已推送）。goal active；源码优先→Windows必要定向验证→功能收敛后最后打包，不打包/重装/升版本/多平台CI/旧付费重跑，全局preview.83保持。

## Evidence → Finding → Path

复查流式工具参数身份后发现F-184，发生于Responses协议而非E-503使用的Chat：response.function_call_arguments.delta/done引用未知或缺失item_id时被静默忽略；重复output_item.added会重建调用并清空已累计args；item_id可变更call_id/name，两个item可复用同call_id；done后仍可追加片段或被另一份done替换。这既能丢失合法参数，也能把不完整/相互矛盾的响应当正常工具调用放行。

universalContentGenerator.ts仅Responses调用组装段修改：calls记录finalized、另存call_id→item_id归属。完整且同身份的重复声明幂等，不清参数；相同item的call_id/name改变、call_id被另item复用都报固定无私有ID的协议错误。delta/done必须命中已声明item，否则整批拒绝；done后非空delta拒绝；重复done仅相同参数或未提供新参数允许。首次done仍沿协议采用其完整arguments，保留正常终值行为。空delta无变化可接受。没有额外要求所有端点都发done，已声明调用仍可仅由delta完成；不猜修JSON、不新增自动重试。

错误消息只含固定阶段说明，无原ID/name/参数；沿既有最终组装后一次发布functionCall的逻辑，错误调用不能使同响应前一个有效调用先执行。troubleshooting补片段归属/重复声明/最终参数语义。未改Chat/Anthropic/Gemini组装、供应商配置、全局版本或依赖。

## E-507 源码回归与静态检查

新增providerResponsesIdentity共10场景。旧源码9实际失败/1正常对照通过，退出1，无夹具错误：orphan delta、缺item的delta、orphan done、复用call_id、同item改call_id、同item改name、done后delta、矛盾done原先均未拒绝；重复声明清前半参数使本来合法调用解析失败；交错调用+同值done对照原先通过。

修后新10+既有安全参数诊断7，共17不同相关用例通过，退出0。正常控制保留重复声明后的片段以及交错两call的原参数/独立ID，未把重复字符串一律去重。无全量/冒烟。

core tsc --build退出0；双TS eslint --max-warnings0退出0。首Prettier仅文档新增段需换行，修后3文件最终检查与git diff --check退出0，不重复测试文档换行。CLI生产未改不重编。初baseline与修后测试收集阶段分别约90秒，原会话句柄确认终止后才推进，没有因为观察慢而重启任务；这些不是CLI启动速度基准。

## E-508 Windows真实协议与原生成员

verify-source-responses-call-identity.mjs独立home/profile、真实编译Universal Responses及Config/gateway/ManageSwarmTool/内置coder/AgentTool/LocalAgentExecutor/GeminiChat/Swarm，原生loopback HTTP/SSE，无生产业务替换，fetch限定自有origin。

直接实际HTTP覆盖orphan delta、改item身份、复用call_id、矛盾final四种错误，均0functionCall发布、报OpenAI Responses固定错误且私有身份标记不出现。正常直接控制：两个交错call、重复同声明、重复同done，其中一call只有delta无done，结果x1/y2与各ID保持。

原生成员任务返回合法write_file后接orphan done；实际Swarm blocked、coder paused，1请求/1轮/1失败，目标文件must-not-exist.txt未创建，成员正文保留安全归属错误而不含私有item标记。只显式cancel隔离任务，再创建独立正常控制，同调用重复added夹在两段args中并重复相同done，实际complete_task后成员waiting、无失败、RESPONSES_IDENTITY_CONTROL保留。没有独立审核员，此控制仅成员完成，不称整个任务交付。

15条件全true，首次执行退出0，17333ms，总7本地Responses请求（四错误/一交错控制/原生错误/原生正常），0外部/付费/ULQ或旧失败重跑。个人provider原字节保持，无模型自动重试。finally停自有成员/等待收尾/dispose配置/还原fetch/关loopback与DrillStore，realpath验证后只清真实temp下自有ultra-responses-call-identity前缀根。

## 证据与保全

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：responses-call-identity-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml；-core-compile.log；-lint.log；-format.log（首文档格式失败）/-final-format.log及write日志；verify-source-responses-call-identity.mjs、source-responses-call-identity.log/-result.json；verify-responses-call-identity-preservation.mjs、source-responses-call-identity-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466/E-503四份passed=false精确SHA、ULQ临时凭据删除均保全true，旧实际失败及workspace不动。个人数据库/PATH/工具安装与旧被拒清理目录不动。granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。目标池/case同步、Obsidian/源码/工程三份同SHA，显式stage/skip ci推隔离分支，不合并master/Release。

本轮独立缺陷不等于Chat协议E-503根因，无法据此称真实ULQ或复杂F-164协作质量已修。尚未验证实际Responses供应商/原生终端/跨平台最终包；goal保持active。

## 接续目标（已授权继续）

1. 继续深入Chat候选响应与工具片段的归属，避免只取每帧首项而混用不同候选。
2. 核对两种子执行入口的失败交接，保留安全诊断和先前结果；不重跑四份付费失败任务。
3. 维护目标池并导出交接；源码功能收敛后再做最终Windows及macOS/Linux分发。
