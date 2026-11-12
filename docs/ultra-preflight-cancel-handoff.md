# Gemini Ultra CLI 工具链巡检取消交接

日期：2026-11-12。WI-116/E-285/F-080。goal
active，preview.81已安装；本阶段修复模型工具巡检取消，0付费模型，不改个人配置、数据库或逆向工具。

## 证据与行为

DrillPreflightInvocation.execute忽略ExecuteOptions.abortSignal，runDrillPreflight及其异步PATH查找/IDA状态探针没有调用方信号。预取消仍启动探针，执行中取消不能停止它们并可能返回完成；IDA仅用HTTP状态却不关闭响应正文。三项新增定向场景在旧源码失败。

模型工具现在把abortSignal传入巡检，启动前、每次查找及最终返回前检查取消；PATH查找使用原生execFile的signal，IDA请求合并原1秒超时和调用方signal。调用方取消抛出原reason，不伪装为工具缺失或正常巡检完成；单个查找1.5秒超时、普通IDA离线和正常状态语义保持。IDA返回状态后取消未读body，避免流式正文占用连接。未带signal的CLI与演练台调用保持原接口与有界行为，不声称斜杠命令新增取消键。

3项受影响核心检查修前失败、修后通过，strict core
types及相关lint通过。新随包脚本从实际DrillPreflightTool入口检查：预取消零探针，15个真实execFile夹具子进程与loopback
IDA请求执行中取消，确认进程退出/连接关闭，之后正常巡检仍可用且关闭未读正文。PATH定位器被无害Node
worker替代，底层取消、退出与HTTP是真实行为；不执行用户逆向软件，不证明其具体安装兼容。

工程证据：preflight-cancel-before-junit.xml/-before.log、preflight-cancel-junit.xml/-log、preflight-cancel-types.log、preflight-cancel-lint.log、preflight-cancel-script-lint.log。preview.81已完成本地包及preflight-cancel范围三平台分发与本机安装；其他业务链跳过，不全量/冒烟，不重跑付费协作。R26本地源码审查沿用既有scope，lead/cae/doc在本会话承担。不合并master、不正式Release。

## 三平台与本机交付

E-286：产品源731de7c646427b9ac00ba5a4dfe4dfdbed4baebe/run43229958229三平台preflight-cancel范围completed/success，minimum-node、native-address-recheck及其他未变更业务链skipped；原工作流漏排除native-provider命令夹具，该项也实际成功执行。补齐未来preflight-cancel排除条件，不为此重新构建。独立核对三包81/源chunk、包与入口SHA、六rg身份权限及安装4基础工具。每平台实际安装包DrillPreflightTool验证预取消零探针，执行中取消15个真实execFile定位器夹具子进程与loopback
IDA请求，全部退出、原reason保持且连接关闭；随后正常巡检15个夹具进程也自然退出，返回HTTP200并关闭未读body。每平台共30夹具进程/2次loopback
GET/2连接关闭，0模型/外部网络，不执行任何用户逆向工具。正常探测的是可发现性，不证明具体工具可用于深度分析；初本地包同链也通过；本地独立包核对首次发现额外provider夹具，第二次固定变量名标记未适配esbuild的options2改名，均保留失败日志，核对器改为实际执行状态及变量名无关匹配后通过，无产品行为改动或CI重跑。无全量/冒烟或既有付费任务重跑。

E-287：offline已有缓存安装7189ms/退出0，双命令preview.81、425文件匹配Windows
CI归档。包SHA256
ad39b57b8081ee255629a1cd11fa150fb00a1a63b0cd6f90f61cc7d275cc371e，入口SHA256
e9f81ed63413901e207f9ae111f9f6b8080234d6ddb2d9f38408b69aecf0c914。个人locale/provider哈希保持80末值，ultra-tools.json仍未创建，旧包保留。WI-116/F-080模型工具巡检取消交付；斜杠命令和演练台仍用原有界巡检，不声称新增取消键或取消文件系统读取。无付费、全量/冒烟或未变更协作逆向链重复；goal
active，不合并master或正式Release。

最终证据：github-preview81-artifacts-first-verification.log、github-preview81-artifacts-second-verification.log、github-preview81-run.json、github-preview81-artifacts-result.json、github-run-43229958229/gemini-ultra-cli-\*/preflight-cancel-verification.json、preflight-cancel-package.json/-log、global-preview81-install-result.json、global-install-github-preview81-full-result.json、preflight-cancel-personal-config.json。源码报告/工程报告/Obsidian全文同步。

持续目标仍开启。下一阶段已定位内置local-reverse技能未介绍已实现binary_decompile、64位精确地址指引需对齐实际工具；先补齐原生工作流指引。未验收项继续保留：更长真实协作、复杂多函数和动态逆向、更多供应商及实际新电脑环境。不能以此定向检查声称整体上线完成。
