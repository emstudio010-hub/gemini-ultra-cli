# Gemini Ultra CLI 配额显示语言与数据边界交接

日期：2026-11-13。WI-154 / E-361至362 / F-112。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装preview.83保持，无打包、重装、版本变化或跨平台CI。

## 修复

模型窗口用量行Resets和时间格式、状态栏QuotaDisplay及统计QuotaStatsInfo原固定英文；统计还固定宣称配额每天重置、/auth可升级。无效或已过期resetTime仍拼出空的resets in提示，NaN/负值/越界数值可显示NaN%/负百分比或200%等假精度。

三组件接入既有useLocale，默认标题/重置标签/小时分钟/已用与限额提示按中文或英文展示，模型ID与Pro/Flash品牌保持。formatResetTime增加可选locale参数，默认英文保持原其他调用语义，中文使用本机时区的中文24小时格式；自定义标题保留。共用quotaDisplay展示辅助校验，只对有限、非负、remaining不超过正limit的数值计算比例，模型bucket仅接受0至1的有限fraction，无效数据沿用无配额时不显示，不擅自夹成0或100%。

重置提示只在解析出有效未来时长时展示，未知/过期时间不拼空断言。统计文案改为供应商报告的上限与重置时间，不捏造日/周窗口；/auth提示只说明检查认证或选择可用账户/API key，不承诺升级能力。没有改供应商数据、配额记账/服务请求或刷新频率，没有新增轮询/动画依赖。

## Evidence → Finding → Path

E-361：7个旧组件场景全部失败：3区域语言往返、2种无效/过期时间提示、4种NaN/负剩余/剩余超限/负limit展示。修后7通过；另5项formatResetTime（含新增中文与4既有英文/过期对照）和4项原组件英文快照/空配额/重置/上限对照通过，共16项必要定向。旧英文快照逐字保持，无全量/冒烟。两个旧组件测试增加隔离locale profile避免读写个人偏好。CLI严格源码编译及9修改文件eslint退出0，git diff --check通过。

命令：packages/cli下npx vitest run src/ui/components/quotaLocale.test.tsx --coverage.enabled=false；formatters.test.ts、ModelQuotaDisplay.test.tsx及QuotaDisplay.test.tsx只按formatResetTime|renders quota information|renders nothing|render with reset time|terse limit reached过滤。根目录npx tsc -p packages/cli/tsconfig.json；eslint限相关3组件、3组件测试、formatters/测试和quotaDisplay辅助文件。

E-362：Windows Node v24.19.0实际编译源码CLI ConPTY。唯一真实loopback协议响应产生正常会话metrics，然后/model set auto仅临时切换以显示pool quota，不在auto上生成模型请求。preload只替换配额getters/refresh返回隔离fixture和发原quota事件，正文/模型命令/语言/实际渲染组件保持真实。依次/model英文、/stats model英文、/language中文、/model中文、/stats model中文、/language英文、/model英文、/quit；10步骤/10条件通过、18256ms、产品与验证器退出0，1次loopback、0外部/付费模型请求。配额区域85%、标题/重置/分钟/用量上限与供应商文案正确，非法fraction不显示200%；fixture/provider/settings字节保持，明确语言操作独立保存locale。

该配额是受控数据而非真实账户额度；本轮没有调用真实Google quota或外部供应商，不能证明账户等级/刷新准确性。原生终端文本确认了真实组件交互与显示，不是截图像素/全窗口视觉或全部Stats项目翻译。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：quota-locale-before.log/-before-junit.xml、quota-locale-test.log/-junit.xml、quota-locale-controls-test.log/-controls-junit.xml、quota-locale-source-compile.log/-lint.log及format日志；observe-source-quota-locale.mjs、verify-source-quota-locale.mjs、source-quota-locale-result.json/-final.log/-terminal-output.txt。验证器不随包分发。

## 边界与接续

本轮为既有Ink UI与展示数值边界，沿用ui-skills-root选定的baseline-ui最小上下文，复用现有控件和主题；未新增Web布局/依赖。既有case继续同会话lead/cae/doc记录，没有实际安全目标。home/workspace/providers/locale/tools/数据库路径隔离，个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人skill-tags保持33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10，ultra-tools.json仍不存在；不改个人账户、数据库或PATH。

校验位于展示层，不修订服务端quota payload、核心配额计算或汇总策略；异常信息仅不显示，不能据此认定账户无限额度。无定时倒计时，重置时间在正常重渲染时更新；保留原版模型配额列宽与时间截断，超长时间/极窄终端仍是既有布局边界。Stats的身份/Token/表格等其他固定英文项仍待收敛，不能宣称整个系统已全中文。复杂逆向/长会话质量与最终分发未整体完成，继续源码/Windows必要验证，最终才统一Windows/macOS/Linux包；隔离codex分支skip ci同步，不合并master或正式Release，goal保持active。
