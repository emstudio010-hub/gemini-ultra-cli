# Gemini Ultra CLI 模型目录显式刷新交接

日期：2026-11-12。WI-114/E-279。goal
active，前置preview.78；本阶段增加模型配置便利性，0付费模型，不改个人配置、数据库或逆向工具。

## 行为与必要检查

已有供应商此前只有本地清单编辑，没有发现端点新增模型的入口。现在进入/provider模型清单按Ctrl+R明确请求/models，使用当前供应商端点、协议和customHeaders；仅打开清单仍不联网。新建供应商首次发现保持原流程，之后也可显式刷新。

刷新合并目录并去重，保留已有本地模型、取消选择及手填内容，新模型默认不勾选；仍在选择中的原默认模型保持。目录只改变界面草稿，Enter保存才落盘。失败可继续手填保存；重复Ctrl+R不并发请求，Esc、卸载和有效Enter保存取消请求，迟到结果不更新离开的界面。沿用既有7秒/2MiB限制与安全错误消息。

旧实现首项实际Ink场景失败，新增Ctrl+R后3场景通过：显式发现/草稿不丢/原默认保持及customHeaders传递，失败保留选择并手填保存，重复请求合并与Esc取消/迟到隔离。strict
CLI typecheck及相关eslint退出0。不运行全量、冒烟、未变更协作/逆向链或付费任务。

工程证据位于C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-refresh-before-junit.xml/-before.log、provider-refresh-junit.xml/-log、provider-refresh-types.log、provider-refresh-lint.log。候选preview.79待本地打包、Windows
ConPTY及安装；preview.75为最近三平台基线，不将本机检查称为新三平台验收。不合并master，不正式Release。
