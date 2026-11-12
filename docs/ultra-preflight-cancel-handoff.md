# Gemini Ultra CLI 工具链巡检取消交接

日期：2026-11-12。WI-116/E-285/F-080。goal
active，前置preview.80；本阶段修复模型工具巡检取消，0付费模型，不改个人配置、数据库或逆向工具。

## 证据与行为

DrillPreflightInvocation.execute忽略ExecuteOptions.abortSignal，runDrillPreflight及其异步PATH查找/IDA状态探针没有调用方信号。预取消仍启动探针，执行中取消不能停止它们并可能返回完成；IDA仅用HTTP状态却不关闭响应正文。三项新增定向场景在旧源码失败。

模型工具现在把abortSignal传入巡检，启动前、每次查找及最终返回前检查取消；PATH查找使用原生execFile的signal，IDA请求合并原1秒超时和调用方signal。调用方取消抛出原reason，不伪装为工具缺失或正常巡检完成；单个查找1.5秒超时、普通IDA离线和正常状态语义保持。IDA返回状态后取消未读body，避免流式正文占用连接。未带signal的CLI与演练台调用保持原接口与有界行为，不声称斜杠命令新增取消键。

3项受影响核心检查修前失败、修后通过，strict core
types及相关lint通过。新随包脚本从实际DrillPreflightTool入口检查：预取消零探针，15个真实execFile夹具子进程与loopback
IDA请求执行中取消，确认进程退出/连接关闭，之后正常巡检仍可用且关闭未读正文。PATH定位器被无害Node
worker替代，底层取消、退出与HTTP是真实行为；不执行用户逆向软件，不证明其具体安装兼容。

工程证据：preflight-cancel-before-junit.xml/-before.log、preflight-cancel-junit.xml/-log、preflight-cancel-types.log、preflight-cancel-lint.log、preflight-cancel-script-lint.log。候选preview.81待本地包及preflight-cancel范围三平台分发与本机安装；其他业务链跳过，不全量/冒烟，不重跑付费协作。R26本地源码审查沿用既有scope，lead/cae/doc在本会话承担。不合并master、不正式Release。
