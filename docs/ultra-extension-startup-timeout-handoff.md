# Gemini Ultra CLI 扩展启动超时交接

2026-11-15；WI-254 / E-563至564 / F-212；基线d86ffc847d70cc9033b016a74b507076768b82fe，分支codex/ultra-agent-portable。上一goal turn为progress（worktree探测共享期限已推送）。goal active；源码→Windows必要定向验证→功能收敛后最终三平台包；preview.83保留，无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-212：完整loadCliConfig在交互启动中等待ExtensionManager.loadExtensions；扩展目录读取、配置构建或迟到条目可能无限占住首屏。现增加loadExtensionsForStartup共享5秒启动期限：正常完成返回原列表；超时返回undefined，调用方记录警告并改用SimpleExtensionLoader，迟到promise保留catch观察避免unhandled，不再阻塞加载/首屏。普通扩展解析错误仍原样抛出，不被误当超时；扩展命令路径仍直接调用原loadExtensions，不改变管理命令语义。

## E-563 源码证据

新增extensionStartup.test三项：快速加载返回同一列表并清timer；非合作promise在5秒边界返回undefined且迟到拒绝被观察；普通manifest错误原对象抛出。三项通过；CLI tsc build与两文件eslint零warning通过。Vitest日志显示3/3通过，transform/setup耗时来自CLI大型测试环境，测试本身68ms；非全量/冒烟。

## E-564 Windows边界

本阶段未重复长ConPTY真实认证启动，因为上一阶段已记录独立provider/auth导致整机观察超时，不能把该结果归因扩展。新增代码的Windows行为依赖与Node定时器/Promise相同，需下一次启动收敛时用含本地扩展fixture的实际CLI再验证扩展超时与首屏；本阶段不冒称整机启动完成。未修改个人provider/locale/数据库/PATH/工具安装。

## 保全与接续

目标池继续保留启动/加载、双语/模型、演练台、多Agent协作、红队逆向、最终分发六项目标。沿用granted R26 code-audit及docs-generator，lead/cae/doc同会话，三份交接和目标池/case同步后显式stage，skip ci推隔离分支，不合master/Release。个人文件/四旧真实失败SHA与false/ULQ凭据删除/全局83继续保全。下一步用隔离本地扩展 fixture 做一次 Windows CLI 首屏验证，再回用户功能收敛；goal保持active。
