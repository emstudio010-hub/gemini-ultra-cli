# Gemini Ultra CLI Teamwork / Boost / Grill me 交接

日期：2026-11-11。preview.30 候选；本机安装此刻仍为preview.29，构建及安装结果随后补充。

## 实现

E-116：参照公开的Antigravity Teamwork、Boost、Grill
me文档，独立实现三个CLI入口。已有/team继续管理会话并发；新入口复用同一AgentTool、权限和全局子代理调度器，不依赖作者机器或Google的付费编排服务。

- Teamwork：只读访谈→保存brief/里程碑验收条件→用户/approve→原生逐里程碑执行。模型draft工具不能自行批准。
- Boost：原生执行器并行两条只读假设调查，串行coder与结构化只读auditor，失败最多修正两轮，最后整体独立审查。不接受普通“完成”文本作为审查通过。
- Grill
  me：读代码、ask_user逐题提问、推荐优先、保存约定；finish恢复原权限并交给主Agent继续。无参数可从当前工作区目标开始。当前访谈过程中的普通对话回答仍由会话历史保存，跨新会话恢复以已保存brief为准。

项目临时目录保存带ID的JSON记录，原子替换与结构校验。工作区文件锁串行同项目原生workflow的实施，调查上下文分离，写入不并行；没有自动Git
worktree隔离。status/cancel可在繁忙时处理；取消等待已发起子任务结束才释放锁。blocked需要用户显式resume；已完成里程碑跳过，20分钟单次上限保留进度。主会话返回近期摘要与原始记录路径，避免报告撑满上下文。

## 必要证据

- 四个原生状态机定向用例通过：未批准拒绝、修正后审查与整体审查、无结构/无证据审查拒绝、并发锁与取消清理/显式恢复。
- 两个命令定向用例通过：Teamwork只读→草案批准→native执行；访谈取消恢复权限以及Boost直接入口。
- 受影响文件严格lint与core/cli类型构建通过。初次类型检查指出缺getDescription与继承的processOutput泛型不匹配，已修正；首次vitest命令root与config路径重复，未执行测试，改在package目录执行后通过。未运行全量/冒烟，没有新增真实模型调用。
- E-116→原生状态机/命令入口→独立审查门控与可恢复推进；还需已安装CLI实际协议链证明注册和结构化结果接线。

## 范围与接续

上述用例验证编排与状态语义，子Agent响应为受控fixture，不宣称真实模型自主能力或复杂逆向验收。后续核对preview.30包与实际已安装native工作流；真实供应商、复杂任务与引用可靠性仍独立保留在目标池。仅codex分支、不合并master或正式Release。

参考：https://antigravity.google/docs/teamwork/
、https://antigravity.google/docs/boost/
、https://antigravity.google/docs/commands/grill-me/
。源码和提示词为本项目实现。
