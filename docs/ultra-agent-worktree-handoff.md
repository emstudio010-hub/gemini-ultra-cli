# Gemini Ultra CLI 协作工作树交接

日期：2026-11-11。WI-069；候选 preview.39，本机当前仍为 preview.38。沿用 R26/code-audit、lead/cae/doc 及 work/gemini-ultra-agent-20261110/scope.md 的自有源码授权。

## 使用

Swarm、Boost 和 Teamwork 的原生协作成员现在可以使用任务级 Git 工作树：

```text
/swarm prepare 实现任务
/swarm workspace on
/swarm model coder 供应商ID:模型ID
/swarm resume
/swarm workspace status
/swarm workspace export
/swarm workspace apply
/swarm workspace remove
```

Boost 使用 `/boost prepare`
和同名 workspace 子命令。Teamwork 在原需求对齐/批准流程中启用
`/teamwork workspace on`，不跳过批准。on 必须在第一轮成员执行前；export/apply/remove 是本地命令，不产生模型请求。apply 要求原生独立审查完成且任务 completed；显式回写前，成员成果保留在隔离目录。export 可先保留未通过审查的成果补丁，不会将其标为通过。

前提是本机 Git 可用、当前目录为已有 HEAD 的仓库根目录。准备通过私有 GIT_INDEX_FILE 捕获实际工作文件，包括已跟踪文件的当前内容及非忽略未跟踪文件；保留原暂存区、HEAD 和用户文件。暂存与工作文件不同时，隔离快照取工作文件内容，不复制原仓库的暂存分层。Git-ignored 依赖、缓存及凭据不复制，需要时在隔离目录准备依赖。当前拒绝 submodule、穿越符号链接目录、超过64MiB的工作文件快照；不要在任务工作树自行提交或换 HEAD，否则须先手动保留/协调提交再导出。

## 实现与边界

每任务一份 detached
worktree，researcher/coder/auditor 共享它；writer/verifier 仍串行。这不是每成员独立分支或自动并行合并。调用内 AsyncLocalStorage 同时替换 Config 的 target/project/working 目录和 WorkspaceContext，实际内置文件工具及 shell
cwd 使用该目录；原项目 storage 与累计预算归属保持不变，不全局 process.chdir。

这是协作成员工作目录及内置路径范围隔离，不是 OS 安全沙箱。主会话仍属于原项目，shell 可显式访问其他路径，已有原生工具权限/红队 scope 不因此改变。

独立审查开始与结束比较 Git
tree；完成前再次检查同一审查成果，避免检查后改文件仍被接受。Swarm
finish 只使用当前有效、未被移除的 auditor 及当前 revision。任务记录保存 worktreeRequired，清单缺失时拒绝成员静默回落原目录。

回写先重新导出并核对 acceptedTree，再 git apply
--check，成功后整体 apply，不使用 --index、不部分套用。冲突保留补丁和隔离目录；原暂存区不变。清理只允许无新增成果或已回写且未再变更的工作树；先将已应用成果保存 detached
commit，再仅对该工作树调整 HEAD/index，git worktree
remove 不带 force。被忽略文件或额外变更可阻止清理，原补丁和清单保留，cleanupHead 支持清理拒绝后的重试。

```mermaid
flowchart LR
  A[原仓库工作文件及私有索引快照] --> B[任务隔离工作树]
  B --> C[成员文件操作与 shell]
  C --> D[独立审查前后 tree 一致]
  D --> E[导出二进制补丁与 hash]
  E --> F[用户本地 apply 检查并回写]
  F --> G[无强制清理且保留补丁]
```

## E-150 必要验证

- 24项相关core用例通过：worktree6、Swarm7、workflow11；类型构建退出0。覆盖真实Git暂存/未暂存/未跟踪快照、原index/HEAD逐字节不变、审查门控及变动拒绝、冲突不部分回写、回收、Config和实际子进程cwd、原生工作流及并行调用目录不串线。最后收尾审查者选择条件后，仅重查Swarm7项通过。
- 受影响文件严格lint、格式及diff检查通过；不做全量或冒烟，不调用真实模型。
- 源码bundle的真实CLI链退出0：prepare/on零模型，原生Swarm研究/实施/审查21个loopback请求，22254ms；coder实际shell写cwd、write_file交付，完成前原仓库无成果；本地export/apply/remove不增加请求。原index及用户staged/unstaged/untracked内容保持，补丁保留。此链在最后清理重试/缺清单防护补齐前执行，最终交由同源CI包核对，不重复同一源码链。

Evidence→Finding→Path：用户要求可分发的真实多Agent协作 → WI-069 →
E-150 成员实际目录隔离、独立审查封存、显式回写及无force清理。不是通过提示词换路径来声称隔离。

工程证据位于 C:\Users\Administrator\Documents\ChatGPT\gmncliu：agent-worktree-final.log及junit、agent-worktree-types-delivery.log、agent-worktree-delivery-lint.log、agent-worktree-verifier-final.log、agent-worktree-source-result.json及输出。日志中的预期 patch
does not apply 来自冲突拒绝用例。

## 接续目标池

F-041根因补齐：运行42908273604的Linux/macOS通过，Windows仍在根目录比较失败，说明仅大小写修正不足。生成仓库本地实证：cmd返回ULTRA-~2短路径，Git返回长路径；fs.realpathSync仍保留短名，fs.realpathSync.native才展开为同一目录。最终采用native解析+平台relative，准备时也保存规范source；CLI脚本同样规范shell目录。既有Windows快照用例改为真实8.3短路径并混合盘符输入。证据worktree-path-alias-probe.json、github-preview39-windows-path-failed.log、agent-worktree-native-path.log/junit及lint；旧失败保留，不无改动重跑。

首次最终CI运行42907564263：Linux全部通过；Windows在workspace
on的仓库身份比较失败，macOS工作树链仅原始shell
cwd字符串比较为false，其余检查通过。F-041修复真实路径比较：resolve
realpath后用平台path.relative规则处理Windows盘符/目录大小写；验证脚本在清理前记录规范目录与实际shell目录，避免macOS
/var与/private/var别名误判。Windows混合盘符大小写并入既有快照用例；只重查受影响工作树6项和lint，其他原通过用例不重复。首个失败原日志保留github-preview39-failed.log；不得将失败运行当交付。

收尾复核 F-040：实际临时 Git 仓库中，原生 `git worktree remove`
无 force 仍删除 ignored 文件，退出0。产品已在清理前显式列出 ignored 未跟踪文件并拒绝自动清理，保留内容和 HEAD；用户自行保留/清除后可重试。原三平台运行42906998485因此取消，不将其当最终交付。新增保护并入现有工作树用例及同一21请求CLI链，无新增付费调用；证据 worktree-ignored-cleanup-probe.json、agent-worktree-ignore.log/junit、agent-worktree-ignore-lint.log。

WI-069 本地实现完成，preview.39 待三平台工件及安装核对；本机仍preview.38。WI-054真实供应商完整自主交付/引用准确性、WI-056复杂反编译仍未完成；E-124的真实任务失败保留，不自动重复同一付费任务。整体goal
active，仅codex分支，不合并master、不正式Release。

后续顺序：完成本候选分发与安装交接；继续复杂逆向能力及可执行交付约束；维护报告和剩余上线边界。用户已授权持续推进，不以阶段菜单重复请求许可。
