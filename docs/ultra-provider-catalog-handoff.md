# Gemini Ultra CLI 模型目录有界加载交接

日期：2026-11-12。WI-110/E-267/F-075。当前安装preview.74，持续goal
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

工程证据在C:/Users/Administrator/Documents/ChatGPT/gmncliu：provider-catalog-before-stopped.log、provider-catalog-before-junit.xml/-before.log、provider-catalog-first.log、provider-catalog-final-junit.xml/-final.log、provider-catalog-types.log（首次类型错误）、provider-catalog-lint.log、provider-catalog-build-first.log/-build.log、provider-catalog-script-lint.log、provider-catalog-source.json/-source.log。候选preview.75待provider-catalog范围三平台及本机安装，旧74及以前证据保持，不合并master或正式Release。
