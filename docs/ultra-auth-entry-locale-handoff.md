# Gemini Ultra CLI 认证入口收敛与双语等待交接

日期：2026-11-13。WI-173 / E-399至400 / F-130。源码基线6e26c7d6ea7a06c029d0a6bbb7e2ecaec33151b4，分支codex/ultra-agent-portable，整体goal active。保持源码优先、Windows必要定向验证、最后统一Windows/macOS/Linux打包；本轮未打包、重装、升版本、多平台CI或重跑付费任务，全局preview.83保持。

## 改动与证据链

全仓库packages引用核对确认，AppContainer暴露的legacy handleAuthSelect没有实际调用方。实际选择由AuthDialog自己的onSelect进入useAuth，手工密钥由共享owner处理。删除未使用的旧handler、UIActions字段、测试默认stub和专用导入，移除另一套无signal的清凭据/直接refreshAuth/重启代码。保留实际AuthDialog入口及AppContainer其他restart用途。没有把无调用死代码宣称成已经触发的线上故障，也不声称清理带来可量化启动提速。

ApiAuthDialog、AuthInProgress接入useLocale；输入标题、获取密钥说明、占位文字、快捷键、等待和超时状态按当前模式显示，DialogManager取消提示也双语。AuthDialog补齐Cloud Shell/元数据凭据标签、首次无方式提示、重启提示和条款说明。英文原文本保持，品牌/URL不翻译。仅文案响应语言，不重建buffer或重启认证。

AuthInProgress原三分钟timer effect依赖onTimeout；DialogManager每次渲染创建新回调，语言/状态更新可重新计时。现在timer只在本次等待窗口挂载时建立，单独ref跟踪最新回调；期限到达调用最新owner，卸载仍清timer，Esc/Ctrl+C继续即时取消。不是移除原期限或增加重试。

UI工作使用ui-skills-root，经现有ui-skills CLI选择最小dxe-interface-affordances上下文，遵循可见快捷键与实际动作一致；没有安装新依赖、改变布局或添加装饰动画。

E-399：10个不同相关场景最终通过，含3个新增双语切换场景、5个已有等待/取消/超时/卸载对照、1个原英文API表单快照和1个App提交/清除接线对照。新API表单场景英→中→英保留已输入内容；选择窗口核对Cloud Shell标签/中文首次选择提示；timer场景在90秒切换语言并换新onTimeout，再过90秒仍按原期限触发新回调一次，旧回调不触发，之后切英文不重复。三分钟使用fake timers，不冒称真实挂钟等待。

首批两个新增用例在重绘前读终端画面失败，补waitUntilReady；下一批选择标签断言受mock水平布局换行影响，改核对实际items标签和独立终端条款文本，未改产品布局。对应首失败日志保留。API表单原英文快照通过、未更新任何快照。timer源码后续变更后单独6项重验通过，其余无改动场景不重复整套；check-auth-entry-locale-evidence.mjs按classname/name聚合并采用后续修正结果，共10项无剩余失败。

CLI严格源码编译、10文件eslint（0warning）、prettier --check与git diff --check均退出0。core本轮未改，不重复core编译；全仓库引用搜索确认无UIActions.handleAuthSelect消费，剩余同名仅AuthDialog本地回调/测试变量。不为删除死代码添加镜像测试，未跑全量/冒烟。

复现：packages/cli下npx vitest run src/ui/auth/AuthInProgress.test.tsx --coverage.enabled=false；另按日志中的-t筛选ApiAuthDialog/AuthDialog语言与原英文快照、AppContainer接线；仓库根npx tsc -p packages/cli/tsconfig.json。

E-400：Windows Node v24.19.0实际源码CLI/ConPTY，真实/language、AuthDialog、ApiAuthDialog、AuthInProgress、DialogManager、useAuth和Config。第三次认证的元数据backend查找适配到真实CodeAssistServer/requestPost并送loopback；API-key服务HybridTokenStorage使用进程内假凭据，不接触OS凭据库。

15步实际操作：启动 → /language 中文 → /auth中文选择 → Esc开始gateway认证 → 中文等待含取消键 → 等真实quota挂起后Esc → 中文取消/选择返回，core拒绝及HTTP关闭 → 强制resize仍为选择 → 清除取消消息并Esc重试原gateway → /auth选择API key → 中文表单输入假密钥并提交 → /language English → /auth英文选择及英文key表单 → 再提交 → /stats session → /quit。序列中的合并步骤由验证器step编号固定，报告不把每个物理按键当独立step。

最终30条件通过，18372ms，CLI/验证器退出0；2个本地元数据HTTP、0模型生成/外部fetch。quota实际取消连接关闭，本机单次68ms，未等10秒超时；总6次认证（启动两段、被取消一次、显式gateway重试一次、两次原生key），两次假key保存及真实Config初始化均成功。中文等待/取消、key表单、条款和英文返回均实际可见。原生timer源码变更前已有一次通过（16875ms/77ms），修改timer后才重编译并验证最终版本，两份记录保留；没有无修改重复跑任务。

临时provider记录保持，只有显式选原生方式清除active选择；临时settings只有selectedType显式变化，语言最终en。个人provider/locale等另做精确保全。转录可含FAKE_LOCALE_KEY，不含真实密钥或假网关凭据。此次不验证真实Google登录/密钥有效性。

F-130 → Path：auth等待effect以不稳定callback为依赖会续期，auth表单/等待/取消与部分选择说明固定英文。只挂载一次timer+最新回调ref、useLocale与取消提示翻译修复；AppContainer重复未使用handler删除防止再次暴露另一条登录实现。未完成所有底层异常、BannedAccount或LoginRestart等认证相关文本翻译，不能称全认证区域无英文。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
auth-entry-locale-test.log/-junit.xml、-final-test.log/-final-junit.xml、-release-test.log/-release-junit.xml、-timer-test.log/-timer-junit.xml；
auth-entry-locale-compile.log/-final-compile.log、-lint.log/-final-lint.log、-format.log/-test-format.log/-final-format-fix.log/-final-format.log；
prepare-auth-entry-locale-verifier.mjs、observe-source-auth-entry-locale.mjs、verify-source-auth-entry-locale.mjs；
source-auth-entry-locale-before-timer-result.json/.log/-terminal-output.txt、source-auth-entry-locale-result.json/.log/-terminal-output.txt；
check-auth-entry-locale-evidence.mjs、auth-entry-locale-evidence-summary.json；
verify-auth-entry-locale-preservation.mjs、source-auth-entry-locale-preservation.json。

保全passed=true：个人provider/locale/config/skill-tags.json精确SHA、旧E-294/E-364两个真实Swarm失败文件SHA及passed=false保持；ultra-tools.json不存在、全局1.0.0-preview.83。未改个人配置、数据库、真实凭据、工具安装或PATH，未重跑付费任务。独立profile/workspace关闭后核对mkdtemp绝对父目录/前缀再清理。

沿用granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。维护目标池/workitems/timeline/field-journal，源码/工程/Obsidian全文SHA一致；显式提交本轮文件并推隔离codex分支、skip ci，不合并master、不Release。

等待期限mock验证与原生Esc传输取消各有明确边界；没有真实三分钟挂钟、Google账户、OSCredential Manager或最终跨平台包验收。内部UIActions不再提供未使用handleAuthSelect，不承诺该源码内部类型可作为第三方稳定API。接续回到目标池中实际Agent任务质量、残留固定语言与启动/加载等待问题，避免继续为无调用兼容路径扩张实现。复杂真实Swarm的E-294/E-364仍失败，完整Agent上线目标保持active。
