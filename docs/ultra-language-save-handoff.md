# Gemini Ultra CLI 语言偏好保存失败交接

日期：2026-11-12。WI-112/E-273/F-077。前置preview.76已安装，持续goal
active。只修改CLI语言命令/窗口错误处理，不改个人配置、模型、数据库和逆向工具，0模型请求。

## 已复现问题

/language命令和LanguageDialog直接调用I18nManager.setLocale，写入异常时没有本地错误处理。真实文件系统夹具将独立locale.json暂替换为非空目录，旧命令在中英文均拒绝Promise，旧窗口渲染ERROR及底层绝对路径，不能给出正常重试反馈。3项旧回归实际失败，日志保留。

新增共用languageSaveError双语安全文案，不回显底层路径/错误。命令捕获保存异常后添加ERROR并返回，不reloadCommands或发成功消息；选择窗口就地显示红色错误、保持打开，可Esc退出或恢复写入条件后原位重试。底层setLocale原子写入顺序保持，失败不更改内存语言或通知订阅者、清理tmp，原配置和障碍目录marker保持。只有写入成功才更新locale并通知，窗口才关闭。

3项定向通过：中英文命令保存失败、通知/刷新不触发/路径不泄露/原文件保持、恢复后成功；实际Ink按键方向键和Enter触发失败后，原位Enter重试切中文并保存。strict
CLI types及相关lint通过；无全量/冒烟或重复旧推理强度/协作/逆向检查。

Evidence → Finding → Path：旧3回归失败（命令Promise拒绝、窗口ERROR私有路径） →
F-077语言保存异常无本地反馈 → 共用安全错误/窗口可重试/仅成功刷新 →
3定向与隔离实际按键检查。

工程证据C:/Users/Administrator/Documents/ChatGPT/gmncliu：language-save-before-junit.xml/-before.log、language-save-junit.xml/-log、language-save-types.log、language-save-lint.log。候选preview.77待本地打包与Windows
ConPTY；不将此前75三平台分发证据冒称77三平台新验收，无新CI，不合并master或正式Release。
