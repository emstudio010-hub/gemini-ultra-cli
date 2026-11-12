# Gemini Ultra CLI 源码优先与 Windows 受阻交接修复

日期：2026-11-12。WI-121/E-298至299/F-081。goal
active。用户明确调整：先完善源码和Windows必要验证，功能收敛后才统一最终Windows/macOS/Linux包；停止每小改动打包、全局重装和三平台CI。本阶段严格遵循，当前全局安装仍preview.83。

## 已复现的产品问题

E-294真实Swarm审核拒绝后，下一次模型调度在本地预算边界被阻止，却进入Turn通用API错误报告：stderr显示Error
when talking to Gemini
API并生成错误报告，最终JSON只有预算stopReason，没有保留审核摘要和状态位置。预算保护本身正确，交接与错误归因不正确。不重跑该付费任务。

新增3项定向源码复现均在旧实现失败。现在预算边界抛轻量SwarmBudgetError，在本地生成有界交接：当前语言标题、任务ID、原stopReason、members.json/board.jsonl、已保存复核的passed/failed与摘要、前5条证据引用及已归档成员全文路径。判决不可读或格式异常时显示保留状态提示，不伪造结论；报告原文视为保存证据，不授予权限。摘要最多2000字符、每条引用500字符。读取不写回任务、不重置预算、不增加模型调用。

Turn单独处理此本地类型，仍输出错误事件与非成功退出，但不创建供应商故障报告或添加API
schema诊断。真实供应商错误继续使用既有报告路径。通过的已保存复核明确标注“不代表任务完成”，不会放宽完成条件。未改额度、恢复、成员调度或现有结果文件。

## Windows 源码证据

E-298：3新增场景修前失败；修后2个预算交接场景、1个Turn本地类型场景、1个普通API错误对照、6个相关协议适配器预算边界检查，共10项通过。strict
core typecheck与修改文件eslint退出0。没有全量/冒烟或无关测试。

E-299：仅编译core源码，在Windows用既有CLI
dist入口加载新core，独立profile预置当前进程拥有的受阻任务及拒绝判决，loopback请求计数。实际退出1、9787ms、无超时，错误JSON位于stderr，含本地受阻/ID/复核摘要/报告路径/members与board；不输出API故障报告，0供应商请求，任务及报告字节保持。首次夹具漏storage.initialize，启动前失败；第二次观察器只读stdout而未读错误JSON的stderr，实际产品内容已正确；补观察器后通过，原两次日志保留，未因此修改产品。

本次不是重新运行真实E-294，也不是新安装包、全局安装或跨平台验收。没有付费模型调用。个人locale/provider哈希保持83末值，ultra-tools.json仍不存在，个人数据库/工具/PATH未改。源码编译产物与全局安装分开，版本号与package脚本未更新。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：swarm-handoff-before-junit.xml/-before.log、swarm-handoff-junit.xml/-log、swarm-handoff-types.log、swarm-handoff-lint.log、swarm-handoff-source-build.log、source-swarm-handoff-result.json/-output.txt/-log、source-swarm-handoff-first.log/-first-output.txt、source-swarm-handoff-second-result.json/-second.log/-second-output.txt。seed-source-swarm-handoff.mjs和verify-source-swarm-handoff.mjs为独立验证脚本，不随产品安装。

## 接续原则

1. 继续源码功能与实际缺陷维护，以Windows必要定向检查为主。不要为了每次修改发新预览包、重装CLI或跑多平台CI。
2. 围绕完整功能清单收敛：启动和取消、双语唯一强度、配置便利性、Teamwork/Boost/Grill
   me/Swarm交付与恢复、演练台交互、原生红队/逆向。已有未受影响证据复用，真实失败如实保留，模型自报成功不替代工件核对。
3. 当前安装83可使用；本次修复只在源码编译入口。源码功能与Windows验收收敛后，统一最终Windows包及macOS/Linux打包和平台相关检查。跨平台旧证据保留为基线，不声称最终验收。

源码报告/工程报告/Obsidian全文同步；隔离分支同步带skip
ci，不合并master或正式Release。整体goal active。
