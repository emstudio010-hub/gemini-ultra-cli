# Gemini Ultra CLI 推理强度确认与保存失败交接

日期：2026-11-12。WI-111/E-270/F-076。持续goal
active。preview.76已安装。本阶段只修改CLI命令/Ink窗口错误处理及按键识别，不改个人模型、语言、数据库或逆向工具，不调用模型。

## 实际缺陷与修复

EffortDialog仅匹配key.name=return，而KeypressContext把标准回车、Kitty/键盘Enter等正规化为enter，窗口回车可能不保存。修复为兼容enter和return；已有六档列表/单语言label保持。

另外effortCommand与EffortDialog直接setReasoningEffort未捕获保存异常，多个CLI并发更改配置会触发已有ProviderConfigConflictError，命令Promise拒绝；窗口原本忽略Enter掩盖这条错误路径。新增共用effortSaveError，命令本地显示ERROR并返回，窗口就地显示错误并保持打开，可Esc退出。文件保存失败不变更内存档位或磁盘原文，不发成功反馈；冲突使用现有双语重开/provider指引，普通I/O只给安全的权限提示，不回显私有路径/底层异常。恢复后明确重试可保存。

旧4项检查全部失败，其中3命令失败、1实际回车窗口无反馈。修复首轮3命令通过，窗口仍失败后追到enter/return不匹配；修正后窗口2项通过，验证方向键选择+实际回车保存和真实配置冲突+Esc。最终合计5项定向，不重复通过的命令检查。strict
CLI types及相关lint通过；旧React默认导入仅作类型，lint提示后改type
FC/命名useState，单独lint通过。首格式化命令误以packages/cli为工作根，未匹配文件；随后在仓库根格式化成功，旧日志保持。

Evidence → Finding → Path：旧3命令拒绝/窗口Enter无效 →
F-076确认键不兼容与保存异常无本地反馈 → Enter统一/共用安全错误/窗口不关闭 →
3命令+2实际Ink按键通过。

工程证据位于C:/Users/Administrator/Documents/ChatGPT/gmncliu：effort-save-before-junit.xml/-before.log、effort-save-junit.xml/-log（首修命令3通过/窗口失败）、effort-save-dialog-junit.xml/-dialog.log（2通过）、effort-save-types.log、effort-save-final-types.log、effort-save-lint.log（首类型import
lint）、effort-save-dialog-final-lint.log、effort-save-final-lint.log。候选preview.76待本地打包和原生Windows
ConPTY核对；不为纯CLI改动重跑已通过的三平台逆向/协作检查，不冒称76新三平台验收。上一版75三平台分发证据保持。没有全量/冒烟，不合并master或正式Release。

## 本机交付结果

E-271：本地preview.76包实际Windows
ConPTY通过：/effort打开六档窗口、方向键选High并实际Enter保存；外部修改独立配置后再次Enter显示未保存且窗口保持可Esc退出，直接/effort
low亦本地返回冲突；原配置字节保持，/provider重开读取后Esc，再/effort
low成功，/quit自然退出0，无超时/0模型。无个人文件或真实端点调用；非跨平台新交互验收。

E-272：产品源0dcf4e74c25dabaf24a1e8f400d4d5b09339d974本地package:ultra构建preview.76，包/入口SHA、源码标识、六rg身份权限及随包安装文档版本核对通过；原生ConPTY所测stage的425文件逐一匹配归档。offline已有缓存安装7327ms/退出0，双命令76、425已安装文件匹配同一归档。包SHA256
9b2940e6a437e548bb4b44bc5828414527894f78196c78a07fda5cbf0dc11583，入口SHA256
437caeec6a7017ee8eb07a9cf8a48c88d3db80c93fada0fe0b8471dcfe139d49。首核对器误假定实现位于interactiveCli，实际公共chunk-OKJPOOYW，定位真实代码后修正并核对，原失败保留。个人locale/provider哈希保持75末值，ultra-tools.json仍未创建；旧包保留，无新CI、无全量/冒烟/付费或未变更链重复，75三平台证据保持而不称76三平台重新验收。WI-111/F-076交付，goal
active，不合并master或正式Release。

最终证据：effort76-conpty-result.json/-output.txt/-log、local-preview76-package-verification.json/-log/-first.log、global-local-preview76-install-result.json、global-install-local-preview76-full-result.json、effort-save-personal-config.json。验证脚本verify-effort76-conpty.mjs与verify-local-preview76.mjs保存于工程目录，产品源码报告/工程正式报告/Obsidian全文同步。
