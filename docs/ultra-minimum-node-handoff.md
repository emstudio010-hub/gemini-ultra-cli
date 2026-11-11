# Gemini Ultra CLI 最低 Node 运行环境交接

日期：2026-11-11。WI-096/E-230，产品仍为preview.63。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted。没有产品代码、全局Node、个人配置、数据库或逆向工具改动，没有真实模型调用。

## 要求与实现

包engines、轻入口和安装文档一致声明Node>=22.19.0，但已有三平台包检查使用Node24，缺少声明最低版本下的实际运行证据。本轮按这一具体缺口增加最低运行时验收，复用已完成的63安装包，不重新构建或提升预览版本。

本机从nodejs.org固定v22.19.0地址取得Windows x64
ZIP及SHASUMS256，SHA256一致后仅解压到工程证据目录，不改PATH或系统Node。官方ZIP
SHA为
`ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86`。以该绝对路径运行已安装63包，--version退出0；同一最低Node运行验证脚本及其实际CLI子进程，5次loopback模型协议请求、4个工具（binary_triage、grep_search、drill_record_fact、drill_query_facts）成功，SQLite中1个二进制记录和1个note内容/哈希一致，六份rg身份与主机rg执行通过。3626ms是该有界工具链耗时，不是启动基准；样本是人工生成且不执行，不冒充复杂逆向或PTY验收。

新增verify-ultra-minimum-node.mjs及现有打包workflow的minimum-node范围：输入之前成功的包run
ID，在Node22.19.0下载对应平台现成工件，校验原run为同仓库Ultra CLI
packages、隔离分支workflow_dispatch成功，再核对包SHA/名称/engines/源chunk/原安装记录。安装到runner临时prefix后运行同一4工具/SQLite链，要求验证脚本和CLI均使用最低Node，并核对安装入口SHA与原包一致。minimum-node范围跳过整个重新打包job，不触发旧协作、逆向、搜索兜底或浏览器检查。新helper在本机用原CI工件和刚完成的最低Node结果prepare/complete通过，没有重复业务链；相关lint通过。

Evidence → Requirement → Path：源码和manifest声明22.19，但原CI只有24
→ 最低Node运行证据缺失 → 官方固定运行时+已有原包执行 → 本机22.19核心工具链通过，并接续三个平台的同包最低Node检查。没有为通过检查降低引擎声明或更换依赖。

## 证据与边界

工程：runtime-node22-19/runtime-integrity.json、官方ZIP/SHASUMS256、node-minimum-installed63-version.log、node-minimum-installed63.json/-log、minimum-node-source-run.json、minimum-node-local-plan.json/-log、minimum-node-local-result.json、minimum-node-lint.log。Windows
Node22.19最低环境本地及三平台CI均通过，见下方E-231。产品源仍
`e2ed2b697c897e590df9c089c68b0c76f35e1020`，原包来源run43082219156，全局63未重装。

## 三平台最低运行时结果

E-231：验收实现源 `3921cd120995d59d981055404cd126954d580024`，
[run 43084607330](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/43084607330)
三个minimum-node job completed/success，package job
skipped，没有重新构建产品。每平台临时安装原run43082219156的63包，以精确Node
v22.19.0运行验证脚本和CLI子进程；5次loopback协议请求、4工具、SQLite中1个二进制/1个note及六rg身份/主机执行通过。源码标识仍是原产品
`e2ed2b697c897e590df9c089c68b0c76f35e1020`。Windows/Linux/macOS原包SHA分别为
`2eb799c9ea454339a36f1681f46a948112954dbb094abfffe10b729376beaac5`、`ac0fd6539b3b01617d4f61d0d7e6d41fb8358f7ff0b4610248ebbb07d972359d`、`458cf19005f70960aa7f81d17fafe32ff8631bf596f2dea865ee13c497ae63fc`，均与原63独立工件记录相同。各份入口SHA也相同。

独立核对下载的source-run、package-plan、install-verification、minimum-node-verification，检查当前验收源与原产品源分开、确切运行版本、来源run、工具/记录数和样本SHA，不只读取passed。最终证据：github-minimum-node-run.json、github-minimum-node-artifacts-result.json、github-run-43084607330/、verify-github-minimum-node-artifacts.mjs、minimum-node-preserved-system.json。个人provider/locale
SHA保持63末值，工具配置仍未创建；系统Node仍是 `C:\Program Files\nodejs\node.exe`
/ v24.19.0。全局CLI仍preview.63，未重装。源码、工程正式报告与Obsidian全文同步。

goal
active。最低环境只证明指定原生基础链，不等于所有终端/PTY/原生插件、Google登录、供应商、深度逆向或长任务的全覆盖验收。既有63搜索和62看板等基线保留，更多真实模型长任务、语义质量及复杂跨机逆向继续。不合并master或创建正式Release。
