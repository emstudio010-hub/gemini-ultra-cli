# Gemini Ultra CLI 扩展首屏 Windows 验证交接

2026-11-15；WI-255 / E-565至566 / F-213；基线13ddfe6756d61ef770e413549547111390a9690e，分支codex/ultra-agent-portable。上一goal turn为progress（扩展发现5秒上限已推送）。goal active；源码→Windows必要定向验证→功能收敛后最终三平台包；preview.83保留，无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-213：用编译后的CLI config入口和隔离Windows profile/workspace，替换ExtensionManager.loadExtensions为不返回的本地fixture，验证新增启动上限在真实loadCliConfig链上生效。配置构造约5.6秒后返回，记录警告并使用SimpleExtensionLoader；迟到fixture promise被catch观察，无模型/供应商/外部网络请求。

## E-565 源码证据

保留WI-254的extensionStartup.test三项：快速列表、5秒迟到拒绝、普通错误原对象；3/3通过。CLI tsc build与config/extensionStartup两文件eslint零warning，格式检查通过。没有全量或冒烟。

## E-566 Windows实际入口

verify-source-startup-extension.mjs使用真实编译dist的createTestMergedSettings/parseArguments/loadCliConfig/ExtensionManager原型，隔离home/workspace和独立process环境；仅把ExtensionManager.loadExtensions替换为本地不合作Promise，不触发真实第三方扩展。loadCliConfig实际走worktree/settings/policy/config构造，约5600ms后返回，checks四项全true：continuesAfterStalledExtensionDiscovery、configReturnsWithSimpleLoader、noModelDispatch、lateExtensionPromiseObserved。日志和result保存在source-startup-extension-windows.log/result.json；0外部请求/provider个人配置不触达。

边界：这是实际compiled loadCliConfig链的超时和fallback验收，不是实际第三方扩展代码、扩展MCP或整机ConPTY认证冷启动验收；上阶段整机观察仍因独立provider/auth超时而单列。最终分发和复杂Agent质量未完成。

## 保全与接续

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四旧真实失败passed=false与SHA、ULQ临时凭据删除继续保全。三份交接/目标池/case同步后显式stage，skip ci推隔离分支，不合master/Release。下一项继续处理认证/设置加载等待，再回双语、模型配置、演练台与多Agent协作收敛，goal保持active。
