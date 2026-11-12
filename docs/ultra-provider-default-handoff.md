# Gemini Ultra CLI 模型清单默认选择保持交接

日期：2026-11-12。WI-113/E-276/F-078。preview.78已安装，goal
active。本阶段修改CLI供应商模型清单保存行为，0付费模型，不改个人配置/数据库/逆向工具。

## 实际问题与修复

ProviderConfigDialog保存已有模型清单时无条件设置defaultModel=cleanModels[0]。例如模型列表first-model/preferred-model、默认为第二项，用户仅打开清单再Enter即将默认改为first-model，当前活跃供应商还会随之改activeModel。两个实际Ink路径在旧源码失败：活跃和未活跃供应商保存均丢默认；默认不等于列表首项是ProviderManager合法状态。

现在若原默认仍在最终选中列表中则保留；明确取消该模型后回退到第一个剩余模型。新建供应商采用首项、空列表拒绝、手填追加/去重及现有保存冲突处理保持。活跃/未活跃供应商含义不变，不修改其他端点、协议、推理参数或全局模型选择机制。目录失败反馈前缀在英文界面改为Notice，中文为提示；后端错误正文仍保留其原语言，不声称整个错误系统完成双语改造。

3项实际Ink按键场景：打开主菜单、两次Down选择模型清单、Enter保存；活跃及未活跃的非首项默认保持；明确取消原默认后回退剩余首项并同步active。前两项旧源码实际失败，新实现3项通过。原清单打开/保存均不fetch目录。strict
CLI types/lint通过，不运行全量/冒烟或其他未变更功能检查。

Evidence → Finding → Path：旧2回归失败 →
F-078无修改保存悄悄改默认/活跃模型 → 保留仍被选择的默认 →
3实际Ink路径及原生Windows终端定向。

工程证据位于C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-default-before-junit.xml/-before.log、provider-default-junit.xml/-log、provider-default-types.log、provider-default-lint.log。preview.78本地打包与ConPTY已完成；75三平台基线保持，不称78新三平台验收，不重跑真实模型/逆向协作，不合并master或正式Release。

## 本机交付结果

E-277：本地preview.78实际Windows
ConPTY：/provider两次Down进入模型清单、Enter无修改保存，非首项preferred默认/active/列表顺序均保持；再次进入清单明确取消preferred后仅剩first，默认和active均回退first；另一个供应商原字段保持，Esc回终端并/quit自然退出0，无超时、0模型/目录/外部请求。首观察器未给未编辑供应商预置已有加载正规化imageModels:[]，导致字节对象比较失败；原结果与PTY保留，夹具补同一正规化空字段后通过，没有改产品或弱化字段比对。

E-278：产品源83984380699031e045b5ce1cb319e056a6c0fca8本地package:ultra构建preview.78，包/入口SHA、源码身份、六rg身份权限和随包文档版本核对通过；原生所测stage的425文件匹配归档。offline已有缓存安装7297ms/退出0，双命令78、425已安装文件匹配同一归档。包SHA256
9f0e8c257d3757d77d43e8459645f07de8a08a18fdcf77276c2ad8ad9bd35359，入口SHA256
b9b2079c1223d4ad55f8614376ed7f824035cb7422b4cbfe6bf4d81df6bdf64c。个人locale/provider哈希保持77末值，ultra-tools.json仍未创建，旧包保留。无新CI/全量/冒烟/付费或未变更逆向协作链重复；75三平台基线保持而不称78新三平台验收。WI-113/F-078交付，goal
active，不合并master或正式Release。

最终证据：provider78-conpty-result.json/-output.txt/-log、provider78-conpty-first-result.json/-first-output.txt/-first.log、local-preview78-package-verification.json/-log、global-local-preview78-install-result.json、global-install-local-preview78-full-result.json、provider-default-personal-config.json。验证脚本verify-provider78-conpty.mjs与verify-local-preview78.mjs保存在工程目录，源码报告/工程正式报告/Obsidian全文同步。
