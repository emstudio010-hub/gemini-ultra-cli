# Gemini Ultra CLI 演练台 Token 设置交接

日期2026-11-14。WI-203 / E-459至460 / F-160。基线5c47bc9c1ea45f008064421bba92ebccf5ec03df，分支codex/ultra-agent-portable。整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 源码

终端已有输出Token上限和上下文容量配置，演练台缺入口。drillCockpit.ts安全status投影新增两字段，保存/取模型共享schema只允许正安全整数、null或省略。省略保留原设置兼容旧客户端；显式null清除覆盖；正整数保存。既有第二项默认模型原被编辑请求重置第一项，改为保留仍在清单的默认项，显式默认优先、不可用时回退第一项。空key保留，隐藏headers/image/reasoning等配置由原ProviderManager合并保持。不改变当前供应商选中状态。

生成页新增原生details与两个有label/aria说明的number输入；编辑回填、空值发送null、本地正安全整数校验，双语帮助明确任务输出上限优先、容量适合本供应商全部模型并匹配实际支持。复用既有样式，无依赖。locale字典补齐，原位语言切换保留输入与展开状态。core未改，复用既有withProviderDefaults/getModelContextWindow。

## E-459 源码检查

CLI严格tsc首次和最终退出0，三文件eslint首次和最终--max-warnings 0退出0；服务/locale两文件Prettier检查和git diff --check退出0。生成页保留既有格式，仅修改行。实际HTTP生成页内联script经vm.Script解析通过。无新增镜像实现单元测试、全量或冒烟。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：cockpit-provider-limits-cli-compile.log、-final-cli-compile.log、-lint.log、-final-lint.log、-format.log。

## E-460 Windows实际链路

独立临时home/profile、假key、真实Drill HTTP服务和本地Chat端点。14条件全true，7739ms/退出0（非启动基准）；实际4个生成HTTP请求、10个非法保存请求全部400且provider文件逐字不变。status只公开两字段不泄漏假key；旧客户端省略保留；默认chosen非第一项仍保持；隐藏配置保持；1024/16384保存后真实生成max_tokens1024、容量16384，任务自身7优先；切第二供应商使用64/2048；null清除后实际请求不含两种max token字段、容量undefined。0任务提交、0外部请求。

首轮结果false源于验证器构造记录时显式添加值为undefined的属性，再用Object.hasOwn判断原始payload字段存在性；产品未因此修改。保全before-recorder-fix日志/结果后，改为在原始payload记录hasMaxTokens/hasMaxCompletionTokens，重跑通过。失败结果不覆盖。

实际CUA：选择primary并展开读1024/16384；切英文后provider选择/details展开/数值保持，标签英文；改2048/32768保存，切second再回primary值回填。独立磁盘检查值一致且默认chosen/假key保留。清空两字段保存，再切second回primary后空值；切中文后AX显示中文、同provider/展开/空字段保持。最后截图为工具内展示，未单独落盘；截图时英文画面与中文AX有绘制时序差异，不把截图作中文绘制证据。

finish后retention passed=true，默认与key保留、两覆盖清除、4受控请求/0提交外部；脚本退出0，finally停止自有服务并清理临时根。个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、旧E-294/E-364原失败SHA及passed=false保全全部true。

证据：verify-source-cockpit-provider-limits.mjs、source-cockpit-provider-limits.log/-result.json、-before-recorder-fix.log/-before-recorder-fix-result.json；finish-cockpit-provider-limits.mjs、cockpit-provider-limits-browser-observed.json、-browser-retention.json；verify-cockpit-provider-limits-preservation.mjs、source-cockpit-provider-limits-preservation.json。临时browser-live含临时定位信息，不作为公开访问地址。

F-160 -> 演练台无法配置已有Token覆盖，编辑重置非首项默认模型。此轮补齐入口及兼容/保留逻辑。未验证真实供应商支持容量、付费模型质量、ConPTY或安装包；上下文数值为用户覆盖，不自动发现实际容量。异步保存与供应商切换的迟到结果归属仍待审查。

## 接续

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。UI沿用ui-skills-root与baseline-ui，无新依赖。目标池/case四项与证据更新、三份交接同SHA，显式stage并skip ci推隔离分支，不合并master/Release。继续源码功能收敛，整体goal active。
