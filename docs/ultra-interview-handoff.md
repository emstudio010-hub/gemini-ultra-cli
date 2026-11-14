# Gemini Ultra CLI 访谈需求连续性交接

日期2026-11-14。WI-208 / E-471至472 / F-166。基线e5d83d445bd5e1b4dd7d3eec69530ce982e0e55c，分支codex/ultra-agent-portable。上一goal turn为progress（配置选择/冲突恢复源码与Windows证据）。整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包；不打包/重装/升版本/多平台CI/付费任务重跑，全局preview.83保持。

## 实际缺口与源码

agentWorkflowCommands.ts的interviewPrompt只传objective/brief，省略持久化milestones/acceptance；恢复ready草案会回scoping，但模型未获得已经对齐的阶段验收。Grill me finish只传brief与验收，省略original objective，摘要未复述的原始约束可能在跨会话交接时丢失。数据记录本身未丢，这轮修的是模型接收的上下文，不是恢复不存在的旧问答。

仅改上述CLI命令源码：访谈初始及恢复提示加入已保存milestone草案，标注不是执行批准，要求保留原目标/明确约束/验收，只细化未决问题，不从短摘要推断约束已删除；旧记录缺少的早先答案不可编造。Grill me finish交接显式包含workflow ID、Original objective、Agreed brief、Acceptance，并说明仅访谈完成、实现/验收仍需完成。保持原本只读Plan、显式draft/approve或finish流程、预算与完成记录含义，不增加审批或模型调用。

## E-471 定向回归

新增一个实际命令状态链回归：创建Grill me、保存较短brief和两条验收、resume检查已存条目送达/Plan与未批准保持、重新保存ready后finish检查原始目标/brief/验收送达、记录访谈completed与默认权限恢复。修前该用例退出1，确实缺少恢复里程碑；修后整个命令相关文件28项通过，2670ms测试/31.12s总耗时，非性能基准。

CLI严格tsc、两个TS文件eslint --max-warnings0、最终Prettier及git diff --check退出0。core未改，不重复编译；无全量/冒烟、UI镜像测试或新依赖。新增用例使用实际持久化状态与命令处理，并非仅快照提示字符串。

## E-472 Windows编译源码与独立进程

verify-source-interview-handoff.mjs对Grill me与Teamwork分别创建独立home/workspace，每个模式两个独立Windows Node进程，真实Config.initialize、编译slash-command handler和draft_agent_workflow工具、真实保存记录/预算。第一个进程创建访谈并通过实际draft工具存较短brief/两条中文验收，未批准且ready；进程退出后第二个进程按ID resume，合法接管已退出owner，断言原目标/brief/全部里程碑与验收均进入提交提示、未隐式批准且Plan保持，再通过真实draft工具保存，最后由验证器明确调用finish/approve。

Grill me finish返回的继续任务提示包含原始中文约束/brief/两条验收；访谈记录completed且预算closed。Teamwork approve返回原目标/brief和原生run_agent_workflow交接，保存ready/approved、预算active，未执行工作者。两个模式各7条件true，共14条件，累计请求计数仍0、0网络、无命令错误，28582ms/parent与全部子进程退出0。终于清理自有临时根。其明示approve/finish是验证器输入，不代表真实用户交互或模型自动获授权。

这是命令处理、持久化、跨进程接续和提示内容证明；没有真实LLM/ask_user问答、CLI渲染、实际工作者或业务交付，不证明模型已遵从新提示。此前未持久化的问答不可由此恢复。只导出固定夹具提示到工程证据，不读取或保存真实用户问题/凭据。

验证器首次运行有一处多余括号语法错误，发生在执行任何配置初始化前；保全source-interview-handoff-verifier-syntax-failure.log，仅修验证器并经node --check后完成上述运行，不把它计为产品失败。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：interview-handoff-before.log/-before-junit.xml；interview-handoff-tests.log/-junit.xml（28项）、-cli-compile.log、-lint.log、-format.log/-final-format.log；verify-source-interview-handoff.mjs、source-interview-handoff.log/-result.json、-verifier-syntax-failure.log；interview-handoff-grill-me-prepare.log/-resume.log/-prompts.json，teamwork对应三份；verify-interview-handoff-preservation.mjs、source-interview-handoff-preservation.json。

保全全true：个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83，E-294/E-364/E-466三次真实失败SHA和passed=false保持，E-466临时凭据仍已删。未改个人数据库/工具安装/PATH，旧被拒清理目录不动。沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。目标池/case四项和证据更新，三份交接同SHA；显式stage、skip ci推隔离分支，不合并master/Release。F-164真实复杂模型质量仍开放，goal active。
