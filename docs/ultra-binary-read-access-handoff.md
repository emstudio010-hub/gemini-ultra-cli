# Gemini Ultra CLI 二进制工具工作区读取交接

日期：2026-11-11。WI-098/E-235/F-064，preview.65已安装。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted；radare2按本地tool-index已核对的安装路径使用。本轮无模型、外部目标、个人配置/数据库/本机逆向工具改动。

## 问题与修复

binary_decompile已有Config.validatePathAccess(read)，但binary_inspect、binary_analyze和binary_triage未调用；工具调度器的调用允许并不替代工具内部的工作区文件读取规则。初筛还用进程cwd解析filePath，与Config.targetDir不同时相对样本找错。旧4项定向均失败：三个工具未对canonical路径执行指定拒绝检查，且相对初筛读取错误目录；原日志保留。

inspect/analyze的内部helper增加可选validateRead回调，在realpath得到真实样本路径后、stat/工具发现/原生进程创建之前检查；产品工具入口始终传Config.validatePathAccess(file,'read')，与已有decompile对齐。直接helper的现有调用签名保持兼容，调用者要使用自己的范围检查应传回调。triage工具入口先复核取消、按Config.targetDir解析相对路径并realpath，再执行现有读取校验和取消检查，允许后才读取/归档。没有新增授权/审批模式，也不改现有配置的允许范围。链接解析到工作区外时按真实目标拒绝；允许的项目/只读范围仍由Config决定。不声称消除任意外部并发文件替换的全部TOCTOU边界。

Evidence → Finding → Path：三入口缺现有路径检查及相对cwd错误 →
F-064模型工具绕过工作区读取约束/错误样本路径 →
canonical路径传现有read校验及项目相对解析 →
4项定向通过，再以真实Config和实际工具入口验证6拒绝+允许样本静态分析。

## 本地验证与限制

4项定向通过：三个工具经工作区内链接读取样本时，在工具发现/原生执行前按真实路径拒绝且不泄漏内容；相对初筛从配置项目读取并尊重已取消请求。测试数据库用独立文件且结束关闭。首夹具完整mock
child_process导致Config依赖的editor
promisify(exec)加载失败，改部分mock后才得到4项真实旧失败；保留两层记录，不将夹具加载失败算产品缺陷。

实际源工具入口使用真实Config及已初始化的独立Storage：三个工具分别拒绝外部文件和工作区内指向它的符号链接，共6次拒绝，消息Path
not in
workspace，不包含人工PRIVATE_BINARY_SCOPE_MARKER，拒绝阶段未创建事实DB。随后工作区内带空格/与号文件按相对路径初筛成功，samplePath与SHA对应，SQLite恰好归档1条允许样本；真实本机radare2/rabin2对允许PE读取imports和functions，实际ExitProcess导入及非空函数表通过，样本未执行、允许与拒绝文件SHA均保持。原样本来自项目自有minimalPeFixture，不能当任意格式或复杂逆向验收。

verify-ultra-binary-read-access.mjs可调用source或分发包导出的真实工具实现，常规CI不另安装r2，用真实Config检查拒绝和允许初筛归档；可选ULTRA_VERIFY_NATIVE_DIRECTORY用于本机已核对的工具正向验证。首source夹具未初始化Storage，Config正常拒绝使用，补独立Storage.initialize后实际链通过，没有改产品以绕过校验或初始化条件。相关strict
type/lint通过；reverseTools原有空catch补说明，保留可选事实存储不可用时direct
helper仍返回初筛的既有行为，未把它算新归档可靠性修复。

工程：binary-read-access-before*、binary-read-access-fixture-failure-junit.xml、binary-read-access-before-final*、binary-read-access-junit.xml/-log、binary-read-access-types/final-types/lint/final-lint/script-final-lint.log、binary-read-access-source.json/-log/-final.log及storage-fixture-failure.json。没有全量/冒烟或未变更协作/付费请求重跑。

65的binary-read-access范围三平台包与全局安装已完成，64原生PTY及63最低Node等基线保留。goal
active；更多模型长任务、语义质量、完整终端UI及复杂跨机逆向继续。不合并master或创建正式Release。

## 三平台分发与安装

E-236：产品源631e8b8e730080cb1aa1d9eba7c77cf725bd99a4/run43089577016三平台binary-read-access范围completed/success，minimum-node和旧无关链skipped。独立核对版本65、源chunk、包/入口SHA、六rg身份权限及安装4基础工具。每平台从分发包导出实际工具类并使用真实Config/独立Storage：3工具各拒绝直接外部路径和工作区链接，共6次拒绝，Path
not in
workspace且无人工样本内容泄漏；允许项目相对PE初筛归档恰1条，路径/SHA对应、允许/拒绝文件SHA保持，0模型。CI不安装r2，本机source额外2真实rabin2/r2正向项单列；不是三平台完整CLI工具调度或复杂逆向验收。47至64未受影响基线保留。

E-237：offline已有缓存安装7779ms/退出0，双命令preview.65，425文件匹配Windows
CI包，旧包保留。包SHA256
ae288ad2abb4c975416a8aeec16d8ff1790c83f486530d80e6bdd04e888bb855，入口SHA256
9f43992b07765c74cee6ed33f4ea1de46655b73d486e18d1053b1e86231afac4。个人locale/provider
SHA保持64末值，ultra-tools.json仍未创建；无额外本机业务/启动基准/付费或全量/冒烟重跑。WI-098/F-064工作区读取一致性与项目相对路径修复分发交付，goal
active；更多模型长任务、语义质量、完整终端UI及复杂跨机逆向继续，不合并master或创建正式Release。

最终工程证据：github-preview65-run.json、github-preview65-artifacts-result.json、github-preview65-artifacts-verification.log、github-run-43089577016/、global-preview65-install-result.json、global-install-github-preview65-full-result.json、binary-read-access-personal-config.json。个人locale
SHA 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；providers
SHA
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。源码交接、工程正式报告与Obsidian全文同步。
