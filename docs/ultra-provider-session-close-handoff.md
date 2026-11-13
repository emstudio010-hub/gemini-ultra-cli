# Gemini Ultra CLI 供应商窗口临时模型保留交接

日期：2026-11-13。WI-179 / E-411至412 / F-136。源码基线b0679bddd9df835549e759d7ddee3ad7bf3b6652，分支codex/ultra-agent-portable；上一goal turn为真实源码/Windows证据/同步进展，整体goal active。继续源码完善、Windows必要定向验证；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 问题与源码行为

检查模型配置流程发现，/model或启动-m选择的临时模型与供应商保存的默认选择本来独立，但/provider打开配置窗口后不作选择直接退出，providerCommand.onClose仍无条件syncSession，调用Config.setModel(保存的provider:model)，覆盖本次会话的临时选择。仅查看参数、修改输出上限或切换语言都可能触发不期望的模型切换。

ProviderConfigDialog记录打开时的保存选择(providerId/model)，另记录明确激活意图。关闭时传activateSelection布尔值：明确选中供应商（即使选择与保存默认相同）或创建并激活新供应商，或最终保存选择相对打开时变化，才请求同步会话。查看后Esc/菜单退出、仅改其他参数而保存选择不变，则false。删除保存的默认模型导致默认切换仍被识别。

providerCommand只在该布尔值为true时沿用syncSession；false仍刷新可用命令/关闭窗口，保留Config的临时模型。直接/provider use及add同步行为保持。AuthDialog的初始化用法忽略此可选参数，仍在关闭后按原认证流程处理，不将会话编辑语义套到首次认证。不增加确认、模型目录请求或新的网络开销。

涉及CLI providerCommand.ts/ProviderConfigDialog.tsx及相应两测试文件。核心ProviderManager/Config、保存格式、默认模型持久化和个人设置均未改。窗口内原有保存/冲突行为保持；本阶段不解决最后一个供应商被删除后当前已限定路由的恢复，亦不宣称所有跨进程编辑冲突已覆盖。

## E-411 定向与编译证据

新增命令夹具最初缺context.ui.removeComponent，导致首旧检查与首修后2项失败止于夹具错误，原记录保留，不能当作旧产品缺陷已复现。补上这个现有关闭动作的mock后，受控脚本从git读取精确b0679bd的providerCommand源码，只在没有其他源码检查在运行时暂替该单文件，运行新增no-op-close场景；finally恢复当前源字节并断言一致。旧源码实际1失败：setModel被调用first:shared-model，预期临时second:session-only保持。复现脚本退出0表示成功验证预期失败及源码恢复，不表示旧用例通过。

最终聚合9个不同相关检查通过：5个实际Ink窗口场景（Esc、菜单退出、改输出上限、明确重选同供应商、移除默认模型）；2个新命令关闭语义场景；2个既有显式use/保存失败对照。首修后已通过的7项不重跑，仅重验修好fixture的两个命令场景。CLI严格tsc编译、四文件eslint --max-warnings 0、prettier --check、git diff --check退出0。core无改动，不重复core编译/全量/冒烟。

E-411证明关闭意图从窗口传到命令边界，明确激活能覆盖临时模型，无动作/参数编辑不会覆盖；并非单测只比较一个if的镜像。

## E-412 Windows真实终端

Node v24.19.0编译源码CLI ConPTY，真实Config/ProviderManager/文件保存及观察wrapper。wrapper只观察initialize/setModel实际调用，不替换行为。独立home/workspace，fake provider/key、空fixture .gemini/.env阻断祖先环境，loopback端点仅计数且没有请求。

11步实际终端操作：以second:shared临时路由启动、打开/provider→Esc后保持临时路由且provider文件字节不改；打开/provider明确选中保存的first，即使保存选择未变也在关闭时真正切到first；/model再临时选second；/provider修改first输出上限2048→Esc，保存参数但当前second保持；/language中文→/provider查看退出仍保持；重新/model窗口可见second模型，最后正常/quit。

最终13条件全部true，17313ms，实际CLI退出0，验证器退出0，0模型/HTTP请求；原settings字节保持，provider保存选择仍first/shared，观察到的唯一两次setModel分别是用户明确激活first、用户/model选second。没有把打开窗口/参数编辑计作新的模型切换。

验证器首轮13条件中只launch观测为false，UI输入框先于initialize wrapper落盘，操作链本身都通过；first日志/结果/终端记录保持。将启动观测移到第一个/provider窗口已打开后，按真实initialize事件核对，第二轮行为全部true但已退出CLI的ConPTY辅助句柄残留，验证器未退出，不能算完整成功。确认精确node命令/ConPTY子进程父PID后仅终止本验证器helper及node，session退出-1；before-cleanup结果/日志/终端记录和cleanup身份记录保持，不宣称自然退出。

验证器finally改为CLI已退出也调用PTY kill释放句柄，第三轮同一流程最终退出0。收尾node-pty的conpty_console_list_agent对已退出console发出AttachConsole failed，保留在最终log，未改产品抑制它；没有残留本验证器或console-list-agent进程。该helper诊断不是实际CLI操作失败，也不能据此说ConPTY库所有退出资源已无问题。产品未因验证器问题增加任何改动，未重跑外部/付费任务。

本次不是AuthDialog真实登录、目录刷新、最后供应商删除、模型推理质量、安装包或跨平台验收。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- provider-session-close-before-test.log/-before-junit.xml（首fixture关闭回调缺失，不算产品复现）。
- check-provider-close-old-source.mjs、provider-session-close-old-source-test.log/-old-source-junit.xml（修fixture后旧产品1真实失败，当前源码精确恢复）。
- provider-session-close-test.log/-junit.xml（首7过2fixture失败）、-final-test.log/-final-junit.xml（2修fixture后过）；check-provider-session-close-evidence.mjs、provider-session-close-evidence-summary.json（最终9不同通过）。
- provider-session-close-cli-compile.log、-final-cli-compile.log、-lint.log、-final-lint.log、-format.log、-format-check.log。
- verify-source-provider-session-close.mjs；source-provider-session-close-first.log/-first-result.json/-first-terminal-output.txt；-before-cleanup.log/-before-cleanup-result.json/-before-cleanup-terminal-output.txt；-cleanup.json；.log/-result.json/-terminal-output.txt。
- 观察器沿用observe-source-model-selection.mjs，未改它或全局CLI；verify-provider-session-close-preservation.mjs、source-provider-session-close-preservation.json。

F-136 -> CLI providerCommand.onClose：无条件同步保存默认模型，导致/provider no-op-close覆盖/model临时路由。窗口关闭意图/选择变化明确传递修复此路径；保存设置与当前模型保持各自的语义。仍需持续审查删除/无供应商时的会话恢复，不扩大本阶段证明范围。

## 保全、同步与下一步

最终preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，安装仍preview.83；未改个人数据库、真实凭据、工具安装或PATH。E-294/E-364旧真实失败SHA与passed=false保持，不覆盖、不付费重跑；本轮本地验证不是复杂真实模型质量已通过。

沿用granted case work/gemini-ultra-agent-20261110/PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理；UI继续既有Ink组件与此前baseline规范，不加动效/依赖。结束服务与fixture终端后核对mkdtemp父目录/前缀清理。更新目标池和case四项，源码/工程/Obsidian三份报告全文SHA一致；显式提交本轮文件、skip ci推隔离codex分支，不合并master/Release。

下一步继续模型配置使用流程，重点核对当前限定模型所属供应商被删除或清空后的明确恢复行为；整体真实Agent质量与最终平台包未完成，goal active。
