# YouTube 去广告（Quantumult X）

[Loon 版](../../loon/YouTube/README.md) 的 Quantumult X 移植，只保留去广告核心。两份脚本由 `loon/YouTube/src/` 的同一份源码构建，构建时包一层接口适配，不另外维护一套逻辑。

## 设备反馈（2026-10-06）

测试环境：iPhone 17，iOS 26.6.2，YouTube 21.29.3。用户在 Quantumult X 真机上使用当前构建（后台播放和隐藏首页 Shorts 已开启），反馈：

- 视频能正常播放；
- 片头／中插广告消失；
- 首页、推荐、搜索的赞助卡片和 Shorts 广告消失；
- 后台播放和隐藏首页 Shorts 生效。

这是整体使用效果的确认，没有逐视频统计、首帧计时或重写日志，不能据此承诺所有视频无广告或零启动等待，也不能单独证明下文每一项机制都已命中。本地测试另外证明：在模拟的 Quantumult X 接口下，清理结果与 Loon 发布包逐字节一致。

## 功能

| 功能 | 状态 |
| --- | --- |
| 播放器请求的广告协商字段清理（`player`、`get_watch`） | 固定启用 |
| `player/ad_break` 直接返回空 Protobuf | 固定启用 |
| 播放器响应的广告位清理 | 固定启用 |
| 首页、推荐、搜索的赞助卡片清理 | 固定启用；搜索结果的 Protobuf 响应自 YouTubeFeed 2.6.2 起支持，只覆盖搜索首屏 |
| Shorts 播放广告清理 | 固定启用 |
| 初始化 POST 返回空白视频（对应 Loon 的 `reject_video(200)`） | 固定启用 |
| 后台播放、隐藏首页 Shorts、播放请求地区 | 构建时由 `options.json` 决定；当前后台播放和隐藏首页 Shorts 已开启，地区保持 `original`。`hide_home_shorts` 在本版本同时隐藏搜索结果里的 Shorts 推荐区 |
| 日志工具、Onesie 配置缓存、媒体采样 | 未移植 |

## 安装

1. 在主配置 `[general]` 加入下面一行，让 YouTube 从 QUIC 回退到可解密的 TCP。它对所有 App 的 UDP 443 生效；不想全局生效时见下文「全局 `udp_drop_list` 的取舍」。

   ```text
   udp_drop_list = 443
   ```

2. 在重写引用里添加片段地址：

   ```text
   https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTube/YouTubeNoAds.snippet
   ```

3. 开启 MitM 和重写，安装并完全信任证书。
4. 删除或停用其他匹配 YouTube 的去广告重写，避免同一响应被处理两次。
5. 完全退出 YouTube 再打开。

片段和脚本地址指向 `falconchen/shell` 的 `main` 分支；本地改动推送后才会生效。更新后需要在 Quantumult X 里更新重写引用，让它重新下载片段和两份脚本。

## 全局 `udp_drop_list` 的取舍

去广告规则只对经 MitM 解密的 TCP 请求生效。YouTube App 会优先用 QUIC（UDP 443）访问 Google 域名，QUIC 走通时规则全部不命中，所以必须让 YouTube 的 UDP 443 走不通。有两种做法。

| | `udp_drop_list = 443` | YouTube 走 `udp-relay=false` 的节点 |
| --- | --- | --- |
| 影响范围 | 所有 App 的 UDP 443，HTTP/3 回退到 TCP | 只影响走该节点的流量 |
| 配置量 | `[general]` 一行 | 节点、策略组、分流三处 |
| 稳定性 | 换节点、换策略组都不受影响 | 任一处改动都可能失效，表现只是广告重新出现 |
| 验证情况 | 已随上面的设备反馈确认 | 按 Quantumult X 的 UDP 处理逻辑推出，未在设备上确认 |

默认用前者。只在介意其他 App 的 HTTP/3 被回退时改用后者。

### 改用 `udp-relay=false` 的节点

节点配置里的 `udp-relay` 决定是否允许 UDP 经该节点转发。设为 `false` 时，分流到该节点的 UDP 按 `[general]` 的 `fallback_udp_policy` 处理，默认拒绝，YouTube 随即回退到 TCP。

Quantumult X 的策略组不能按 `udp-relay` 筛选节点，只能按节点名（`server-tag-regex`）或订阅名（`resource-tag-regex`）筛，所以要先让关了 UDP 的节点在名字或来源上可区分。

**本地节点。** 复制一份节点，改为 `udp-relay=false`，tag 加标记；原节点保留给其他流量。

```text
[server_local]
vmess=...., fast-open=false, udp-relay=false, aead=true, tag=示例节点-noudp
```

**订阅节点。** 把同一订阅再添加一次，起单独的 tag（如 `机场-noudp`），用资源解析器统一关闭 UDP。使用 KOP-XIAO 的 `resource-parser.js` 时，在订阅地址后加 `#udp=-1`。

**策略组与分流。** 建一个只收这类节点的策略组，让 YouTube 分流指向它。

```text
[policy]
# 本地节点按名字筛；订阅节点改用 resource-tag-regex=noudp$
static=YouTube, server-tag-regex=noudp$

[filter_remote]
https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTube/YouTube.list, tag=YouTube, force-policy=YouTube, update-interval=172800, opt-parser=false, enabled=true
```

分流规则用本目录的 [YouTube.list](YouTube.list)，见下文「分流规则」。

改完后删除 `udp_drop_list = 443`。

### 生效条件

- 策略组里没有混入 `udp-relay=true` 的节点。
- `youtubei.googleapis.com`、`youtube.com`、`googlevideo.com` 三类域名都走这个策略组。本目录的 `YouTube.list` 已覆盖这三类；配置里如果另有 Google 规则先匹配到 `youtubei.googleapis.com`，它会走别的策略，去广告的接口规则不命中。
- `fallback_udp_policy` 保持默认，不设为 `direct`。设为 `direct` 后，能直连 Google 的网络下 QUIC 会走通；不能直连时要等超时才回退，起播变慢。

### 验证

删除 `udp_drop_list = 443` 后完全退出 YouTube 再打开，播放几个视频。片头广告消失，且重写日志里 `youtubei.googleapis.com` 的规则有命中记录，说明回退生效；没有命中记录说明 QUIC 仍在走通，按上面三条逐项检查。

`resource-tag-regex`、解析器的 `udp=-1` 和 `fallback_udp_policy` 的默认值未对照 Quantumult X 文档核实，写入配置后先确认策略组里列出的节点符合预期。

## 分流规则

[YouTube.list](YouTube.list) 是本仓库维护的 YouTube 分流规则，地址：

```text
https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTube/YouTube.list
```

文件分两部分：

- **第一部分**复制自 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) 的 `rule/QuantumultX/YouTube/YouTube.list`（上游版本 2025-06-06，GPL-2.0），规则行未改动。同步上游时整段替换，并更新文件头的版本时间和条数。
- **第二部分**是本仓库新增的规则。新规则只加在这里，不改第一部分。

规则里的策略名 `YouTube` 是占位，引用时用 `force-policy` 指定实际策略。只做去广告、不改用 `udp-relay=false` 节点时，不需要引用这份规则。

## 修改开关

Quantumult X 的重写片段没有插件参数界面，开关写在 `options.json`，构建时固定进脚本：

```json
{
  "background_playback": true,
  "hide_home_shorts": true,
  "playback_region": "original"
}
```

`playback_region` 可选 `original`、`CN`、`HK`、`TW`、`US`、`JP`、`KR`、`SG`、`GB`、`DE`、`RU`。修改后在 `loon/YouTube/` 重新构建并推送：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm run test
```

`dist/` 由构建生成，不手工修改。

## 调试版

排查漏掉的广告时，把重写引用换成调试片段，不要与正式片段同时启用：

```text
https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTube/YouTubeNoAds.debug.snippet
```

调试版与正式版的规则和处理逻辑相同，只多一项：脚本每处理一次请求或响应，输出一行处理结果。在 Quantumult X 的“重写”记录里点开对应条目，“日志”一栏可以看到，例如：

```text
[YouTubeFeed 2.6.1] browse changed: removed=1 adaptive_removed=0 format=protobuf opaque_elements=11 removed_eml=1 removed_dividers=1 hidden_shorts=0
```

输出只含计数、格式和版本号，不含正文、账号信息或视频内容。各模块版本号互相独立：首页信息流是 `YouTubeFeed`，播放相关是 `YouTubePlayback`。

| 现象 | 含义 |
| --- | --- |
| 广告出现前有 `browse pass`，且 `opaque_elements` 不为 0 | 卡片经过了脚本但布局未登记 |
| 广告出现前有 `browse pass`，且 `opaque_elements=0` | 外层结构未登记，脚本没有进入卡片 |
| 广告出现前后没有任何 `browse` 记录 | 请求没有经过脚本，先检查 MitM 和 QUIC 回退 |

补规则需要对应响应的原始内容：开启 Quantumult X 的 HTTP 抓取，导出广告出现前最近一条 `/youtubei/v1/browse`（或 `next`、`search`）请求。导出内容含登录凭据和推荐内容，只在本地分析，不要提交仓库。

`YouTubeNoAds.debug.snippet` 和 `dist/*.debug.min.js` 由构建自动生成，随正式版一起更新，不手工修改。

## 与 Loon 版的差异

| Loon | Quantumult X |
| --- | --- |
| 插件参数界面 | `options.json`，改动需重新构建 |
| `[Rule]` 只拒绝三个域名的 UDP 443 | `udp_drop_list = 443`，全局生效 |
| 原生 `reject_video(200)`，按方法和 User-Agent 匹配 | 请求脚本内判断 POST 与 `com.google.ios.youtube/`，返回 144 字节的无轨道 MP4 |
| 清除 googlevideo 响应的 `Alt-Svc` | 未移植 |
| 日志工具与导出页面 | 未移植 |

## 尚未单独确认的机制

整体效果已有上面的设备反馈；下面几项是其中未被单独观察到的环节，出现异常时可按此排查。

- **请求脚本直接应答。** `player/ad_break` 和初始化空视频都靠请求脚本用 `$done({status, headers, body})` 直接返回响应。Quantumult X 官方示例没有写明这一用法。如果初始化规则不生效，改用片段末尾注释里的 `reject-200` 备用行；`ad_break` 不生效时广告配置请求会照常发出。
- **空白视频内容。** Loon `reject_video` 返回的具体字节没有公开，这里用的是自行生成的无轨道 MP4。用户在 Quantumult X 上确认带此规则时播放正常，但没有单独对比去掉这条规则的效果。
- **请求正文压缩。** 如果 Quantumult X 交给脚本的播放器请求正文仍是 gzip 压缩的，脚本会原样放行，不影响播放，但请求侧的广告协商清理不生效。
- **JSON 正文。** Quantumult X 的脚本环境没有 `TextDecoder`，适配层对 JSON 类型使用字符串正文，Protobuf 使用 `bodyBytes`。

排查时先在 Quantumult X 的重写日志里确认三条规则是否命中，再看 YouTube 的表现。
