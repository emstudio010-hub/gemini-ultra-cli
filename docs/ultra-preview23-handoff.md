# Gemini Ultra CLI 取消清理与错误收尾交接

日期：2026-11-10。源码 C:\Users\Administrator\work\gemini-ultra-cli；分支 codex/ultra-agent-portable。整体目标 active，完整上线未验收。本阶段没有真实模型调用，不原样重跑E-077付费续接。

## E-081：F-025 / F-026

四协议流各自建立内部AbortController，与调用方signal组合；流完成、超时或错误时终止fetch，包含DevTools响应副本，并尽力取消reader、释放锁，不等待不受控cancel
Promise、不反向abort调用方。原先只取消reader会留下日志分支网络连接，且底层取消不完成可能阻塞正常结束。

六个HTTP入口现在保留结构化status，429/5xx由既有有界重试器处理，400仍不重试，默认重试次数未增加。四个取消用例和六个状态用例修前均失败；修后加原尾部/截断恢复共12项定向通过，严格lint、格式和核心/CLI类型构建通过。

已安装preview.21的DevTools基线准确结论：1,091ms可见错误、下一提问能完成，但原连接未在下一请求前关闭。9秒观察器触发、ConPTY
AttachConsole辅助错误保留，不能夸大为整个终端无响应。HTTP503基线只有1请求就退出1，没有恢复。

## E-082 / E-083：preview.22

功能提交a6305d075377ee1b59f7c75d7fc6e7bbf0fc1753，三平台运行42767446602
completed/success；工件版本、安装报告、SHA与六rg
hash/0755核对通过。双命令安装preview.22，入口b29189e1fcb4af608922492597d4ce61b0cd5ac5e4ab463270290fcc6269ec25匹配Windows工件，offline缓存安装10秒。

启用真实DevTools日志分支的实际ConPTY/HTTP场景通过：活动头证明拦截器工作；1,079ms可见idle错误、旧连接在下一请求前关闭，带标记用户后续提问成功，2请求/9,866ms/正常退出0，观察器未触发。端点为127.0.0.2以覆盖日志器对127.0.0.1的跳过分支。

HTTP429→200恢复通过。HTTP503→200在127.0.0.2复核2请求/2,601ms/退出0。首次恢复503为0请求ETIMEDOUT，原失败保留；400只有1请求、结构化错误在stderr、退出400，检查脚本原来误要求退出1且只解析stdout，已修正检查契约，未为断言改产品。

## F-027 / E-084：错误后强制退出触发Windows原生断言

持续503两次完成2请求并输出错误JSON后触发libuv
UV_HANDLE_CLOSING断言，退出3221226505。另一次127.0.0.1复核只收到1个HTTP503，不当作严格2请求场景通过。所有原失败记录保留。

原非交互普通错误仍直接process.exit，遗漏了既有自然排空的收尾处理。现拆出reportError，只报告错误并返回退出码；两个非交互入口将它写入process.exitCode，重型入口catch也在清理后设置exitCode，保留5秒清理超时兜底。TEXT保留原抛错与格式；JSON/stream-json保留原错误对象与退出码。早期即时错误包装仍有独立原行为。

19项选择用例通过：JSON/stream-json报告不强制退出、既有即时错误包装、两个入口普通/结构化/自定义退出码；严格lint、格式及类型构建通过。首次六个旧用例还要求process.exit，迁移预期后通过，原日志保留。开发bundle持续503
JSON：2请求/2,890ms/退出503；TEXT：2请求/2,472ms/退出1；均无原生断言。不据此断言所有Windows原生退出异常都已修复。

## E-085 / E-086：preview.23最终交付

功能提交08665e45ff97515b284a180d7ebbbc6e80ad0298。[运行42769345563](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42769345563)三平台completed/success，版本、安装报告、SHA及六rg
hash/0755核对通过；这些CI模型响应为fixture。

| 平台    | 包SHA-256                                                        |
| ------- | ---------------------------------------------------------------- |
| Windows | e64cbbd18b6a31800ab07e525d78ac24743fa786ed31664f5e7d0967ccb85274 |
| Linux   | f0775cd37d997190acadd499df968212c11a934f5436aff923e8c948f8cdac8a |
| macOS   | 8be1d3282211bbfcdd9d56675d9ffbc0788d910d2293aa95f660bddb95024c69 |

本机gemini-ultra和gemini-ultra-cli均为1.0.0-preview.23，入口38478ccfd5e012b6d279154f8a576209c1283b242e76fdc220acfaa8ba772d23匹配Windows工件。已有缓存offline安装10秒，不代表无缓存新电脑离线安装。未合并master或正式发布Release。

安装后受影响错误路径四项全部通过，均隔离loopback、maxAttempts=2：

- JSON持续503：2请求，3,116ms，退出503，错误JSON完整，无原生断言。
- TEXT持续503：2请求，2,495ms，退出1，原有错误文本保留，无原生断言。
- stream-json持续503：2请求，2,544ms，退出503，结果事件完整，无原生断言。
- JSON请求错误400：仅1请求，1,458ms，退出400，结构化错误码400，无原生断言。

没有扩大为所有平台原生错误路径或所有Windows退出场景验收；三平台新包的完整故障路径未逐一实测。没有继续重复已通过的429/503成功恢复或DevTools场景；它们的实际证据对应preview.22，相关实现保留在preview.23。

Windows包：C:\Users\Administrator\Documents\ChatGPT\gmncliu\github-run-42769345563\gemini-ultra-cli-windows-latest\gemini-ultra-cli-1.0.0-preview.23.tgz。

## 工程证据

均在C:\Users\Administrator\Documents\ChatGPT\gmncliu：

- provider-cleanup-before.log / -after.log / -lint.log / -types.log。
- installed-preview21-devtools-heartbeat-before-result.json、installed-preview21-http-before-result.json。
- installed-preview22-devtools-heartbeat-recovery-result.json。
- installed-preview22-http-recovery-result.json原aggregate=false；单项installed-preview22-http-503-recovery-result.json为true，-503-exhaustion及-loopback2失败不改写。
- graceful-http-error-tests.log / -tests-initial-expectation.log / -lint.log /
  -updated-tests-lint.log / -types.log / -final-types.log / -entry-types.log /
  -entry-lint.log。
- dev-preview23-graceful-http-result.json、dev-preview23-graceful-http-text-result.json。
- verify-provider-http-recovery.mjs支持json/text/stream-json，支持单项复核；verify-stream-heartbeat-recovery.mjs支持DevTools真实拦截分支。
- github-preview22-artifacts-result.json、global-install-github-preview22-result.json及github-preview23-run.json。

E-077真实thinking-only失败仍保留；这些独立修复未证明它的根因。复杂逆向、更多原生工具和完整自主任务仍未验收。目标池docs/ultra-goals.md已维护至E-086，本阶段交付完成，整体目标仍active。下一阶段优先结合本地DSH-purge参考和保存会话，离线重建E-077最后请求的角色/工具交接载荷，寻找具体兼容性差异；不盲目重跑八文件付费任务。

新增最终证据：github-preview23-artifacts-result.json、global-install-github-preview23-result.json、installed-preview23-graceful-json-result.json、installed-preview23-invalid-400-result.json、installed-preview23-graceful-text-result.json、installed-preview23-graceful-stream-json-result.json。原preview.22失败结果保留，不能用preview.23通过覆盖原记录。
