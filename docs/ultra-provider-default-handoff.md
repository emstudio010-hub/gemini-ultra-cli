# Gemini Ultra CLI 模型清单默认选择保持交接

日期：2026-11-12。WI-113/E-276/F-078。前置preview.77，goal
active。本阶段修改CLI供应商模型清单保存行为，0付费模型，不改个人配置/数据库/逆向工具。

## 实际问题与修复

ProviderConfigDialog保存已有模型清单时无条件设置defaultModel=cleanModels[0]。例如模型列表first-model/preferred-model、默认为第二项，用户仅打开清单再Enter即将默认改为first-model，当前活跃供应商还会随之改activeModel。两个实际Ink路径在旧源码失败：活跃和未活跃供应商保存均丢默认；默认不等于列表首项是ProviderManager合法状态。

现在若原默认仍在最终选中列表中则保留；明确取消该模型后回退到第一个剩余模型。新建供应商采用首项、空列表拒绝、手填追加/去重及现有保存冲突处理保持。活跃/未活跃供应商含义不变，不修改其他端点、协议、推理参数或全局模型选择机制。目录失败反馈前缀在英文界面改为Notice，中文为提示；后端错误正文仍保留其原语言，不声称整个错误系统完成双语改造。

3项实际Ink按键场景：打开主菜单、两次Down选择模型清单、Enter保存；活跃及未活跃的非首项默认保持；明确取消原默认后回退剩余首项并同步active。前两项旧源码实际失败，新实现3项通过。原清单打开/保存均不fetch目录。strict
CLI types/lint通过，不运行全量/冒烟或其他未变更功能检查。

Evidence → Finding → Path：旧2回归失败 →
F-078无修改保存悄悄改默认/活跃模型 → 保留仍被选择的默认 →
3实际Ink路径及原生Windows终端定向。

工程证据位于C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-default-before-junit.xml/-before.log、provider-default-junit.xml/-log、provider-default-types.log、provider-default-lint.log。候选preview.78待本地打包与ConPTY；75三平台基线保持，不称78新三平台验收，不重跑真实模型/逆向协作，不合并master或正式Release。
