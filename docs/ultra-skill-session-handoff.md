# Gemini Ultra CLI 技能会话真实激活交接

日期：2026-11-13。WI-150 / E-353至354 / F-108。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装preview.83保持；无打包、重装、版本变化或跨平台CI。

## 修复

/skills launch原特殊会话仅处理return，当前终端Enter不推进；强度仅low至max五档，Tab预览直接保存配置；网关认证默认列出/选中无法使用的原生模型，界面固定中英混排。更关键的是成功回调只activateSkill标记与展示“已挂载”，从未将技能正文送入聊天上下文。

现窗口复用getEffortOptions/useLocale，六档包含Ultra/极尽详尽，草稿在本地，Tab与取消均不写配置；支持enter/return，默认保留当前可用模型、网关只显示已配置外接限定路由。两步均按当前语言展示。按P显式工具巡检，避免窗口挂载时执行同步定位器；巡检拒绝可见且可重试。分类只在skill变化时计算，避免每按键扫描正文。激活异步期间防重复提交，失败保留窗口、草稿与可重试提示，不输出底层私有错误。

新增startSkillSession：重新检查技能启用/管理策略、模型和聊天就绪，保存确认后的effort，添加技能资源目录，把包含完整skill.body/名称/路径的用户选择说明通过真实GeminiClient.addHistory加入当前聊天，模型临时切换，最后才标记技能active及显示成功。保留既有任务/聊天历史，不新建独立会话、不自动生成模型回复，后续用户输入沿当前会话继续。/skills launch不再保存全局模型偏好；供应商主选择不变。effort保存冲突使用原ProviderConfigConflictError指引，明确重新打开/provider，不误导仅重开技能窗口。

## Evidence → Finding → Path

E-353：2项旧组件场景均失败，分别真实Enter没有onConfirm、缺Ultra；另有原自动preflight引起act警告，保留旧日志，不能把警告当独立产品证据。修后4项UI和5项服务定向全部通过：Enter、六档预览/取消字节保持、语言往返/P按需检查、异步失败/重复Enter/重试；完整正文/资源和临时模型送达、网关原生拒绝、禁用技能拒绝、effort冲突前无注入/激活、历史送达失败明确effort可能已保存。后续冲突提示小改仅重验该1项通过，无全量/冒烟。

CLI严格源码编译及最终5文件eslint退出0。首lint四处one-var风格失败，自动拆分后格式化/最终lint通过；最后冲突提示再编译和两文件lint退出0。git diff --check通过。命令：packages/cli下npx vitest run src/services/skillSession.test.ts src/ui/components/SkillSpecialSessionDialog.test.tsx --coverage.enabled=false；冲突提示仅同服务-t effort-conflict；根目录npx tsc -p packages/cli/tsconfig.json，eslint只上述两服务/两组件文件与skillsCommand.ts。

E-354：Windows Node v24.19.0实际编译源码CLI/核心、隔离home/workspace技能、ConPTY真实/skills launch。英文两步Enter/Tab至Ultra/Esc取消无写入；/language中文后再次Enter/Tab/Down/Enter激活second:shared与ultra，旧任务历史保持、完整正文只注入一次、资源可读、settings字节保持，provider仅effort变化。下一用户输入经真实协议适配器唯一请求发送至loopback第二供应商/shared，实际messages同时包含原任务标记、完整技能标记与后续输入，本地SSE返回固定确认后/quit自然退出0。10步骤/17条件通过、14359ms/验证器退出0，1次loopback、0外部/付费模型请求。

preload只用真实addHistory预置一条无害原任务并观察原Config.initialize/SkillManager.activateSkill，未替换技能启动/发送/保存行为；它不能证明模型理解质量。首Windows本地流程14条件中13通过，配置比较因ProviderManager规范化imageModels为空数组及JSON属性顺序未通过，所有产品步骤与退出0；修观察器初始化规范字段并按结构比较后零请求流程13380ms通过，再增加上述唯一loopback实际发送证据。旧失败、通过对照及终端文本保留，没有为夹具改变产品。最后冲突提示只有文案与类型分支，未重跑已通过终端业务链。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：skill-session-before.log/-before-junit.xml、skill-session-ui-test.log/-ui-junit.xml、skill-session-final-test.log/-final-junit.xml、source-compile/final-source-compile/final-lint/fix-lint及format日志、skill-session-conflict-final-test/compile/lint.log；verify-source-skill-session.mjs、observe-source-skill-session.mjs、source-skill-session-result.json/-final.log/-terminal-output.txt，normalization-first及local-only保留记录。验证器不随包分发。

## 边界与接续

本轮为自有TypeScript CLI会话逻辑，沿用既有case lead/cae/doc与报告格式；没有实际安全目标或原生分析。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，ultra-tools.json仍不存在。未安装工具/修改PATH或数据库。

不是跨文件原子事务：effort已保存后若资源/历史操作失败，提示部分状态可能已保存；技能资源目录可能已加入，历史送达后极晚期失败也不回滚正文。不自动加载整套工具、安装插件、授予红队权限或执行技能；只加入明确选择的技能正文和资源。P巡检底层报告仍含其原语言/探测局限，本轮没有将其当GPU/版本兼容证明或重跑真实巡检。无付费模型/原生逆向质量、最终包或跨平台新验收。

下一步源码收敛共享配额语言及更多会话/协作入口，复杂逆向/长会话质量仍待；最终再统一Windows/macOS/Linux打包。隔离codex分支同步skip ci，不合并master、不正式Release，goal保持active。
