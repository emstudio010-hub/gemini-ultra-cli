# Gemini Ultra CLI Teamwork 准备与里程碑交付交接

日期：2026-11-11。WI-079/E-176至178，preview.47 已安装。沿用自有源码范围，不改个人供应商配置、数据库或逆向工具，不调用付费模型。Swarm 继续保留在目标池，既有真实代码交付不重复运行。

## 产品修复

Teamwork 增加 prepare 子命令，零模型创建任务并进入只读计划模式。用户可先配置各角色模型、累计预算和任务级隔离工作树，再 resume 对齐需求并保存草案。resume 不批准执行；只有显式 approve 才调用原生里程碑链。进入前的权限模式保存在任务中，原有取消和批准恢复逻辑保持。

草案工具在改写任何字段前检查独立预算账本的活进程拥有者，拒绝另一 CLI 改写正在被持有的草案。新增回归用例先在旧代码复现失败，再证明拒绝后原记录及账本字节不变；当前拥有者仍可存草案，不能自行批准或清零预算。

## 必要验证

2 项草案工具用例、8 项命令用例及相关严格 lint/type 通过。源码原生 CLI 使用隔离 profile 和 loopback 模型，真实 prepare/model/budget/workspace
→ read_file → draft → approve → 两里程碑 → 整体独立审查 →
export/apply/reports 全链通过，20 次本地协议请求，其中批准前 3 次需求对齐、离线准备 0 次。7 份阶段报告，各角色独立路由，两个里程碑各实施 1 次，失败阶段 0。无外层超时，命令均自然退出 0。

显式 apply 前原目录无实现文件；回写后成果字节与工作树一致，原 HEAD、index、用户 staged/unstaged/untracked 内容及供应商文件 hash 保持。本地报告导出不增加模型请求。Windows
write_file 按原行为生成 CRLF，验证按逻辑行检查内容并逐字节核对回写，不把平台换行差异当产品故障。

初轮源码 bundle 残留旧 plan.toml，缺草案工具；同步源码策略后，检查又错误假设计划模式完全不暴露 write_file。已改为验证 ONLY
FOR
PLANS 限定并检查实现工件只在批准后出现。旧失败记录保留。正式打包流程一直从源码复制策略，未将源码资产陈旧误报为分发包缺陷。成功源码报告的 version 取仓库 package.json，显示上游 nightly 元数据，不冒充安装包版本；最终包身份另行核对。

工程证据目录：C:\Users\Administrator\Documents\ChatGPT\gmncliu。主要记录 teamwork-draft-owner-before.log、teamwork-draft-owner-junit.xml、teamwork-prepare-junit.xml、teamwork-cycle-lint.log、teamwork-cycle-types.log、teamwork-cycle-source.json 及完整 output.txt。源码过期资产、计划工具假设和换行失败记录保留。临时自建 Git 仓库和有改动的工作树保留，未强制删除。

## 分发与目标边界

E-177：产品源 `77546b3cdb6914729b6db82d6302f35d3c7ef6d8`，
[run 43018021899](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/43018021899)
三平台 completed/success，版本、源码、包及入口 SHA、安装、六份原生搜索二进制的 hash/权限核对通过。每个平台实际安装包的 Teamwork 完整链均为 20 次 loopback 请求、批准前 3 次、7 报告、两个里程碑各实施 1 次、失败 0，11 条 CLI 命令全部退出 0，所有 checks 为真。既有 Swarm、模型 Session、预算恢复、任务工作树、长报告、卡片期限及原生 Ghidra 链同源通过。

E-178：Windows 包 SHA
`010f1ed8f08bc25d25dff9471dda162aec9fe3c4072e6b7e6635a323d556330a`，入口 SHA
`30eff066152bd49b8808aa471360674f71e8219398142b71cfe6fc7e2d16d47f`。offline 已有缓存安装 7252ms、退出 0，双命令 preview.47，425 个文件与 CI 包逐字节匹配。旧包保留。没有重复本机业务链、启动微基准或付费任务。只推送 codex/ultra-agent-portable，不合并 master 或正式 Release。

最终工程证据：github-preview47-run.json、github-preview47-artifacts-result.json、github-run-43018021899/、global-preview47-install-result.json、global-install-github-preview47-full-result.json。源码、工程和 Obsidian 同份交接一致；安装后的文档提交只更新交接与目标池，不重建产品包。

这是原生工具与状态完整链的受控模型证据，不能代替真实 Teamwork 长任务的模型自主交付质量。既有真实 Boost/Swarm 交付证据保留，更多模型、长会话摘要准确性、复杂逆向与其他电脑交互继续列为未完成。goal
active，目标池持续维护。
