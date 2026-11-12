# Gemini Ultra CLI 三工作流本地受阻交接

日期：2026-11-12。WI-122/E-300至301/F-082。goal
active。继续源码优先、Windows必要定向验证；本阶段没有打包、全局重装、版本变更或三平台CI。全局安装仍preview.83，最新源码与安装版本分列。

## 实际缺口与修复

上一阶段修复Swarm的本地预算异常后，Teamwork/Boost/Grill
me的workflowBudget仍在额度耗尽或已暂停时抛普通Error，Turn会当供应商API故障报告。5项新增复现均在旧实现失败：三个模式的额度边界、已有暂停的中文交接及Turn本地工作流类型。

现在使用轻量WorkflowBudgetError，当前语言标题标记本地受阻，包含模式/任务ID、原stopReason、已保存任务记录与累计预算文件位置，以及对应模式status/reports命令。首轮耗尽仍按原逻辑落盘paused并中断运行成员；后续暂停检查只读、不重写原因或预算。暂停状态、审批、累计用量与报告保持。损坏/未知用量和closed取消等原拒绝路径保持，未把它们包装成预算耗尽。

Turn对SwarmBudgetError和WorkflowBudgetError输出本地错误事件，不创建供应商API故障报告、不加入API
schema诊断，实际API故障仍走原错误报告。错误退出保持，不把受阻伪装成完成，不增加模型调度或自动恢复。这里没有把旧暂停原因翻译成另一语言，只有新界面标签随当前语言；没有读取/改写既有报告正文。

## Windows 定向证据

E-300：旧5项复现失败；修后4个工作流预算交接场景、工作流Turn分支、原Swarm分支、普通API错误对照，共7项通过。strict
core
typecheck和修改文件eslint退出0。仅执行受影响场景，未跑全量/冒烟或原生逆向测试。

E-301：使用tsc编译core源码，复用未修改的CLI
dist入口，在Windows独立home/workspace预置当前进程拥有的暂停Teamwork预算。实际退出1、9900ms、无超时，stderr错误JSON含本地受阻、任务ID、任务记录/预算路径、对应status/reports命令；没有API故障报告，loopback端点收到0请求，任务记录/预算/报告字节保持。该入口检查覆盖共享路径的Teamwork代表；Boost和Grill
me由上述实际核心接口定向检查覆盖，不冒称三种模式都另跑终端。

没有付费调用，不重复E-294等真实协作或上一阶段Swarm终端检查。源码编译未重打安装包；个人locale/provider哈希保持83末值，ultra-tools.json仍不存在，个人数据库、逆向工具和PATH未改。运行时与平台最终验收留待功能收敛后的Windows交付及最终跨平台分发。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：workflow-handoff-before-junit.xml/-before.log、workflow-handoff-junit.xml/-log、workflow-handoff-types.log、workflow-handoff-lint.log、workflow-handoff-source-compile.log、source-workflow-handoff-result.json/-output.txt/-log。seed-source-workflow-handoff.mjs、prepare-source-workflow-handoff-verifier.mjs和verify-source-workflow-handoff.mjs为隔离验证脚本，不随安装分发。

源码报告/工程报告/Obsidian全文同步。沿用既有scope的本地源码逻辑审查，lead/cae/doc由当前会话承担。隔离分支提交带skip
ci，不合并master或正式Release，goal
active。后续继续围绕源码功能入口与恢复闭环收敛，不能用局部预算路径通过替代全部功能完成。
