# Gemini Ultra CLI 事实关键词检索完整性交接

日期：2026-11-12。WI-109/E-264/F-074。沿用 R26/code-audit、work/gemini-ultra-agent-20261110/scope.md，自有源码授权 granted，lead/cae/doc。本阶段0模型，不改个人数据库/语言/供应商/逆向工具，goal
active。

## 问题与修复

queryFacts的FTS路径直接返回facts_fts摘要行。旧索引没有canonical记录ID，返回结果缺少漏洞status/severity/evidence/poc、二进制哈希/尺寸/路径等字段；不同于普通列表的完整事实。上阶段新加的验证状态在关键词搜索时仍可能丢失。旧源码4项新回归实际失败，原日志保留。

新增可选facts_search_v2派生索引，保存category、session_id和原事实record_id，匹配后从原vuln/binary_artifact/note表读取完整行，factType与普通列表一致；同名记录按各自ID保持独立。保留FTS短语、前缀查询，验证状态加入可搜索字段。普通列表与搜索按记录时间排序、全类别合计最多50条；不是返回所有历史事实，未返回不代表不存在。

初始化在savepoint内创建索引；原事实数量与派生索引数量不一致时，从原表重建派生索引，旧facts_fts保留不删除。原事实不被迁移重写，证据/状态/ID/时间逐字段保持。索引初始化失败则回滚并使用字面搜索，业务写入不因可选索引失败而丢失。某次写索引失败后当前实例禁用索引查询，字面路径可读新事实；下次打开在数量检查后重建。两路径均在原表和索引范围约束session，缺索引、FTS语法不合法或查询异常回退字面匹配。

仅派生索引增删，未清理历史表；磁盘上会增加索引空间。初始化执行计数，首次/不一致时读取原事实构建全文索引；没有把此改动称为启动加速。数量检查不是任意外部编辑器完整性审计，直接SQL同数量替换/修改内容可能使索引陈旧；产品当前写入接口为追加。旧版本仍写旧索引时，新进程重新打开可由数量变化补建；不承诺混用旧版时长寿命进程立即看到新增FTS匹配。

## 必要验证

Evidence → Finding → Path：4旧回归失败 →
F-074索引摘要替代事实原文 → 关联canonical ID的派生索引及完整行查询 →
5新增+2既有搜索边界定向通过（其他2项跳过）、strict core
types/lint/build通过。新增场景覆盖完整类型字段/状态、同名事实与会话、短语/前缀、旧库补建且原文/旧索引不变、缺索引回落/可写/重开恢复、异常重建回滚；最后一项是新增迁移分支的必要检查。首prettier调用误以packages/core为工作目录，路径不匹配未改文件，随后在仓库根格式化成功；不将该命令视为格式化通过。

verify-ultra-drill-search.mjs使用实际Config、DrillQueryFactsTool、DrillStore与独立SQLite库：生成5条原事实，构造旧索引与无新索引状态后重开，核对查询结果逐字段等同普通列表、两同名漏洞ID/status不混淆、binary原元数据保留、全局/当前会话、短语/前缀/状态搜索；补建不改旧表，删除可选索引后新事实仍可归档和字面查询，重开FTS恢复。0模型/网络，不能冒充真实供应商新任务或个人数据库迁移实测。

工程证据在C:/Users/Administrator/Documents/ChatGPT/gmncliu：drill-search-before-junit.xml/-before.log（4旧失败）、drill-search-junit.xml/-log（首4通过）、drill-search-final-junit.xml/-final.log（7通过/2跳过）、drill-search-types.log、drill-search-lint.log、drill-search-script-lint.log、drill-search-build.log、drill-search-source.json/-log。没有全量/冒烟、没有重跑上阶段20请求真实红队任务。

preview.74已通过三平台drill-search范围分发并安装到本机。既有真实红队/Teamwork/Swarm与启动单机基线保留，更多真实长任务与复杂跨机逆向仍继续，不合并master或正式Release。

## 三平台交付结果

E-265：产品源c985993d144bfc4ccbb9c20fcb6c0a3c7f67f659/run43216851296三平台drill-search范围completed/success；minimum-node、native-address-recheck及旧无关链skipped。独立核对三包版本74、源chunk、包/入口SHA、六rg身份权限及安装4基础工具。每平台实际包Config/DrillQueryFactsTool/SQLite通过：关键词命中返回完整canonical事实，ID/状态/类型字段与普通列表逐字段相同、同名漏洞分开、会话/短语/前缀/状态匹配保留；旧库5事实补建关联索引，原记录及旧索引保持；删除可选索引后新增事实可写且字面可读，重开恢复FTS，当前会话5事实。0模型/网络，不重跑旧真实红队或未变更协作逆向链。

E-266：offline已有缓存安装7069ms/退出0，双命令preview.74，425文件匹配Windows
CI包。包SHA256
1162ca11af56357811838164c4791df52ea6b1eca9c42dd5c9b3dc979e0de6e6，入口SHA256
0051225f0d1bda211e4e531edca41c69fda870d5cc8478b1ad7d082bd6e1a5b9。旧包保留，个人locale/provider哈希保持73末值，ultra-tools.json仍未创建。WI-109/F-074关键词查询不再以索引摘要代替完整事实，分发交付；数量校验仍非任意外部SQL编辑的完整性保证，历史事实状态不重分类。没有全量/冒烟/付费或旧业务重复，goal
active，不合并master或正式Release。

最终证据：github-preview74-run.json、github-preview74-artifacts-result.json、github-preview74-artifacts-verification.log、github-run-43216851296/、global-preview74-install-result.json、global-install-github-preview74-full-result.json、drill-search-personal-config.json。源码、工程正式报告和Obsidian全文同步。

接续保持完整产品目标：启动/语言/模型配置/动效/四种协作与本地逆向分发已有对应证据；真实红队E-260、TeamworkE-212、SwarmE-163、BoostE-156是有限任务，不扩为任意生产质量。后续优先检查原始用户主流程与可取消加载的实际缺口，避免继续仅修事实库局部而忽略完整Agent交付。
