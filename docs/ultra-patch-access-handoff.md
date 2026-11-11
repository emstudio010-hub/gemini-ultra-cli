# Gemini Ultra CLI 补丁工具工作区写入交接

日期：2026-11-11。WI-099/E-238/F-065，preview.66已安装。沿用R26/code-audit自有源码case、lead/cae/doc及scope授权granted。仅人工文本与独立profile/数据库，0模型，无个人配置/数据库/逆向工具改动。

## 问题与行为

apply_patch和verified_patch_transaction原入口未调用Config.validatePathAccess，没有预取消检查。事务相对targetFile还按进程cwd解析；多文件补丁逐个立即落盘，后面的非法路径不能阻止前面的修改。5项旧回归均实际失败，保留patch-access-before-junit.xml/-log。

Evidence → Finding →
Path：旧工具忽略既有write拒绝且预取消仍修改，混合补丁先改合法文件 →
F-065写入范围与取消规则缺失 → 产品入口接Config.read/write、项目相对解析、事务产物write检查、多文件全部路径预校验及逐步复核 →
8项定向与真实Config入口验证通过。

事务工具先检查取消，按Config.targetDir解析并realpath，先验证目标read/write；helper在原文件读取及五件套生成前，校验目标、备份、副本、diff、校验单、回滚脚本的canonical
write路径。staged同样会写产物，不能只校验read。Config额外工作区仍可写，只读路径不获得write。现有direct
helper签名兼容，新增可选validateWrite，无Config直接调用者自行提供范围规则。

多文件helper检查全部Add/Update/Delete目标后才执行首个mkdir/write/unlink，使用时再检查。产品传入Config校验；Update同时校验read/write，Add/Delete校验write。独立helper没有Config回调时默认限制canonical
workspace。对于尚不存在的子目录，解析最近已有祖先再拼接，防止经链接新增越界目录；悬空链接直接拒绝。canonical解析按字面文件名，不解码%20等字符，防止更改文件名。Delete保留原unlink语义，不把链接删除变成其目标文件删除。没有新增审批模式或改Config现有允许范围。

这是路径预校验，不承诺多文件内容不匹配/磁盘异常时自动回滚先前文件，也不声称阻止任意外部进程并发替换路径的全部TOCTOU或识别所有硬链接别名。

## 定向证据

8项：两入口canonical
write拒绝且无产物；全部路径先检查；两入口预取消无修改；direct
helper越界/链接/悬空拒绝；事务产物单独write拒绝；字面百分号路径及嵌套增改删成功。strict
type/lint通过，相关core构建成功。没有全量或冒烟测试。

verify-ultra-patch-access.mjs使用source或分发包导出的实际工具类、真实Config及独立Storage：外部目录显式设为只读，read允许但write拒绝。三种路径形式（绝对、../、工作区链接）的Add/Update/Delete及staged事务、链接未知子目录、混合补丁共14拒绝；另2预取消，人工外部与合法文件SHA保持、无事实DB或越界新文件。合法嵌套增改删4操作、Config额外工作区、相对事务staged/applied、五件套内容及应用后的人工文本Node回滚均成功，独立事实DB恰2记录。原样本与外部安全目标、任意系统文件无关。此链调用实际工具入口，不冒称完整CLI模型调度。

首source验证器错误调用不存在的getDatabase，流程到数据库核对处才失败；改用DrillStore现有queryPatchTransactions后通过，保留patch-access-source.log原失败，产品没有为夹具放宽约束。最后增加两记录staged/applied状态断言由候选分发链核对，不重复本机已通过业务。

证据：patch-access-before-junit.xml/-log、patch-access-junit.xml/-log（8/0）、patch-access-types.log、patch-access-lint.log、patch-access-build.log、patch-access-source.json/-log/-final.log、patch-access-script-lint/final-lint.log。个人配置SHA由65交付末值作为比对，安装阶段再核对。

本轮初查原生逆向进程取消，以人工Node父子进程执行现有raw
execFile，Windows未复现残留子进程（native-analysis-cancel-before.json，parentAlive=false/childAlive=false）；没有修改其进程生命周期。Ghidra准备期取消窗口后续继续核实，不能把本轮写入修复算原生进程树新修复。

66的patch-access范围三平台分发与全局安装已完成。65工作区read、64原生PTY、63最低Node等未受影响基线保留；长任务、语义质量、完整终端UI和复杂跨机逆向仍待。goal
active，不合并master或创建正式Release。

## 三平台分发与安装

E-239：产品源1d6708d2ff437ea9f6d00fbb43af0319ca7b6dda/run43092928849三平台patch-access范围completed/success，minimum-node和旧无关链skipped。独立核对版本66、源chunk、包/入口SHA、六rg身份权限及安装4基础工具；每平台从分发包导出真实补丁工具配合Config/独立Storage，14路径拒绝及2预取消均无越界修改，原文件SHA保持、拒绝阶段无事实DB；合法4增改删操作、额外工作区、相对事务staged/applied与人工文本Node回滚通过，2事实记录，0模型。不冒称完整CLI模型调度/任意文件名或并发替换路径验收，47至65未受影响基线保留。

E-240：offline已有缓存安装7258ms/退出0，双命令preview.66，425文件匹配Windows
CI包，旧包保留。包SHA256
ac23a38b5f00b7c5cc957418da1dfda93cc777da34f7d74c81c4aca29750d11e，入口SHA256
5603bac4c9dc4631cb547b6eb4cb9de2889485d2ad9b1542675dc52485dce6aa。个人locale/provider
SHA保持65末值，ultra-tools.json仍未创建；无额外本机业务/启动基准/付费或全量/冒烟重跑。WI-099/F-065补丁工具写入规则、路径预校验与预取消修复分发交付，goal
active；更多模型长任务、语义质量、完整终端UI及复杂跨机逆向继续，不合并master或创建正式Release。

最终工程证据：github-preview66-run.json、github-preview66-artifacts-result.json、github-preview66-artifacts-verification.log、github-run-43092928849/、global-preview66-install-result.json、global-install-github-preview66-full-result.json、patch-access-personal-config.json。个人locale
SHA 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；providers
SHA
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。源码交接、工程正式报告与Obsidian全文同步。
