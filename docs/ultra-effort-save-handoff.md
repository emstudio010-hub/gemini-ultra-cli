# Gemini Ultra CLI 推理强度确认与保存失败交接

日期：2026-11-12。WI-111/E-270/F-076。持续goal
active。前置preview.75已安装。本阶段只修改CLI命令/Ink窗口错误处理及按键识别，不改个人模型、语言、数据库或逆向工具，不调用模型。

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
