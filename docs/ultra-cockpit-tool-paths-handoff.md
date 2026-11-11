# Gemini Ultra CLI 演练台工具路径配置交接

日期：2026-11-11。WI-093/E-221/F-060，preview.61 已安装。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted。没有真实模型、外部安全目标、个人配置/数据库/逆向工具改动。

## 发现与实现

演练台原先把成功的首次preflight
Promise一直缓存到服务停止。在隔离配置先保存路径A并巡检，再通过共享CLI存储保存B，第二次HTTP巡检仍返回A；cockpit-preflight-before.json保留实际复现。它会误导使用者认为新路径未生效，也不显示之后新增或移除的本机工具。

缓存改为只合并正在进行的请求；成功和失败结束均释放，按Promise身份保护，不让旧请求清掉新请求的缓存。通过界面保存后立即失效缓存，下一次手动巡检重新发现。界面保存有版本计数，保存前发起的巡检迟到时不覆盖新配置提示。没有增加启动扫描或定时巡检。

「本机工具链 → 配置工具路径」使用原生details/select/input/form，与现有主题和键盘交互一致。按需读取支持的15工具，选择工具显示已保存值；粘贴完整路径无需引号，支持保存、清除和重新读取。状态反馈、备份路径与配置位置就近显示，长路径换行，操作中禁用表单，读取失败保持禁用并可重读。中英文标签和成功提示随/language切换。

新增GET/POST
/api/tool-paths，沿用现有loopback监听、Host/Origin检查、会话token和忙碌拒绝。输入严格区分save/reset、已知工具及长度，不接受多余字段；存储复用preview.60的共享校验、互斥、备份及原子替换。坏配置读取返回错误，保存/reset拒绝保留原文件且不回显坏正文，不改PATH、不执行或安装工具。显式环境配置仍优先，Java保留JAVA_HOME；保存路径不证明实际软件兼容。

Evidence → Finding → Path：同一服务两次巡检A/A、保存内容已为B →
F-060缓存过时 → 只保留在途请求及保存失效 → 实际HTTP验证A/B与两同时请求合并为一次发现，再由浏览器确认新路径显示。

## 本地验证及限制

4组定向HTTP检查通过：token/Origin与严格输入拒绝；无效路径/忙碌状态/多余参数保留原SHA；两个同时巡检共享一次发现且外部CLI存储更新后新巡检显示B；reset备份原文、损坏读取/保存/reset拒绝且原SHA保持、不泄漏正文。仅2次受控IDA
loopback状态请求，没有提交任务或调用模型。Node副本仅验证路径发现，从未作为逆向工具执行。

实际浏览器一条路径编辑流程通过：中文带空格路径保存/备份、巡检A、坏候选错误且重读恢复A、保存B再巡检显示B、清除后输入为空；切换英文后标签和保存成功反馈为英文。浏览器运行源服务和隔离的CLI会话接口夹具，不冒充已安装交互终端或另一台电脑真实逆向操作。截图为当前窄视口的编辑区域，未做新的全断点视觉验收。

相关严格type/lint通过；首类型检查发现中文含逗号的翻译key漏引号，修正后通过，原日志保留。没有全量、冒烟、未变更协作链或付费模型重跑。工程证据：cockpit-preflight-before.json/-log、verify-cockpit-preflight-before.mjs、cockpit-tool-paths-api.json/-log、verify-cockpit-tool-paths.mjs、cockpit-tool-paths-browser.json、cockpit-tool-paths-en.jpg、cockpit-tool-paths-types.log、cockpit-tool-paths-final-types.log、cockpit-tool-paths-lint.log。

## 分发与全局安装

E-222：产品源 `1e46960d73c83c5b9a805149901ba922388e3d0a`，
[run 43074841995](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/43074841995)
三平台tool-paths范围completed/success。独立下载核对版本61、源chunk、包SHA、六rg身份/权限及安装4基础工具。包内实际包含tool-paths
API、双语编辑表单、toolPathRevision与Promise身份保护。每平台12实际CLI命令8退出0/4预期42/0模型/无超时，备份/损坏SHA保持。4组源HTTP和浏览器流程只证明本机源服务界面，不把它写成三平台真实浏览器验收。旧协作链skipped，47至60基线保留。

初独立核对使用了jobs已成功、整体run仍in_progress的较早JSON而拒绝；原快照github-preview61-run-before-completion.json保留，读取同一run终态后核对通过，没有重启workflow或业务。

E-223：Windows
CI包offline已有缓存安装7316ms/退出0，双命令preview.61，425文件逐一匹配CI包，旧包保留。包SHA256
`05b63c99410ae66cc3022b9395e7df51c0fc7b70d05e9619b5dd4f8cb3e9fc80`，入口SHA256
`017cb8e1fa3a5942fcdb61c53ca1bf0ebbe4ce23a2bb6110bec2feb519d06d98`。没有追加本机业务、启动基准或付费任务。

最终证据：github-preview61-run.json、github-preview61-artifacts-result.json、github-preview61-artifacts-verification.log、github-run-43074841995/、global-preview61-install-result.json、global-install-github-preview61-full-result.json、cockpit-tool-paths-personal-config.json。个人locale
SHA
`4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8`、providers
SHA `e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332`
保持，ultra-tools.json仍未创建。本轮隔离源服务已停止。源码、工程正式报告及Obsidian全文同步。

goal
active。现有工具/协作基线保留，更多模型/长任务、原生协作看板、语义准确性和跨机复杂逆向继续。不合并master或创建正式Release。
