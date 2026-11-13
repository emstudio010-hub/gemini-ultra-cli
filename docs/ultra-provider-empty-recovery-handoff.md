# Gemini Ultra CLI 空配置与手填模型恢复交接

日期：2026-11-13。WI-181 / E-415至416 / F-138。源码基线35453309c7b8d0567a05d1f6b574732ba0b2c0b5，分支codex/ultra-agent-portable。上一goal turn有实际源码/Windows验证/同步进展，整体goal active。源码优先、Windows必要定向验证继续；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 源码改进

ProviderConfigDialog原新建供应商选完协议立即handleFetchModels，手填模型也产生一次不需要的目录请求；删除最后供应商后回到没有目标的完整菜单。两者增加空配置恢复步骤和不必要的端点依赖。

现新建协议确认后直接进入模型清单/手填页，中英文说明“输入模型名保存；Ctrl+R获取目录；尚未连接端点或保存当前草案”。只有用户显式Ctrl+R才调用现有有界目录接口，七秒期限、取消、late-result隔离、自定义headers和错误回退保持。刷新统一合并目录、保留用户选择/手填文本、不自动全选新模型，删除已无消费者的自动加载/全选分支。手填模型保存时不拉目录。

删除最后一家（仍经现有确认页）后立即startEditBasics，清空旧name/url/key、模型池/选择/文本并重置光标，直接添加替代供应商；不自动选择原生端点或发送模型请求。用户可Esc取消，现有/provider关闭恢复提示与严格失效路由保护保持。替代配置保存并明确激活后，关闭才沿既有机制切换本次模型。无新增审批/安装/依赖。

只改CLI ProviderConfigDialog.tsx及新增ProviderEmptyRecovery.test.tsx，core/配置文件格式/认证策略保持。/provider add没有模型参数时的显式目录发现语义未改。本阶段为配置体验收敛，不冒称新修复了之前已存在的路由拒绝或推理准确性。

## E-415 相关检查

聚合5个不同场景通过：新空配置手填零目录、显式Ctrl+R且取消未保存/late结果丢弃、删除最后一家后干净表单并手填替代3项，以及既有目录刷新保留草稿/不勾选新远程模型、重复刷新合并和退出取消2项。首轮4通过1失败是新增测试错误地断言Endpoint Credentials，实际原页面标题Endpoint & Key；修正夹具后只重验该1项，原失败JUnit/log保留，不宣称旧产品失败复现。

CLI严格tsc、两文件eslint --max-warnings 0、最终prettier --check、git diff --check退出0。首格式检查指出上述断言行格式，prettier纠正后通过。core无改动不重复编译；不跑全量/冒烟或未改场景。一次补丁通用上下文误把updated.length插到模型保存分支，写后即时源码核对发现并纠正，未执行该中间版本，未留未定义变量。

## E-416 Windows实际终端闭环

Node v24.19.0实际编译CLI ConPTY/Config/ProviderManager，专用profile/workspace、假凭据、空.gemini/.env隔离祖先环境；观察wrapper只记录initialize/setModel，不替换行为。

10步实际操作：以唯一Last供应商临时路由启动→/provider确认删除Last→直接出现空白Add New Provider表单，保存providers=[]且当前last模型未隐式改变→输入Replacement/loopback端点/假key→选Chat协议→手填manual-model并保存（此时0目录/0模型请求）→关闭窗口明确切换replacement:manual-model→显式发送RECOVERY_PING→新端点实际OpenAI SSE返回REPLACEMENT_READY→/language中文/provider list仅显示新配置→正常quit。

17条件true，18279ms，真实CLI与验证器退出0。模型目录请求0，仅在用户发送消息后1条本地模型协议请求，URL为/replacement/v1/chat/completions、model=manual-model；无外部/付费模型。provider只保存新替代配置，settings字节保持，唯一setModel为替代配置明确激活。实际证明空配置恢复后能经过真实网关收到受控回复，不证明供应商推理质量。

ConPTY finally的既有console-list-agent对退出console发AttachConsole failed诊断，log原样保留；未修改产品或全局node-pty抑制它，且验证器自然退出0、核对无残留本验证器/console-list进程。未覆盖真实登录、目录成功服务、其他协议真实供应商、跨机器或最终包验收。

证据根：C:/Users/Administrator/Documents/ChatGPT/gmncliu
- provider-empty-recovery-test.log/-junit.xml（4通过1fixture标题失败）、-final-test.log/-final-junit.xml（只重验修夹具1通过）。
- provider-empty-recovery-cli-compile.log/-final-cli-compile.log、-lint.log/-final-lint.log、-format.log/-final-format.log、-format-check.log/-final-format-check.log。
- verify-source-provider-empty-recovery.mjs、source-provider-empty-recovery.log/-result.json/-terminal-output.txt。
- check-provider-empty-recovery-evidence.mjs、provider-empty-recovery-evidence-summary.json；verify-provider-empty-recovery-preservation.mjs、source-provider-empty-recovery-preservation.json。

F-138 -> ProviderConfigDialog新建/删空流程：手填前默认产生目录请求，删空后不进入添加引导。手填优先/显式刷新、干净添加表单及真实替代请求闭环完成此本地体验改进。删除真实配置仍是用户明确确认行为，产品不替用户还原被删provider；临时测试只操作独立fixture配置。

## 保全与接续

preservation passed=true：个人provider/locale/config/skill-tags.json精确SHA保持，ultra-tools.json不存在，全局preview.83；没有修改个人数据库、真实凭据、工具安装或PATH。旧E-294/E-364真实失败文件SHA及passed=false保持，不覆盖、不付费重跑，不用本轮受控回复替代复杂Agent真实任务质量验收。

沿用granted case work/gemini-ultra-agent-20261110/PRIMARY R26/code-audit，lead/cae/doc同会话，无Codex子代理；UI沿用既有Ink/theme和baseline规范，无新动效/依赖。终端/服务退出后核对专用mkdtemp父目录/前缀清理。目标池及case四项同步，源码/工程/Obsidian三份全文SHA一致；显式stage本轮文件，skip ci提交推codex隔离分支，不合并master或Release。

配置恢复主链本地已收敛，继续完善Agent实际交付与功能边界。复杂真实模型质量、最终Windows和macOS/Linux统一包仍未验收；整体goal active，仍按源码→Windows必要检查→最后统一打包顺序。
