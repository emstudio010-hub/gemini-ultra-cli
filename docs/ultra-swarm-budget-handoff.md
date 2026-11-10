# Gemini Ultra CLI Swarm 原生预算交接

日期：2026-11-11。本机双命令已安装 preview.33，产品源提交
`8ede6b1e45c5749f622f17c3ac56867c3b9160a4`。

## E-128 / F-034：提示词没有执行预算

E-124 真实任务中作者进入第三轮，超过约定的一轮修正；观察者主动停止，任务没有交付。仅保留具体错误（E-125/127）不能阻止协调者再次唤醒。此阶段将限制落到运行时，不重复同一付费任务。

Swarm 默认累计限制：120 次模型调度、2 次失败轮次、40 次成员唤醒；原有每成员 20 轮及每轮 10 分钟上限保留。失败轮次包括执行失败和未通过的独立审查；2 次失败不是允许重试 2 次。所有成员共用额度，改名、移除、取消或恢复不清零。旧记录迁移已有成员轮数和仍保留的失败状态；历史模型调用总数不可还原，不伪造旧用量。

`UniversalContentGenerator`
在交给外部协议或原生 fallback 之前预留模型调度次数，同一拥有进程的主 Agent、子成员、压缩等辅助生成共用额度；成员上下文通过运行时身份传递。应用层重新调用也再次计数。此数字是保守的调度上限，**不是 Token、费用或供应商 SDK 内部 HTTP 重试总数**；取消的惰性流也可能已经预留额度。其他独立 CLI 进程不使用本任务额度，显式恢复会先接管已退出的旧拥有进程。

触限保持 `blocked` 和成员
`paused`，中止其他已发起成员、禁止新生成及完成。最后一次合法生成可正常完成；只有再申请超额调度时才阻断。默认失败额度耗尽立即受阻。请求/总轮数上限不替代已有的当前独立 verdict 完成门控。

用户本地命令 `/swarm budget 160 3 50`
修改累计上限；不会调用模型，不提供给模型的工具。`/swarm status` 与 `board`
显示计数及原因。提高已耗尽额度后
`/swarm resume`；恢复不自动唤醒失败成员，继续需要明确提及。`/swarm cancel`
释放本会话的生成限制并保留原记录；再次恢复旧任务仍检查已花额度。数字输入与上限严格校验。

```mermaid
flowchart LR
  A[主或成员申请模型调度] --> B{累计额度仍可用}
  B -->|是| C[持久化预留后进入供应商]
  B -->|否| D[blocked 并中止成员]
  D --> E[保存原因与公开板]
  E --> F[用户调整预算并恢复]
  F --> B
```

## 定向验证

- 17 个 core 用例通过：其中原 Swarm/错误交接 6 项，新预算相关 11 项；覆盖跨成员失败额度、旧记录迁移、累计唤醒、同伴取消、成员运行时身份、六条外部协议流/非流路径、主会话与辅助 fallback 共用额度、超额错误不可重试及取消后普通生成恢复。
- 2 个 CLI 用例通过：本地数字命令/拒绝非法输入，以及已有看板渲染、刷新、控制符剥离和 Esc。
- 受影响严格 lint、core/CLI 类型构建通过。仅必要检查，没有全量/冒烟或新付费模型请求。
- 源码 bundle 实际执行原生成员及模拟输出上限：总 3 个 loopback 请求，其中第 1 个用于创建隔离状态，后 2 个计入任务预算；下一次生成在供应商之前被拒绝。CLI 自行退出 1，任务 blocked、作者 paused/1 轮、具体输出上限诊断保留，无工件、无伪造完成。辅助脚本退出 0 表示这些失败边界符合预期，不能称任务交付成功。

工程目录证据：`swarm-budget-core.log`、`swarm-budget-core-junit.xml`、`swarm-budget-cli.log`、`swarm-budget-cli-junit.xml`、`swarm-budget-types.log`、`swarm-budget-lint.log`、`swarm-budget-source-result.json`
及输出。源码 bundle 结果不代替最终 CI 包和全局安装身份核对。

Evidence→Finding→Path：E-124 越过自然语言修正约定 →
F-034 仅每名字硬限额且缺任务累计预算 →
E-128 持久化累计额度、共享生成入口、blocked/中止及本地恢复命令。

## 接续边界

此阶段实现 Swarm 任务级限额。Teamwork/Boost 仍沿用原生每里程碑两轮实施审查及 20 分钟限制，尚没有独立任务请求累计预算；不扩大为所有工作流已统一计费控制。任意自然语言约束不会自动解析为数值预算。成员独立模型、隔离 Git
worktree、真实供应商完整自主交付/引用可靠性和复杂反编译仍未完成。目标保持 active，不合并 master、不发布正式 Release。

## E-129 三平台工件

[运行42887993551](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42887993551)
completed/success，产品源8ede6b1e45c5749f622f17c3ac56867c3b9160a4。三个包的SHA/版本/源运行、安装记录、六个rg二进制hash/Unix权限和原生Swarm正常20请求链逐一核对。新增预算停止链全部通过：每平台总3请求（初始隔离seed外1次、累计预算内2次），下一次在供应商前拒绝；CLI自行退出1而不是观察者停止，blocked/paused及错误保留。

| 平台        | 包SHA-256                                                        | 预算停止链     |
| ----------- | ---------------------------------------------------------------- | -------------- |
| Windows x64 | 64985212dbeb3c9c253550a45f1f34aa71aeaaf41678cc254fa8d7c1669c8509 | 1218ms / 退出1 |
| Linux x64   | c9c034385935ae57f772e7600208158ab800b6071cea88d45f0ce80c45c05576 | 1042ms / 退出1 |
| macOS arm64 | 95939a35eb97a1fe1b5912e2d1ca1091e4c12f4091563c6fdaa2c314bd133be5 | 1293ms / 退出1 |

这些是fixture隔离时长，不用于跨平台性能排名或真实供应商验收。第一次工件核对早于Windows下载结束，ENOENT辅助日志保留为github-preview33-artifacts-check-before-download.log；等待原下载完成后核对通过，未重启CI、不归因产品故障。

## E-130 本机安装与接续

本机仅安装Windows
CI包一次：offline已有缓存7240ms/退出0；gemini-ultra与gemini-ultra-cli均1.0.0-preview.33，424包内文件逐一匹配。入口SHA-256为90da9406d8b23a5931ec4e531052a98e3f1ec7005ab6830497d0d79f23a06127。保留preview.32原包；个人供应商配置、真实数据库与逆向工具未改。

工程目录：github-preview33-run.json、github-preview33-artifacts-result.json、github-run-42887993551/各平台/swarm-budget-verification.json及-output.txt、global-preview33-install-result.json、global-install-github-preview33-full-result.json。无需在本机重复已由Windows原包实际执行过的相同fixture。

WI-063
Swarm预算实现/分发交付；下一阶段WI-064将Teamwork/Boost任务请求累计额度与失败恢复统一，不重新做同一付费审查。真实供应商无人介入交付/引用准确性（WI-054）、复杂逆向（WI-056）、隔离worktree与成员独立模型仍未完成。goal保持active，仅codex分支，不合并master、不发布正式Release。
