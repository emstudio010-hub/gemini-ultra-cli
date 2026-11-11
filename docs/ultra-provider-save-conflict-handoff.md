# Gemini Ultra CLI 供应商配置并发保存交接

日期：2026-11-11。WI-102/E-247/F-069，preview.69已安装。R26/code-audit自有源码case、lead/cae/doc、scope
granted继续；仅独立假供应商文件，不改个人配置、数据库或本机逆向工具，0模型。

## 缺陷与实现

ProviderManager原先在构造时读取文件，后续一直修改内存快照；saveToDisk虽有临时文件+rename防半文件，但两个CLI先后保存时会无提示覆盖其他CLI最新配置。旧3回归均失败：旧snapshot保存覆盖其他更新、缺文件初始化后覆盖后来创建的配置、其他进程持保存锁时仍写。

新增每文件短时proper-lockfile锁，锁路径以canonical父目录+配置basename定位，realpath=false支持首次创建；不等待争用、30秒stale。save锁内比对当前文件revision与实例读取时revision，不同即拒绝，临时文件/备份/目标/内存均不变。成功后更新自身revision；失败清临时文件并在finally释放锁。只有短时同步保存持锁，无模型或网络调用。

正常文件revision用最多4MiB+1的有界读取计算字节SHA，不把解析后相同当可覆盖（外部格式修改也会触发冲突）；超大/非普通文件用metadata，读取异常按既有默认配置恢复机制保留。加载前后revision不同重读一次，仍变则明确冲突。现有坏JSON默认读取/保存前.bak恢复保留；不自动清空其他CLI的新文件。

新增双语ProviderConfigConflictError区分忙碌和旧快照。命令/provider保存失败显示明确原因、不切换会话模型。重新打开/provider先reloadFromDisk更新当前manager，再显示配置窗口；不自动合并旧表单或替用户批准修改。getInstance比较规范化绝对路径，避免相对路径选择重复重建。

这是合作的新版CLI间的本地保存保护；其他编辑器可在版本检查与rename之间并发写，不宣称消除这类TOCTOU。旧CLI不遵守新锁，网络盘、硬崩溃和锁超过30秒的异常阻塞也不在本轮验收范围内。只读API仍可持有原会话选择，未在每次模型请求时重读个人文件。

Evidence → Finding → Path：3旧回归失败及原save链 →
F-069缓存配置无并发版本检查 → 锁内revision检查/明确冲突/显式重开 →
7core+1命令定向及真实双进程保存。

## 必要证据

core7项：3新回归、显式reload保留他人修改、备份失败释放锁、2既有坏配置备份恢复；命令1项：外部修改后保存被拒、原文件和会话模型保持、重开读取外部供应商并正确再切换。共8不同项，其余用例未执行，strict
core构建/cli
types与相关lint通过。首lint仅新增测试one-var声明，拆分后单独复核，不重复已通过业务。

verify-ultra-provider-save-conflict.mjs在source或实际分发包中导出真实ProviderManager。两个独立Node进程先加载同一份人工配置，均ready后父进程仅写同步go文件，同时保存不同供应商；一成功/一ProviderConfigConflictError，两进程自然退出0。文件保留Seed和胜者，.bak精确为原文件，无lock/tmp；再用新实例重试失败方，三供应商齐全且.bak保留上轮结果。父进程无生产方法替换，不伪造返回值，0模型。source已通过，三平台分发待追加。

工程证据：provider-save-conflict-before-junit.xml/-log（3失败）、provider-save-conflict-junit.xml/-log（7通过）、provider-save-conflict-command-junit.xml/-log（1通过）、provider-save-conflict-core-build.log、provider-save-conflict-cli-types.log、provider-save-conflict-lint.log/-final-lint.log、provider-save-conflict-source.json/-log。无全量/冒烟/付费模型。

## 前轮上传终态与接续

67/run43094935659现已completed/failure，原watch
session73541退出0（shell重定向结束不等同CI成功）。github-preview67-terminal-run.json和github-preview67-terminal-failed.log显示三平台CreateArtifact收到HTML、JSON解析失败，各重试5次后失败；安装/功能检查均success，归档仍未取得，不补造三平台工件证据。旧报告in_progress是当时快照，保留不覆盖。

本轮69采用provider-save-conflict范围验证新的并发保存，跳过无关链；68配置记录隐藏仍是本地原生证据，不借69扩大为全部新验收。69三平台包与全局安装已完成，goal
active；原始启动/语言/模型配置/演练台/协作/跨机逆向目标保持，不合并master或正式Release。

## 三平台分发与安装

E-248：产品源c9caec4e990362bf8379ab428a7cb67cb8946d31/run43101008860三平台provider-save-conflict范围completed/success；minimum-node和旧无关链skipped。独立核对版本69、源chunk、包/入口SHA、六rg身份权限及安装4基础工具。每平台分发包中实际ProviderManager由两个Node进程加载相同snapshot后同时保存，一胜一ProviderConfigConflictError，两进程退出0；Seed/胜者及原备份保持，无残留lock/tmp；重读后重试失败方，三供应商齐全，0模型。67上传故障后本轮工件上传恢复，不补造缺失67归档；68配置记录隐藏及67准备取消/回滚仍按原本地边界保留，不称本轮重新验收。

E-249：offline已有缓存安装7205ms/退出0，双命令preview.69，425文件匹配Windows
CI包，旧包保留。包SHA256
aca69518abe3db01befb00f5cbb62e46f7f8405ba92395d2c06fe77ad84e835b，入口SHA256
618c53d81a4bf7dd740b34ea3df9b457b33f88424a0e36429191eaef87016b64。个人locale/provider
SHA保持68末值，ultra-tools.json仍未创建，无额外本机业务/启动基准/全量/冒烟/付费模型重跑。WI-102/F-069供应商并发保存冲突及显式重开修复分发交付；支持合作新版进程的本地文件系统，非网络盘/硬崩溃或外部任意并发写证明。goal
active，原始启动/语言/配置/演练台/协作/跨机逆向目标保持，不合并master或正式Release。

最终证据：github-preview69-run.json、github-preview69-artifacts-result.json、github-preview69-artifacts-verification.log、github-run-43101008860/、global-preview69-install-result.json、global-install-github-preview69-full-result.json、provider-save-conflict-personal-config.json。个人locale
SHA 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；providers
SHA
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332。源码、工程报告与Obsidian全文同步。

独立核对器首轮只搜索小写provider
configuration，Windows实际返回首字母大写的完整旧快照诊断而拒绝。已保留github-preview69-artifacts-verification-first.log，并改精确接受忙碌/旧快照两种完整合法诊断，重新读取同一批工件通过；没有重跑CI、修改产品文案或放宽冲突类型/胜者数/备份等断言。
