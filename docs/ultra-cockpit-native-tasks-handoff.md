# Gemini Ultra CLI 演练台原生协作看板交接

日期：2026-11-11。WI-094/E-224/F-061，preview.62 已安装。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted。无真实模型调用、外部安全目标或个人配置/数据库/逆向工具改动。

## 问题与实现

演练台旧collaborationTasks只展示会话内普通子任务，不读取保存的Teamwork、Boost、Grill
me和Swarm。新增原生Agent任务目录与详情接口，复用项目分页目录，UUID和模式严格校验，读取根目录固定取当前CLI项目；HTTP沿用token、Host和Origin验证。

新readAgentTaskDetails仅投影需要的有界字段，检查常规目录/文件、拒绝链接并限制大小。工作流用savedWorkflowBudgetSummary读取已有预算，避开会迁移旧账本的agentWorkflowSummary路径；没有读取current/latest绑定，没有写入/审批/恢复任务或补建预算。未知计数和未知上限均为null。Swarm保留成员状态、短结果预览与最近12条共享留言；工作流保留里程碑、当前阶段、批准状态与最近4份阶段结果。预览最多1200字符，长结果提供由哈希推导的全文路径，但面板不加载/验证档案正文，明确提示用reports读取全文。坏留言或旧预算单独提示，不抹掉仍可读取的主状态；坏主记录返回通用诊断，不回显原始坏正文。

界面用原生select紧凑列出20任务，选择后显示完整ID、保存时间及详情，避免二十张卡片把结果推到页底；坏记录保留禁选并给完整ID。目录按需刷新，只有选择任务且演练台可见时才每4秒刷新详情；未变化不重复重建DOM，迟到的旧任务响应不覆盖新选择。没有启动目录扫描或后台模型请求。任务原文用textContent显示，HTML形式的留言作为文本。界面标签随中英文切换。

F-061：浏览器发现全局button
display:inline-flex覆盖原生hidden属性，上一页/下一页在不该出现时仍可见；补显式hidden规则，最终首/末页分别隐藏上一页/下一页。截图看似横向截断，实际DOM测得viewport与scrollWidth均1265，面板右边界1218，在视口内，没有为截图改尺寸。

Evidence → Problem →
Path：现有页面/状态接口缺原生任务 → 共用目录与只读详情投影 → 三组HTTP覆盖四种任务、未知预算和文件保持，再由浏览器确认成员/留言/分页/实时变化。F-061隐藏按钮可见 → 显式hidden样式 → 浏览器首/末页状态确认。

## 本地验证与边界

3项核心检查通过：四模式按ID读取不重绑/不补旧预算、成员预览有界和损坏留言/未知用量保持、模式/路径/链接拒绝。未知Swarm上限改为null后只复核受影响的一项通过，其余未变更场景不重跑。初次Vitest从仓库根目录误找setup文件而未收集到测试，保留原记录；改正确package
cwd后3项通过。

实际源服务3组HTTP检查：认证/选择参数；四模式进度/预览/已知7/30和未知用量；22项20+2分页无重复、坏记录及模式错误通用拒绝、不泄漏坏正文。请求前后29文件逐一SHA一致，没有提交任务/模型请求/预算迁移。隔离持久记录是受控fixture，不冒充新模型协作或真实逆向任务。

实际浏览器路径通过：中文目录四模式、坏记录禁选、Swarm成员与共享留言、长结果预览/全文路径/终端命令；HTML形式留言为文本且无img节点。宿主只对fixture的members.json写入blocked/paused和LIVE_SWARM_STATUS_UPDATED后，所选详情自动刷新；不是模型完成证明。分页第二页仅2项且无下一页，返回第一页；Teamwork未知用量及英文Boost7/30、里程碑和未完成结果可见。浏览器结束后29文件仅有该次明确宿主写入的members.json变化，其他文件保持，源服务已停止。首按钮样式问题和改为紧凑选择器前的观察保留。

相关严格type已通过；首script
lint缺少Node全局导入，补显式URL/timers和globalThis.fetch后单独复核脚本通过；没有全量/冒烟/旧协作或付费任务重跑。工程证据：cockpit-native-tasks-types.log、cockpit-native-tasks-final-types.log、cockpit-native-tasks-final-lint.log、cockpit-native-tasks-tests.log及setup-failure/final/unknown-limit
JUnit、cockpit-native-tasks-api.json/-log、cockpit-native-tasks-browser.json、cockpit-native-tasks-en.jpg、cockpit-native-tasks-live-mutation.json、cockpit-native-tasks-retention.json。

## 分发与全局安装

E-225：产品源 `6884b423e472a6a462d85abc8e64c682524304e0`，
[run 43078701151](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/43078701151)
三平台cockpit-tasks范围completed/success。独立下载核对版本62、源chunk、包SHA、六rg身份/权限及安装4基础工具，包内实际含agent-tasks
API、native-task-choice与readAgentTaskDetails调用。每平台源服务3组HTTP覆盖四模式、22项20+2分页无重复、Boost已知7/30及旧用量未知、认证拒绝及损坏主记录通用诊断；29文件SHA逐一保持。旧无关链skipped，47至61基线保留。这里是三平台源服务HTTP和包安装验证，实际浏览器仅本机隔离源服务，不冒充三平台浏览器或新的模型协作。

E-226：Windows
CI包offline已有缓存安装14300ms/退出0，双命令preview.62，425文件逐一匹配CI包，旧包保留。包SHA256
`f9ad5a2c650a5ba599dcf86d5411edd5a7b36bf83a951b34f50241e55f885513`，入口SHA256
`d6bf08430699d90fae66423287c192cb952adc4d7a37f94e3259e153518263c9`。没有追加本机业务、启动基准或付费任务。

最终证据：github-preview62-run.json、github-preview62-artifacts-result.json、github-preview62-artifacts-verification.log、github-run-43078701151/、global-preview62-install-result.json、global-install-github-preview62-full-result.json、cockpit-native-tasks-personal-config.json。个人locale
SHA
`4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8`、providers
SHA `e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332`
保持，ultra-tools.json仍未创建。源码、工程正式报告和Obsidian全文同步。

goal
active。已有真实协作/原生静态逆向基线保留；更多模型长任务、语义准确性、复杂跨机逆向和进一步任务控制便利性继续。不合并master或创建正式Release。
