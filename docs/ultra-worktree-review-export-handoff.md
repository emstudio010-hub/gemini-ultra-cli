# Gemini Ultra CLI 隔离复核与实际导出树绑定交接

日期：2026-11-13。WI-191 / E-435至436 / F-148。源码基线82f4c7f6db74c8a82e15909da1a6513eb5f32918，分支codex/ultra-agent-portable。上一阶段为源码/Windows验证及提交进展，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费重跑，全局preview.83保持。

## 根因及源码

acceptReviewedAgentWorktree原先agentWorktreeTree检查当前树等于reviewedTree后，再调用acceptAgentWorktree。后者重新exportAgentWorktree并把新result当acceptedTree，没有再比较已审核树。宿主在检查快照与重新导出之间改文件时，未复核的树会得到批准，随后apply可依据该错误批准应用。

本轮改为先导出实际补丁及不可变result树，明确要求result===reviewedTree，并再次检查当前tree仍相同，最后把该已审核reviewedTree写入同一导出state.acceptedTree。不再调用会重新生成并批准快照的acceptAgentWorktree；独立低层显式acceptAgentWorktree API保持，产品自动workflow/Swarm验收仍使用严格acceptReviewed入口。

导出期间有变化时拒绝，保留实际生成的补丁与工作目录，不改Swarm完成状态/board。最后当前树检查之后仍可能发生宿主变化，本轮不声称锁住所有文件；批准始终指向已复核的不可变导出树，后续apply重新导出当前树并比较acceptedTree，变化不能凭旧批准应用。没有新增权限、放宽复核、自动重试或删除工作树。

不声称OS文件锁/跨进程多文件原子性、模型实际阅读或整个仓库语义安全；这里只修复“检查一个树却批准另一个树”。旧approvedTree若存在仍按原树记录保留，当前result变化由apply门禁拒绝，未引入整组磁盘事务。

## E-435 真实Git定向复现

新增worktreeReviewExport.test.ts，用真实Git初始化/工作树/alternate index/add/write-tree/diff/apply，测试包装只在write-tree真实返回后注入宿主写文件，不伪造git输出。旧源码2场景中1实际acceptedTree不等reviewedTree失败、1正常拒绝/显式重审对照通过。

修后3项：
- 导出快照返回后宿主改A→B，accept拒绝，acceptedTree空，导出patch/result仍A；B应用拒绝，源正文/HEAD/index保持。
- 最后当前树检查返回后改A→B，acceptedTree/result/patch仅A，B后续apply拒绝。
- 导出前已变B拒绝旧A，显式新review树B后正常应用。

与既有agentWorktree.test.ts8项（源dirty index保留、冲突拒绝、实际workflow隔离执行、Swarm复核文件及长verdict保留等）共11不同相关检查通过。core/CLI严格tsc、两个修改/新增文件eslint --max-warnings 0、prettier --check、git diff --check均退出0，无首轮编译/lint或修复后测试失败重跑。只相关两文件，未跑全量/冒烟。预期冲突git apply stderr在测试log原样保留，不作为验证失败。

## E-436 Windows实际公开Swarm完成与应用链

Node v24.19.0，独立profile、两个临时Git源仓库和真实managed worktree。公开ManageSwarmTool add/wait/finish/post接真实engine，只有auditor runner返回受控保存verdict，所有Git命令正常执行。node内置execFileSync包装在真实write-tree返回后注入宿主文件编辑，不使用假的Git树或补丁，也不启动真实AgentTool模型。

场景1：复核A后，在finish导出快照返回时改B。公开finish抛changed during or after，任务仍active；members/owner/board三个文件精确SHA保持，worktree result/patch为已审A且acceptedTree空，B不能apply，源报告/HEAD/index保持。显式post重新指定review_files并@复核员，实际新回合完成后finish与apply B正常；源HEAD和index仍保持。

场景2：复核A后，finish导出与最后current检查返回后改C。saved acceptedTree/result/patch均只A，不把C晋升；后续apply因当前导出C与批准A不一致拒绝，源正文/HEAD/index保持。任务可能已completed但未审C不可应用，这是文件未锁定情况下的明确界限。

11条件true，16915ms/退出0，17个真实Git write-tree快照、3次明确受控auditor runner回合，0模型/外部网络/付费，两个fixture最后专用根清理成功。不是付费模型审查质量、ConPTY、跨机器或最终包验收；无真实样本/扫描。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- worktree-review-export-before-test.log/-before-junit.xml（1旧失败/1对照）。
- worktree-review-export-test.log/-junit.xml（11相关）；-core-compile.log / -cli-compile.log / -lint.log / -format.log / -format-check.log。
- verify-source-worktree-review-export.mjs、source-worktree-review-export.log/-result.json。
- verify-worktree-review-export-preservation.mjs、source-worktree-review-export-preservation.json。

F-148 -> agentWorktree.acceptReviewed先校验后调用重新导出批准，两个快照不绑定。校验实际导出result并仅批准reviewedTree修复，不把当前文件永不变化作为前提。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、安装preview.83；E-294/E-364旧真实复杂任务SHA及passed=false保持，无覆盖/付费重跑。不改个人数据库、凭据、工具安装或PATH。旧被拒清理ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case / PRIMARY R26 code-audit，同会话lead/cae/doc，无Codex子代理或外部扫描。维护目标池、case四项，源码/工程/Obsidian三份全文SHA一致；显式stage本轮文件、skip ci提交推codex隔离分支，不合并master/Release。

继续Agent交付与Windows源码收敛，复杂真实任务质量、更多模型及最终Windows/macOS/Linux统一包仍待；整体goal active。
