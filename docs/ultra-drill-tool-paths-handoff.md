# Gemini Ultra CLI 本机逆向工具路径交接

日期：2026-11-11。WI-092/E-218，候选preview.60。沿用R26/code-audit自有源码case、lead/cae/doc、scope授权granted。无真实模型、外部安全目标、个人配置/数据库/本机逆向工具改动。

## 问题与实现

工具路径原先依赖PATH或临时环境变量，无法在CLI内持久保存，跨终端配置容易丢失。新增`/drill tools`查看，`/drill tools <工具> <完整路径>`保存，`/drill tools reset <工具>`清除。中英文描述/反馈及`/演练台`别名沿用，参数留给输入不自动执行。支持现有巡检的15工具，不添加安装/下载/执行工具步骤。

保存到当前用户`~/.gemini/ultra-tools.json`，可用GEMINI_ULTRA_TOOLS_FILE指定独立文件；仅在调用发现时读取，不在启动扫描。环境变量优先于保存，保存优先于PATH；Java保留显式路径变量→JAVA_HOME→保存路径→PATH。无效高优先设置明确报告、不回退。checkBinary同步与preflight异步共用保存路径解析，binary_inspect/analyze执行前的checkBinary、Ghidra
Java解析也使用同源设置。保存后下次调用即时生效，不改PATH或用户shell。

只接受已知工具、绝对路径、可访问常规文件，POSIX须可执行，r2/rabin2/java拒绝bat/cmd包装；有空格可使用一层引号。路径存在和执行权限不证明版本兼容或软件实际功能。配置版本/schema/128KiB/常规文件校验，损坏/权限读取失败/链接文件拒绝并保留，不回显原始坏正文，不用空配置替代。环境显式覆盖仍可使用，受损文件需原位修复后保存/reset。

保存先校验候选，再持互斥锁重读原文件，生成唯一备份、写同目录临时文件并rename替换；失败保留原文件、备份及错误，清理临时文件，释放锁。reset只删除一个工具设置，不删除可执行文件。原文件备份模式0600；无改动不写新配置。供应商、MCP、演练授权不包含在此文件，其他电脑应选当地路径。

Evidence → Problem →
Path：原环境变量入口缺CLI持久设置 → 新共享路径存储及CLI命令 → 同一配置用于巡检/执行发现、环境优先且坏文件保留 → 独立profile实际跨进程保存/读取/巡检/reset及失败SHA验证。

## 验证与边界

6项不同核心检查通过：空格路径即时发现/reset备份、无效候选/相对路径/原生包装拒绝不改文件、坏配置保留与显式变量优先、无效高优先不回退、Java选择与巡检一致、原子替换失败保留原文和备份且清临时/锁。最后一项初次spy
Node命名空间不可重定义，夹具改为mock文件边界后仅复核该项通过，未改产品以满足夹具；原失败保留。

源码真实12命令/8退出0/4预期42/0模型：空配置不创建文件、保存空格路径、另一CLI进程查看与巡检、坏候选/未知工具不覆盖、reset唯一备份、中文切换与/演练台别名、损坏配置读取和reset均拒绝且SHA保持、不回显坏正文。可执行路径夹具为Node副本，从未当r2/rabin2执行，不将其冒充新逆向软件安装或真实分析验收。源码报告版本取上游nightly根包；三平台包/安装结果待追加。

相关严格type/lint通过；首lint中的4个不安全/多余断言改为schema解析或安全分支后通过。无全量或冒烟。用户真实ultra-tools.json原本不存在，本轮仍未创建；个人locale/provider
SHA保持59末值。工程C:\Users\Administrator\Documents\ChatGPT\gmncliu：drill-tool-paths-junit.xml、drill-tool-paths.log、drill-tool-paths-failure*、drill-tool-paths-types.log、drill-tool-paths-final-types.log、drill-tool-paths-lint.log、drill-tool-paths-final-lint.log、drill-tool-paths-source*。

goal
active。真实二进制工具与Ghidra既有三平台基线保留，本轮证明持久路径发现而非所有工具版本兼容/跨机实际操作。工具配置GUI、更多模型/长任务、长会话语义准确性与复杂逆向继续。不合并master或创建正式Release。
