# Gemini Ultra CLI 语言偏好保存失败交接

日期：2026-11-12。WI-112/E-273/F-077。preview.77已安装，持续goal
active。只修改CLI语言命令/窗口错误处理，不改个人配置、模型、数据库和逆向工具，0模型请求。

## 已复现问题

/language命令和LanguageDialog直接调用I18nManager.setLocale，写入异常时没有本地错误处理。真实文件系统夹具将独立locale.json暂替换为非空目录，旧命令在中英文均拒绝Promise，旧窗口渲染ERROR及底层绝对路径，不能给出正常重试反馈。3项旧回归实际失败，日志保留。

新增共用languageSaveError双语安全文案，不回显底层路径/错误。命令捕获保存异常后添加ERROR并返回，不reloadCommands或发成功消息；选择窗口就地显示红色错误、保持打开，可Esc退出或恢复写入条件后原位重试。底层setLocale原子写入顺序保持，失败不更改内存语言或通知订阅者、清理tmp，原配置和障碍目录marker保持。只有写入成功才更新locale并通知，窗口才关闭。

3项定向通过：中英文命令保存失败、通知/刷新不触发/路径不泄露/原文件保持、恢复后成功；实际Ink按键方向键和Enter触发失败后，原位Enter重试切中文并保存。strict
CLI types及相关lint通过；无全量/冒烟或重复旧推理强度/协作/逆向检查。

Evidence → Finding → Path：旧3回归失败（命令Promise拒绝、窗口ERROR私有路径） →
F-077语言保存异常无本地反馈 → 共用安全错误/窗口可重试/仅成功刷新 →
3定向与隔离实际按键检查。

工程证据C:/Users/Administrator/Documents/ChatGPT/gmncliu：language-save-before-junit.xml/-before.log、language-save-junit.xml/-log、language-save-types.log、language-save-lint.log。preview.77本地打包与Windows ConPTY已完成；不将此前75三平台分发证据冒称77三平台新验收，无新CI，不合并master或正式Release。

## 本机交付结果

E-274：本地preview.77包实际Windows
ConPTY通过：独立locale文件被非空目录阻挡后/language
zh本地错误、窗口选择中文+Enter也显示安全错误，当前English与marker保持，不回显私有路径；恢复文件后窗口原位Enter保存中文，再/language
en成功并/quit自然退出0，无超时/0模型。不是个人配置故障实测，也不是77三平台交互验收。

E-275：产品源d4dad4efefb548caede18d20e661d6b1a1ad862a本地package:ultra构建preview.77，包/入口SHA、源码身份、六rg身份权限和随包文档版本核对通过；原生ConPTY所测stage的425文件逐一匹配归档。offline已有缓存安装7340ms/退出0，双命令77、425已安装文件匹配同一归档。包SHA256
7bb1f33465fdc513c9bb1bf554581768b3d5b7e9a4cfd6d4e7511ea3fa692693，入口SHA256
4246d3472d85ddda7ea107f83a763966780d449b01e5dde1d96e1d6da71092d3。个人locale/provider哈希保持76末值，ultra-tools.json仍未创建，旧包保留。无新CI、全量/冒烟/付费或未变更链重复；75三平台基线保持，不冒称77三平台新验收。WI-112/F-077交付，goal
active，不合并master或正式Release。

最终证据：language77-conpty-result.json/-output.txt/-log、local-preview77-package-verification.json/-log、global-local-preview77-install-result.json、global-install-local-preview77-full-result.json、language-save-personal-config.json。验证脚本verify-language77-conpty.mjs与verify-local-preview77.mjs保存于工程目录，源码报告/工程正式报告/Obsidian全文同步。
