# Gemini Ultra CLI 模型目录有界加载交接

日期：2026-11-12。WI-110/E-267/F-075。当前安装preview.75，持续goal
active；本阶段只修改供应商目录读取，个人配置、数据库及逆向工具保持，不调用付费模型。

## 已确认问题与修复

fetchModelsFromEndpoint已有超时/AbortSignal，但成功响应直接response.json()，没有正文大小边界。超大或持续发送的目录可导致无界缓冲；仅取消fetch
signal不能保证所有Response正文实现停止。预先取消仍会调用fetch。新增readProviderCatalog以2MiB字节上限在JSON.parse之前累计流数据，Content-Length超限提前取消，缺失/低报长度仍按实收字节限制；超限返回专用错误和手填模型建议，不静默截取目录。

正文读取监听同一超时/调用者取消signal并取消reader，finally释放监听和锁；预先取消在fetch前检查，HTTP错误响应也取消正文。正常UTF8跨块、字符串/id/name目录结构、模型去重和models/前缀处理保持。超限错误不回显正文、端点或密钥，已有通用网络错误脱敏逻辑保持。2MiB是目录传输解码后正文上限，不限制模型本身上下文长度；此功能不改变模型推理请求。

目录发现不写配置；配置窗口取消和手填路径沿用。8秒默认/窗口7秒超时保持。响应数值超限拒绝整个目录，用户可手填。并未保证第三方自定义fetch实现永远遵守取消，或从无法取消的网络栈撤回已经发送的字节；标准Web
Stream取消读取、正常fetch与loopback连接实际通过。

## 必要检查

旧实现定向6项中5失败/1正常通过（包含一次首项60秒超时），最终6项通过：声明超限、缺失/低报长度实际超限、停滞正文超时/取消、预取消零fetch、正常逐字节中文目录及配置无写入。首夹具误用无限连续数据，已按精确vitest进程停止并改固定3MiB；首声明正文未关闭也已改有限30ms关闭，原停止/失败日志保留，不声称一次完整无误复现。新实现首检查误要求已关闭流也触发底层cancel
hook，已修正为有界读取断言；标准流关闭后cancel不再调用底层hook。未把夹具错误当产品缺陷。

strict core build/types与相关lint通过。首build/types因测试Header
union含undefined不符合HeadersInit失败，改用真实Headers实例后core
build通过；产品解析代码未受该类型修正影响。只有这些改动相关检查，没有全量/冒烟或旧启动/协作/逆向链重跑。

verify-ultra-provider-catalog.mjs加载实际ProviderManager与独立profile，5个loopback
GET验证声明超限、流式超限、正文停滞超时、收到header后显式取消、正常中文目录；预取消不产生第6请求，三个停滞连接实际关闭。当前保存供应商文件字节及active模型保持，0外部/模型请求。源码链通过，安装包三平台将使用相同脚本；不会探测个人模型端点。

Evidence → Finding → Path：无界response.json及旧5失败 →
F-075目录正文无界/取消覆盖不足 → 字节上限流式读取与同signal取消 →
6定向、严格构建及实际loopback目录链。

工程证据在C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-catalog-before-stopped.log、provider-catalog-before-junit.xml/-before.log、provider-catalog-first.log、provider-catalog-final-junit.xml/-final.log、provider-catalog-types.log（首次类型错误）、provider-catalog-lint.log、provider-catalog-build-first.log/-build.log、provider-catalog-script-lint.log、provider-catalog-source.json/-source.log。preview.75已通过provider-catalog范围三平台检查并安装，旧74及以前证据保持，不合并master或正式Release。

## 三平台交付结果

E-268：产品源18a31c53088622e9f93fa504e8ed90605717eca5/run43219241298三平台provider-catalog范围completed/success；minimum-node、native-address-recheck及旧无关链skipped。独立核对三包版本75、源chunk、包/入口SHA、六rg身份权限及安装4基础工具。每平台实际安装包ProviderManager连接5个loopback目录GET，声明/实际流式超2MiB均拒绝，正文停滞超时、header后显式取消、预取消无第6请求、正常UTF8中文目录解析；三个停滞连接关闭，原配置字节及选择保持。0模型/外部端点请求，不重跑旧协作/逆向/启动或付费任务。

E-269：offline已有缓存安装7589ms/退出0，双命令preview.75，425文件匹配Windows
CI包。包SHA256
0c49bef63dd23d0fd1f5762eff5aeea5c7e0380d8e157f467b529621c5c0b9a4，入口SHA256
dbe66a077af29a8a86adc776962c5190c5ee2a81a45bca75974e58f2b3c07e36。旧包保留，个人locale/provider哈希保持74末值，ultra-tools.json仍未创建。WI-110/F-075目录有界加载和正文取消分发交付；2MiB限目录正文，不改变模型上下文/推理请求，目录过大可手填。无全量/冒烟/付费或未变更业务重跑，goal
active，不合并master或正式Release。

脚本首lint为Buffer未声明，补显式node:buffer导入后provider-catalog-script-final-lint.log退出0；仅脚本声明提交2b6cdec，产品包源仍18a31c5，没有重派构建或改动运行逻辑。最终构建已通过严格core编译；首次provider-catalog-types.log仅保存旧夹具Header类型错误。源码loopback成功记录在修复该类型后的产品输出基础上生成，最终脚本另外将取消时机改为收到header后，三平台验证此观察器版本。

最终证据：github-preview75-run.json、github-preview75-artifacts-result.json、github-preview75-artifacts-verification.log、github-run-43219241298/、global-preview75-install-result.json、global-install-github-preview75-full-result.json、provider-catalog-personal-config.json。源码、工程正式报告和Obsidian全文同步。
