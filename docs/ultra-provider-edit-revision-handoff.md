# Gemini Ultra CLI 配置编辑选择保留与冲突恢复交接

日期2026-11-14。WI-207 / E-469至470 / F-165。基线455c82d4d31ae7abcedffb356c6e9e132650dbea，分支codex/ultra-agent-portable。上一goal turn为progress（双签名源码与真实失败证据）。整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包；无打包、重装、升版本、多平台CI、付费任务重跑，全局preview.83保持。

## 实际缺陷与边界

ProviderConfigDialog在修改当前供应商参数/清单时向upsertProvider传setActive=true，导致有效activeModel与provider.defaultModel不同时被重新设为默认模型。这种配置可由本地配置或不激活的provider默认项修改产生，Manager本身允许两者不同。普通参数编辑不应包含激活意图。

同进程UI快照若已落后于ProviderManager，原界面会把旧profile字段重新传入；单元场景可复现覆盖更新。实际Windows进一步澄清：Provider弹窗打开时Drill API有isReady门禁，POST返回409，当前演练台不会直接并发改写该弹窗配置。不能把单元的直接Manager更新场景冒称现有Web绕过或实际并发漏洞。保留原门禁，不改服务授权/ready条件。

另一CLI/编辑器改磁盘时，已有Manager磁盘revision保护能拒绝旧保存，但对话框回主菜单仅复用旧内存配置，用户恢复不便；本轮让显式Esc返回重新读盘、再选择后编辑，保留拒绝时草稿。

## 源码

仅ProviderConfigDialog.tsx与对应test文件：
- 统一updateProvider只改目标字段，并固定setActive=false。仍由Manager处理当前模型被显式移除的必要回退；新建激活与用户显式选择激活保持。
- requireCurrentProvider按不可变完整profile快照与Manager当前值比较；已删除或同进程发生更新时拒绝，保留输入并给双语反馈。普通基础/协议/模型/容量/输出/推理续接/生图修改复用；选择激活、取目录和确认删除也检查目标身份/快照。比较仅在内存，不输出或落盘密钥。
- Esc离开子页时调用已有reloadFromDisk再刷新provider列表；读取/损坏错误由原捕获保留当前页与输入，不自动保存或合并陈旧草稿。跨进程写保护仍由Manager负责，不引入静默合并。

## E-469 定向检查

新增3个相关用例：参数/清单保存保留非默认当前模型（2项），同进程profile更新后旧保存拒绝/输入保持/Esc重读后明确保存（1项）。对应整个组件文件16项通过（139106ms测试/173.81s总耗时，非启动性能证据）；CLI严格tsc、两文件eslint --max-warnings0、最终Prettier、git diff --check退出0。core未改，不重复编译；无全量/冒烟或提示字符串镜像测试。

首before日志3项失败，其中前2项夹具最初误以为setActiveSelection不改defaultModel；实际该方法同时更新默认模型，故这两项首失败不作为产品缺陷证据。修正为正常API先选模型、再以setActive=false保留另一default，随后以git show读取的原始HEAD组件重现两项真实选择重置（provider-edit-selection-before.log/两失败、退出1）；本轮提出的组件源码先保存到独立备份，finally恢复，未reset或覆盖用户修改。首第三项旧表单覆盖的直接Manager场景有效，但其范围只限同进程公共API/单元，不覆盖忙碌Web门禁。

## E-470 Windows实际CLI

真实源码CLI经ConPTY启动，独立home/profile、假密钥、本地空端点，开发preloader只调用现有startDrillCockpit启动本地服务并记录临时URL，实际CLI自身connectDrillSession/isReady/审批条件保持。没有浏览器、模型请求或自定义业务替身。

首验证器假设忙碌弹窗可经Drill API改供应商，实际收到409；保存首result/log/终端输出为busy-api-*，不改产品门禁，修验证器改测真正另一进程写入。

最终7条件true、26725ms/自然退出0、0模型或目录请求：
1. 存量activeModel=selected-model、defaultModel=default-model，终端保存输出2048后两选择均保持。
2. 再输入4096未保存，实际Drill provider POST返回409且文件逐字不变。
3. 新的独立Node进程调用真实ProviderManager更新假key、models/default、输出512/容量16384，再选new-selected；不编辑个人配置。
4. 原终端Enter保存被已有磁盘revision拒绝，文件逐字保持，4096草稿仍在。
5. Esc返回主菜单重读配置，再进输出页显示512；显式改1024保存成功。
6. 新key/新模型/容量，以及原image/header/reasoning配置保持；最终activeModel为另一进程选择的new-selected。

上述6段动作共7布尔条件（冲突拒绝和草稿保留分开）。没有测试实际两个CLI并发持锁压力、损坏文件Esc反馈或所有菜单的逐项ConPTY输入；组件文件相关16项覆盖其既有行为。默认选择/冲突恢复为实际证明，同进程快照检查为单元与源码证明；范围分列。

## 证据与保全

工程证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- provider-edit-revision-before.log/-before-junit.xml（首夹具边界如上）、reproduce-provider-selection-reset.mjs、provider-edit-selection-before.log/-before-junit.xml、provider-edit-revision-proposed.tsx（本轮源码备份）；
- provider-edit-revision-tests.log/-junit.xml（16项）、-cli-compile.log、-lint.log、-format.log/-format-check.log/-final-format-check.log；
- observe-provider-edit-revision.mjs、verify-source-provider-edit-revision.mjs、update-provider-edit-revision-fixture.mjs；source-provider-edit-revision.log/-result.json、provider-edit-revision-conpty-output.txt；
- source-provider-edit-revision-busy-api-result.json/-busy-api.log、provider-edit-revision-busy-api-conpty-output.txt（旧验证假设失效证据）；
- verify-provider-edit-revision-preservation.mjs、source-provider-edit-revision-preservation.json。

finally结束自有终端/端点、清理命名受限临时根。保全全部true：个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83；旧E-294/E-364与本次此前E-466失败SHA及passed=false保持，E-466临时凭据仍已移除。未改个人数据库、工具安装或PATH，旧被拒清理目录不动。

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部安全目标。更新目标池、case四项及证据，三份交接全文同SHA，显式stage、skip ci推隔离分支，不合并master/Release。真实复杂模型质量F-164仍开放，整体goal active。
