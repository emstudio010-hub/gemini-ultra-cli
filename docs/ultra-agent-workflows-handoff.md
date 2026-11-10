# Gemini Ultra CLI Teamwork / Boost / Grill me 交接

日期：2026-11-11。preview.30已安装；产品源码59476132c5952b9e821832b704743b2e6582c90a。Swarm在后续preview.31单独记录。

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

## E-117：首个分发失败与修复

原提交17a630fb3d7423be994db9b99603b60cf6696911的run42874678575已completed/failure，失败保留。Linux/macOS原日志显示已安装CLI启动时getAllToolNames的宿主为undefined。根因为workflowAuditor展开Generalist对象，提前求值了本应延迟访问的toolConfig
getter；Agent注册发生在ToolRegistry准备之前。修为显式复用静态配置并保留延迟getter。

新增唯一针对性回归：在工具注册表未就绪时创建审查员定义，随后实际解析只读工具。该用例及原四项状态机共5项通过；相关lint与core/cli类型构建通过。原两个CLI用例证据保留。首个CI失败不作为可安装成果；修订源提交的分发结果后补。

## E-118/119：preview.30最终交付

修订run42875429446三平台completed/success，三包源提交/版本/SHA/安装记录及六rg
hash和Unix权限核对通过。Windows
CI包SHA为4d5c944f8078afbfdac7d543eed4e98f1cdf6a1124bee2eb3a9066a58917771b；Linux
3d35557a7dd525ad727a659d437b92d6fa9a42cb6ce88fe1e918ac34eb774e34；macOS
3eba8068e52a1353aad8727168d28b6830ee29436165a106e968088548eeb552。

已有缓存offline全局安装7秒，双命令preview.30，424包内文件逐一匹配Windows
CI包。实际已安装CLI/native工作流/子执行器通过：12个loopback请求、1814ms、退出0，2研究+1实施+里程碑审查+整体审查共5阶段，文件实际读写、状态完成、seed保留；模型为fixture，没有付费调用。

首次辅助脚本误将审查员独立输出键verdict当作普通result，返回HTTP400并被产品如实保留为blocked；原false文件保留。改用正确键后原生流程完成，脚本又因Windows新文件使用CRLF而把语义正确的换行判失败。最终按单个LF/CRLF换行核对并记录实际字节616e737765723d34320d0a，所有检查通过。两次辅助脚本失败未改产品实现，均保留；不把它们包装成真实供应商故障或重复收费。

原始证据位于工程目录：agent-workflows-preview30-source-result.json、github-preview30-original-run.json、preview30-linux-original-job.log、preview30-macos-original-job.log、github-preview30-run.json、github-preview30-artifacts-result.json、global-install-github-preview30-full-result.json、installed-preview30-workflow-result.json；原始fixture和EOL失败另存。目标继续active，真实模型自主交付与引用可靠性未被fixture扩大验收。
