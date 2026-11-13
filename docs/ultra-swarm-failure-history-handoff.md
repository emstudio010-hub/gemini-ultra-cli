# Gemini Ultra CLI Swarm失败全文历史交接

日期2026-11-13。WI-200 / E-453至454 / F-157。基线330e9ba9e09c178ca1f6c6f3531c3533ca6b992f，分支codex/ultra-agent-portable。上轮已修复流式工具身份，属progress；整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包。无打包、全局重装、升版本、多平台CI或旧付费任务重跑，preview.83保持。

## 源码与合同

原Swarm失败尝试只更新lastError（最多12000字符）、board（4000字符），长部分输出另存archive路径；后续成功清lastError，结构化历史与完整报告导出只列当前/被替换的主报告，失败全文不在历史索引内。

新增可选failedAttempts数组，每项保存原turn、outcome、SHA/bytes/chars全文引用；每成员最多100项，单全文沿用8MiB上限。失败诊断/不完整或停止的输出均强制归档，保留原成功主报告；后续成功只清当前lastError，不清失败历史或计数。对停止/超时/不完整正文继续给原preview和partial archive路径，避免改变恢复合同。异常诊断也保存完整字符串，不再只靠12000字符截取。

模型上下文只加入failedAttempts的有界元数据索引（count/indexPath/sha/historicalOnly），不内嵌所有全文；索引列原turn/outcome/文件与完整性元数据。与既有成功历史共用不可覆盖的hash索引写入规则，原成功历史JSON内容/路径规则保持。提示明确失败/停止历史是未完成、未验证、不受信证据，不能作为当前结果/权限或审核通过。

完整导出保持原当前/成功历史位置，再追加失败尝试正文，label明确failed attempt、turn、outcome和not a current verdict；逐份用现有SHA/长度校验读取，不同时载入所有长文。失败归档被改/删除时拒绝完整导出，当前报告/state不变。

归档存储失败或超限时，recordMemberFailure继续保存原报告、错误与失败计数，设置持久failureHistoryIncomplete，并在lastError显示归档不可用；后续成功也不清这个缺口，完整导出拒绝冒称历史完整。旧记录字段可缺省，不回填或伪造此前已丢失正文。这里归档的是执行失败/不完整/停止诊断；有效review verdict即使passed=false仍沿用其原主报告/成功返回历史保存合同，不把审核不通过等同于工具执行异常。没有改变独立审核、完成判断、角色权限、预算或自动重试。

## E-453 源码定向

新swarmFailureHistory.test.ts旧5项实际全部失败：短/长失败在恢复后缺全文导出、异常长诊断丢失、损坏/缺失失败文件无结构引用。修后首新5+相关恢复10/成功历史5/上下文3共23通过。新增存储故障场景后最终6+原18共24通过；export5/verdict9额外14通过，合计38不同实际检查通过，无新增skip。

存储故障首fixture spy默认fs对象未覆盖产品namespace调用，1场景失败/其余23通过，storage-spy log/JUnit保留；改用临时fixture目录里真实results同名普通文件阻挡mkdir，验证原文件不改、计数和缺口保留，移除该fixture阻挡后显式恢复，6项通过；最终四文件24全部重验通过。未修改产品迎合spy。

首lint为新测试5处one-var，局部fix拆声明。一次lint与正在格式化的测试文件并发，读中间文本报unterminated string；修改结束后verified lint退出0，原日志保留。后续依赖检查按修改完成后顺序执行，无源码解析损坏。core严格tsc首次/最新、CLI严格tsc、六个本轮文件verified eslint --max-warnings 0、prettier --check及git diff --check均退出0。未跑全量/冒烟。

## E-454 Windows实际原生协作链

Node v24.19.0，独立home/profile/workspace、假凭据，真实Config/gateway/ManageSwarmTool/原生researcher/AgentTool/LocalAgentExecutor/complete_task和loopback SSE。一个reader五轮显式派发：正常长报告→ID变更失败→显式恢复长报告→跨index重复ID失败→显式分片名恢复。5requests/5turns/2failedTurns保持，无自动重试。

两次可见失败分别24302/32306字符，含完整中文中段、结尾和协议错误原因；failedAttempts保留turn2/4及incomplete归属。每次失败原成功长正文逐字保持；恢复后lastError已清，但两个失败引用仍在。真实后续出站messages收到failures索引，可read_file读取全文，不依赖预览审批。最终五份报告＝当前1+成功历史2+失败2，正文精确且失败label明确不是当前verdict。新Node进程重新导出五份SHA一致，退出0；故意修改失败archive后完整导出拒绝，state/当前成功正文/外部修改字节保持，fixture恢复原文后清理。

33条件true，7347ms/退出0/5loopback请求/0外部付费，engine显式cancel，临时根finally清理成功。没有审核员，finish仍拒绝，reader成功不代表整个任务完成。非真实模型质量、复杂逆向、ConPTY或最终包验收；单条8MiB/100项限额保留，旧丢失内容不恢复，不承诺全尝试的全部模型元数据或无限历史。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- swarm-failure-history-before-test.log/-before-junit.xml（旧5失败）；-test.log/-junit.xml（首23通过）。
- swarm-failure-history-final-test.log/-final-junit.xml和-storage-spy-test.log/-storage-spy-junit.xml（存储spy1失败/23通过）；-storage-test.log/-storage-junit.xml（真实阻挡6通过）；-verified-test.log/-verified-junit.xml（24通过）；-export-test.log/-export-junit.xml（14通过）。
- swarm-failure-history-core-compile.log/-final-core-compile.log/-verified-core-compile.log/-cli-compile.log；-lint.log（one-var）/-final-lint.log（并发中间文本）/-verified-lint.log（通过）；-format.log/-extra-format.log/-test-lint-fix.log/-final-format.log/-storage-format.log/-format-check.log。
- verify-source-swarm-failure-history.mjs、source-swarm-failure-history.log/-result.json；verify-swarm-failure-history-preservation.mjs、source-swarm-failure-history-preservation.json。

F-157 -> 失败全文无结构历史与导出，恢复清当前错误后无法完整交接。独立失败引用/有界索引/逐份校验导出补齐，保留原成功报告/计数/审核归属；归档缺口显式可见，不冒称完整。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83保持；E-294/E-364旧复杂真实任务SHA和passed=false保持，无覆盖/付费重跑。未改个人数据库/凭据/工具安装/PATH，旧ultra-cockpit-review-scope-S0wWvh拒绝清理不重试。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。维护目标池、case四项和证据，三份全文SHA一致；显式stage、skip ci推隔离分支，不合并master/Release。继续源码功能收敛；更多模型/长会话、复杂真实交付质量及最终Windows/macOS/Linux统一包仍未验收，整体goal active。
