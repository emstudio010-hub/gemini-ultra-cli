# Gemini Ultra CLI Swarm恢复与配置一致性交接

日期：2026-11-13。WI-187 / E-427至428 / F-144。源码基线c42e65f391c4f09e79151d393ddeac4ea14839ad，分支codex/ultra-agent-portable。上一阶段源码/Windows验证与提交推进，整体goal active。继续源码完善→Windows必要定向验证→最终统一打包；无打包、重装、升版本、跨平台CI或付费重跑，全局preview.83保持。

## 源码修复

沿着上一轮board准入顺序检查，发现其余四个入口仍先改保存状态：
- SwarmEngine构造器接管已退出owner，先改ownerPid、working/queued→paused，留言错误随后才暴露。
- resume已预检board容量/格式，但未先持有board锁，锁冲突后phase/owner已变。
- setSwarmBudget先保存新上限及接管owner，再追加留言。
- setSwarmModel先保存角色/成员路由，再追加留言。

上述四入口现在复用withPreparedPost：先持有board锁并验证留言、容量和格式，再同步保存状态及追加。失败准入不转移归属、不改phase、范围或配置，不重置累计request/turn/failed计数，也不启动成员。

预算调低到已耗尽值原会先写预算留言，再blockSwarm写第二条；board499条时第二条必定失败。本轮把预算修改及其阻断原因合成一条coordinator留言，在同次准入内保存blocked/paused，提交后才停止本机成员。共用budgetStopReason生成原诊断；自动派发时预算耗尽的原blockSwarm强制停止路径保持，不为留言失败放开预算。

仍不是members/owner/board/latest指针的磁盘原子事务；准入之后突发I/O故障或进程崩溃无整组回滚保证，未做故障注入/压力测试。只处理列明的可预检错误与锁顺序，权限、显式resume和预算限制保持。

## E-427 源码定向

新增swarmRecoveryAdmission.test.ts：真实短子进程退出得到dead PID；旧源码recover4/budget4/model4/resume锁冲突共13实际文件改写失败，原resume三种容量/损坏拒绝与四正常最后槽位对照共7通过。修后21项（16错误、4最后槽位正常、1调低预算阻断）通过。首次model夹具误用无provider前缀路由，合法native:gemini-review-fixture修正后才完成上述旧13失败复现；首夹具log/JUnit另存，不伪称其错误是产品漏洞。

与既有swarmRecovery11、swarm19、agentModelRouting19合计70不同相关检查通过，无全量/冒烟。首相关聚合69过1失败，是旧agentModelRouting capacity断言仍要求抛ProviderRouteError：已通过git blame核对35453309及providerContextWindow.test.ts专门对照，已有产品合同是容量作为可选显示元数据返回undefined、不得fallback/network，而generate/stream/countTokens严格拒绝。只修正该测试capacity分支；保留其三种严格拒绝及预算/provider字节不变断言，没有更改生产路由行为。

core/CLI严格tsc、三个修改/新增文件eslint --max-warnings 0、prettier --check、git diff --check均最终退出0。首lint冗余limit!修正留证（最终lint日志只记最后通过）。首两文件测试从repo根使用默认配置31通过，最终70从core指定项目配置运行；不把覆盖率或测试数量当作真实推理证据。

## E-428 Windows实际跨进程与命令handler

Node v24.19.0。真实Windows子进程用编译core创建20组独立task/owner/counters/member夹具后退出，父进程实际process.kill(pid,0)确认ESRCH，非伪造不可用PID。父进程编译SwarmEngine接管与CLI /swarm resume、budget、model真实handler，minimal配置/UI收集器，无ConPTY。

四操作各full/overflow/damaged/locked共16次拒绝，全任务文件集合与SHA精确保持，不返回submit_prompt、不启动成员。四个独立499条board正常对照成功，历史前缀保持，结果Original evidence及requests/turns/failedTurns各1保持；接管/恢复/预算更新到当前owner，模型切换按原合同仅改future route。正常resume返回submit_prompt但验证器不提交或运行该提示词。另从正常budget状态设499条历史，真实handler调到1请求上限，一条留言同时记录变更/耗尽，blocked/paused且原证据、计数保持。

5汇总条件true，11774ms，验证器退出0；modelCalls=0，父子外部fetch尝试均0，专用fixture finally清理成功。初验证器把Yoga随包data: WASM fetch误算为网络失败，随后记录stack定位yoga-wasm-base64-esm；保留network-guard及local-wasm-diagnostic失败记录。最终只放行本地data:加载（embeddedWasmLoads=1），HTTP等网络仍硬拒绝。未修改产品以通过网络检查；不是模型推理质量、GUI或最终包验收。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- swarm-recovery-admission-fixture-route-test.log/-junit.xml、-before-test.log/-before-junit.xml（13旧失败/7通过）、-stale-capacity-test.log/-junit.xml（69过1旧断言失败）、-test.log/-junit.xml（70通过）。
- swarm-recovery-admission-core-compile.log、-cli-compile.log、-lint.log、-format.log、-route-format.log、-format-check.log。
- verify-source-swarm-recovery-admission.mjs、source-swarm-recovery-admission.log/-result.json及上述network-guard/local-wasm-diagnostic记录。
- verify-swarm-recovery-admission-preservation.mjs / source-swarm-recovery-admission-preservation.json。

F-144 -> swarm.ts恢复、显式resume、budget/model写入与留言不同步。四入口共用board准入锁修复，不因失败错误转移owner或发布新配置；调低预算最后槽位也可正常停止。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、安装preview.83；旧E-294/E-364复杂真实任务精确SHA和passed=false保持，无覆盖/付费重跑。不改个人数据库、凭据、工具安装或PATH。先前被拒绝清理的ultra-cockpit-review-scope-S0wWvh保持，不重试删除。

沿用granted case / PRIMARY R26 code-audit，同会话lead/cae/doc，无Codex子代理或外部扫描。维护目标池、case workitems/timeline/field-journal/evidence，三份全文SHA一致，显式stage本轮源码/报告、skip ci提交推codex隔离分支，不合并master/Release。

后续继续实际Agent交付、恢复与Windows源码收敛；复杂真实任务质量、更多模型和最后Windows/macOS/Linux统一包仍待，整体goal active。
