# Gemini Ultra CLI 模型目录显式刷新交接

日期：2026-11-12。WI-114/E-279。goal
active，preview.79已安装；本阶段增加模型配置便利性，0付费模型，不改个人配置、数据库或逆向工具。

## 行为与必要检查

已有供应商此前只有本地清单编辑，没有发现端点新增模型的入口。现在进入/provider模型清单按Ctrl+R明确请求/models，使用当前供应商端点、协议和customHeaders；仅打开清单仍不联网。新建供应商首次发现保持原流程，之后也可显式刷新。

刷新合并目录并去重，保留已有本地模型、取消选择及手填内容，新模型默认不勾选；仍在选择中的原默认模型保持。目录只改变界面草稿，Enter保存才落盘。失败可继续手填保存；重复Ctrl+R不并发请求，Esc、卸载和有效Enter保存取消请求，迟到结果不更新离开的界面。沿用既有7秒/2MiB限制与安全错误消息。

旧实现首项实际Ink场景失败，新增Ctrl+R后3场景通过：显式发现/草稿不丢/原默认保持及customHeaders传递，失败保留选择并手填保存，重复请求合并与Esc取消/迟到隔离。strict
CLI typecheck及相关eslint退出0。不运行全量、冒烟、未变更协作/逆向链或付费任务。

工程证据位于C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-refresh-before-junit.xml/-before.log、provider-refresh-junit.xml/-log、provider-refresh-types.log、provider-refresh-lint.log。preview.79本地打包、Windows
ConPTY及安装已完成；preview.75为最近三平台基线，不将本机检查称为新三平台验收。不合并master，不正式Release。

## 本机交付结果

E-280：本地preview.79实际Windows
ConPTY通过：打开已有模型清单0目录请求，手填manual-local并取消first后Ctrl+R，远程新模型出现且未自动勾选，草稿未落盘；原默认/active保留，保存后手填与取消均保持。刷新使用既有自定义头，等待期间重复快捷键仅1次请求；另两次正文停滞分别在Enter保存与Esc返回时取消，服务端均观察到连接关闭。其他供应商保持，/quit自然退出0，无超时。共3次loopback目录GET、0模型/付费请求，不称跨平台或真实供应商验收。

E-281：产品源698cc1c05f0bd6f0ca940cb1d15a22a7e719a101本地package:ultra构建preview.79，包/入口SHA、源码身份、六rg身份权限和随包文档版本核对通过；原生所测stage的425文件匹配归档。offline已有缓存安装7347ms/退出0，双命令79、425已安装文件匹配同一归档。包SHA256
98f2a97948db75b01e21b0790e90de070dcffb586b9b9539ccb878797ccbe559，入口SHA256
84eafe94e59a642deef2155654c1ad56afdbcc363ad462b5f1182fe2df6ad3a2。个人locale/provider哈希保持78末值，ultra-tools.json仍未创建，旧包保留。无新CI/全量/冒烟/付费或未变更协作逆向链重复；75三平台基线保持，不称79新三平台验收。WI-114显式目录刷新交付，goal
active，不合并master或正式Release。

最终证据：provider79-conpty-result.json/-output.txt/-log、local-preview79-package-verification.json/-log、global-local-preview79-install-result.json、global-install-local-preview79-full-result.json、provider-refresh-personal-config.json。验证脚本verify-provider79-conpty.mjs与verify-local-preview79.mjs保存在工程目录，源码报告/工程正式报告/Obsidian全文同步。

下一阶段优先查看Swarm长任务恢复与可分发使用中尚未有证据的行为，依据真实缺陷再改动；已有协作付费任务和未受影响检查不重跑。整体上线验收仍未完成。
