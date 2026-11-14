# Gemini Ultra CLI 模型目录取消交接

2026-11-15；WI-256 / E-567 / F-214；基线7637969ccb7c0a34efb91a32b182729dcf284bcf，分支codex/ultra-agent-portable。上一goal turn为progress（扩展首屏Windows链已验证）。goal active；源码→Windows必要定向验证→功能收敛后最终三平台包；preview.83保留，无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-214：ProviderManager.fetchModelsFromEndpoint已有8秒总上限、AbortSignal和2MiB响应体限制；CLI `/provider add`调用未传当前Agent Config生命周期，关闭会话后仍可能迟到返回。现传入可选 `context.services.agentContext?.config.getLifecycleSignal?.()`，无Config的旧命令上下文仍兼容。正常错误、超时、模型列表解析、配置原子保存与活动路由保持。

## E-567源码与定向证据

修改packages/cli/src/ui/commands/providerCommand.ts单点接线。CLI tsc build、providerCommand eslint与格式检查退出0；已有ProviderCatalog大小/取消及Drill cockpit目录取消测试保持通过，本轮未重跑全量或真实供应商。没有写入个人provider/locale/数据库/PATH。

## 保全与接续

个人文件/四旧真实失败SHA与false/ULQ凭据删除/全局83保全；三份同SHA交接和目标池/case同步后显式stage，skip ci推隔离分支，不合master/Release。下一继续认证/设置等待与双语、模型、演练台、多Agent功能收敛，goal保持active。
