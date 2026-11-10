# Gemini Ultra CLI Swarm交接

日期：2026-11-11，preview.31候选；本机此刻已安装preview.30。用户追加“swarm也要”，与已有Teamwork/Boost/Grill
me合并维护。

## E-120 实现与范围

参照官方Swarm文档和本地内置插件的公开状态说明，独立实现具名成员、公开追加式board.jsonl、@精确提及唤醒、原生等待、成员暂停/移除、项目级持久化以及/swarm
board实时Ink看板。未复制Antigravity专有执行引擎或界面源码。UI采用现有主题、keypress和locale原语，文本净化终端控制符；刷新只读本地文件，不调用模型。

协调者通过manage_swarm添加researcher/coder/workflow-auditor成员、公开留言、等待、移除和完成。成员通过post_swarm_message发言；AsyncLocalStorage分配不可由工具参数修改的身份。成员不能通过该工具冒充协调者。等待成员没有模型定时器；只有新提及才排队调用AgentTool，后者遵循现有会话并发额度。

共享工作区的writer/verifier串行，使用与其他原生工作流一致的跨进程锁；研究可并行。未实现自动Git
worktree隔离或成员不同模型。验证必须结构化通过且对应当前revision；后续成员启动/结果都会使旧验证失效。暂停/排队/运行成员未处理时不可完成。20次唤醒/成员、12成员、10分钟/轮、500条/4MiB日志边界，不无限自动重试。移除的名称不能复活；取消保留日志，显式恢复不自动重跑成员。

## 定向检查

3项core用例通过：运行时身份公开发帖、精确提及与空闲不轮询；实际写入串行、修改后旧验证失效；非法验证暂停、成员移除不复活、取消保留留言与显式恢复。受影响lint/type构建通过，首次unused
React、ErrnoException不安全断言和switch default问题已修正。

新工具涉及真实异步执行、文件锁和跨平台路径，现有三平台打包作业增加唯一对应的已安装CLI
Swarm协议链验证，不重跑旧r2任务或付费模型。工件与实际结果待补；不能把fixture称为真实供应商、键盘/视觉或复杂逆向验收。

Evidence→Finding→Path：E-120原生成员/板/唤醒状态用例→区别于一次性子代理的可通信空闲成员→同项目可恢复Swarm执行与独立完成门控。正式包/安装与跨平台native链在后续证据补齐。

参考：https://antigravity.google/docs/swarm/
。持续目标active，仅同步codex分支，不合并master或正式发布Release。

## E-121 中文长报告恢复

合法中文成员结果（12成员，361,483字节）和阶段报告（80条，2,405,881字节）在修前实际存储读取器均因字节阈值被拒绝；字段字符数仍在各自Schema范围内。将Swarm状态读取上限从256KiB调整为2MiB、工作流记录从2MiB调整为8MiB，保留结构校验与总量边界。相同离线记录重新读取均成功，未调用模型。初次本地辅助脚本的Windows
ESM导入路径缺file URL，修正辅助脚本后取得修前/修后证据；不是产品导入错误。

原Swarm候选fdec206bc0da252ed93be78f69366e2544bb362d/run42878996969三平台completed/success，含新native
Swarm检查；尚未安装该候选。最终将使用包含字节上限修复的新提交构建工件，避免源码与安装不一致。原记录留存，不重启原运行。
