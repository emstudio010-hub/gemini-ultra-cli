# Gemini Ultra CLI 非激活配置与删除恢复交接

日期：2026-11-13。WI-180 / E-413至414 / F-137。源码基线63f8ca9e3b839e6ed59b20280ab5dde23e53ae65，分支codex/ultra-agent-portable。上一goal turn为真实源码/Windows验证/同步进展，整体goal active。继续源码优先、Windows必要定向验证；本阶段无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 实际缺口和修复

先核对路由源码：UniversalContentGenerator.resolve已对缺失的明确供应商路由抛ProviderRouteError，生成前本地拒绝，不会因为删除provider自动发往其他端点。没有把这项既有保护重新宣称为新修复。

配置窗口此前只能在“切换激活供应商”列表改变focusedProvider，编辑另一供应商会先改变保存的激活选择并在关闭时影响会话。本阶段在主菜单增加←/→循环切换配置目标，只改React焦点、不保存、不激活、不请求目录；仍用原菜单编辑/删除目标。头部明确Configuration Target及“保存的默认”，展示保存的默认供应商而非误称本次临时模型。中英文提示解释左右键不会激活。打开不同目标的模型清单重置modelCursor，避免沿用另一份清单的越界光标；模型选择/保存规则保持。

/provider窗口关闭后核对当前Config模型，若它是无法解析的明确路由，立即显示双语恢复提示：/provider添加或/model重新选择，当前模型保留且没有请求。删除非默认供应商但它正是本次临时模型的路由时，不改默认供应商、不悄悄改当前模型；只是提示下一步。明确激活/use仍沿用原同步行为。未额外请求模型、目录或凭据。

Windows实际流程进一步发现关键Bug：删除该临时provider后，Composer通过contextUsage→tokenLimit→getModelContextWindow查询容量，私有resolve抛路由异常，React直接critical error退出，用户根本无法/model恢复。最终生成前的安全拒绝本身有效，崩溃发生在只读显示路径。

修复UniversalContentGenerator.getModelContextWindow只捕获ProviderRouteError并返回undefined，表示该明确路由的容量元数据未知，不调用fallback容量接口、不修改路由。其他异常继续抛出；generateContent/generateContentStream、countTokens及成员显式模型归属校验未放宽。tokenLimit沿用既有未知容量估计，不把这个估计宣称供应商实际容量或请求已授权。输入框/选择器能继续工作，生成发送前仍严格拒绝不存在的路由。

## E-413 必要源码检查

6个CLI相关场景通过：2个中英文完整Ink目标切换/非激活编辑/左右循环/关闭false，2个中英删除临时provider后的恢复提示/无保存无切换，以及前阶段2个临时模型保持/明确激活对照。最后仅调整头部“保存的默认”文案后重验2个受影响UI场景，未重复其他逻辑场景。

core capacity新增1场景在修前真实失败：删除provider后getModelContextWindow抛ProviderRouteError；修后该场景确认容量undefined、tokenLimit既有默认估计、fallback容量不被调用、普通/流式生成仍拒绝ProviderRouteError且fallback生成均0调用、配置字节保持。加3个既有容量保存/非法值/多层wrapper与动态编辑对照，core4通过。最终聚合10个不同相关检查通过。

core/CLI严格tsc编译、六文件最终eslint --max-warnings 0、prettier --check、git diff --check退出0。没有全量、冒烟或旧无关任务重跑。一次apply_patch因格式行不匹配未改文件，纠正后继续；不计作产品失败。

## E-414 Windows实际终端与修复发现

Windows Node v24.19.0实际编译CLI/ConPTY、Config、ProviderManager、真实配置文件与/model命令。独立home/workspace、假凭据、本地计数端点；observer只记录Config.initialize/setModel实际调用，不替换行为。

首轮已完成非激活编辑/删除相关步骤且0网络，但在删除Second关闭窗口时发生上述真实Composer容量崩溃。原terminal记录有“An unexpected critical error occurred: 模型供应商路由不可用”和getContextUsagePercentage/useComposerStatus栈。wrapper在等待恢复提示时到45秒观测上限，steps=10、timedOut=true、passed=false；不能把CLI fatal路径exitCode=0误称验收成功。before-capacity日志/结果/终端全文保持；这项实际证据推动core修复。

修复后13步完成：以second:shared临时路由启动、英文/provider右键聚焦Second而provider文件字节不变、保存Second输出4096且First未改/默认仍First、关闭仍保留临时Second；/language中文、/provider左键聚焦Second、确认只删除Second；关闭立刻出现双语恢复说明的中文版本，当前仍second且0隐式setModel；提交无害LOCAL_DELETED_ROUTE_PROBE，实际显示本地路由不可用且0HTTP；再/model first:shared显式恢复并正常/quit。

18条件true，17672ms，13步，真实CLI及验证器退出0，0模型/HTTP请求。settings字节保持，保存默认First/shared保持，唯一setModel为用户明确恢复first/shared；不是删除时自动路由。核对非激活编辑与目标提示的中英文由E-413覆盖，最终头部文字调整后仅重验相关渲染/编译，不重复整个原生流程。

ConPTY finally沿用上一阶段已知释放方式，console-list-agent对已退出console仍可能输出AttachConsole failed，最终log保留；不把helper诊断当成本次产品推理失败，也不宣称node-pty所有退出行为已修复。无残留本验证器/console-list进程。未验证AuthDialog真实登录、目录刷新、最后一家provider删除、真实模型推理、完整终端尺寸或最终平台包。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- provider-config-target-test.log/-junit.xml、-label-test.log/-label-junit.xml。
- provider-config-target-capacity-before-test.log/-capacity-before-junit.xml（1旧容量失败）；-capacity-test.log/-capacity-junit.xml（4相关通过）。
- provider-config-target-cli-compile.log、-final-cli-compile.log、-release-cli-compile.log、-core-compile.log；-release-lint.log、-release-format-check.log及前序格式/检查记录。
- verify-source-provider-config-target.mjs、source-provider-config-target-before-capacity.log/-before-capacity-result.json/-before-capacity-terminal-output.txt；source-provider-config-target.log/-result.json/-terminal-output.txt。
- check-provider-config-target-evidence.mjs、provider-config-target-evidence-summary.json；verify-provider-config-target-preservation.mjs、source-provider-config-target-preservation.json。

F-137 -> providers/universalContentGenerator.getModelContextWindow与CLI/provider配置流程：可选容量查询抛路由错误摧毁修复界面；改为容量未知、生成仍严格拒绝，配合非激活配置目标/即时恢复说明形成实际可恢复流程。保护范围是明确路由缺失，不改无前缀模型名解析策略，不承诺最后provider删除/原生认证自动切换或跨进程UI热重载。

## 保全与下一步

preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，安装preview.83；未改个人数据库、真实凭据、工具安装或PATH。E-294/E-364旧真实失败SHA及passed=false保持，不覆盖不付费重跑。本地流程通过不能代替复杂真实模型质量验收。

沿用granted case work/gemini-ultra-agent-20261110、PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描；UI沿用Ink/theme/此前baseline最小规范，无新依赖或动效。服务/终端退出后核对专用mkdtemp父目录/前缀清理。目标池与case四项更新，源码/工程/Obsidian三份全文SHA一致；显式提交本轮文件、skip ci推隔离codex分支，不合并master/Release。

继续完善模型配置空状态与Agent真实任务交付，最后供应商清空/显式选模和最终平台包仍需按范围收敛；整体goal active，继续源码→Windows必要检查→最后统一打包顺序。
