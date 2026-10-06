# YouTube 去广告 + 第三方下载菜单（Quantumult X，合并版）

[去广告片段](../YouTube/README.md) 和 [下载菜单片段](../YouTubeDownload/YouTubeDownloadMenu.snippet) 都要处理首页响应。设备实测两者同时启用时只有一个生效，只能二选一。合并版把两者接在一起：首页响应先去广告，再加入“下载视频”“下载音频”菜单。

```text
https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTubePlus/YouTubePlus.snippet
```

用它替代另外两个片段，三者不要同时启用。安装条件与去广告片段相同（MitM、证书、`udp_drop_list = 443`）。

## 组成

| 规则 | 脚本 | 说明 |
| --- | --- | --- |
| 播放请求、初始化空视频 | `YouTube/dist/request.min.js` | 直接沿用去广告版，没有另外生成 |
| 各类响应 | `YouTubePlus/dist/response.min.js` | 合并包：去广告模块加上原样打包的 `YouTubeDownloadMenu.js` |
| 下载站代发 | `YouTubeDownload/YouTubeDownloadPost.js` | 直接沿用下载菜单版 |

`YouTubePlus.snippet` 和 `dist/response.min.js` 由 `loon/YouTube/tools/build.mjs` 自动生成，不手工修改。去广告源码、`options.json`、去广告片段或 `YouTubeDownload/` 有改动后，在 `loon/YouTube/` 运行 `pnpm run build`，合并版随之更新；原有的去广告产物和独立的下载菜单脚本不受影响。

## 行为

- `browse`、`search`、`next`、`get_watch` 的 Protobuf 响应经过两步处理；`player`、Shorts 及 JSON 响应与去广告版完全相同。
- 两步互相独立：一步没有改动或放行时，另一步的结果照常生效；都没有改动时响应原样放行。
- 重写记录里这四类条目各有一行 `[YouTubeDownloadMenu x.y.z] 接口名 added=N removed=M sheet=K`：N 为加了菜单的视频卡片数，M 为移除的原有菜单项数，K 为改写的当前视频“⋯”面板数。
- 下载菜单覆盖首页、搜索首屏、播放页推荐列表的视频卡片，以及播放页当前视频的“⋯”面板；下载站地址见 `YouTubeDownloadMenu.js`。

## 验证

测试核对：合并版对首页响应的输出，与“先运行去广告版、再把结果交给独立菜单脚本”的输出逐字节一致；其余接口与去广告版逐字节一致。

设备反馈（2026-10-06，iPhone 17，iOS 26.6.2，YouTube 21.29.3）：合并版下，首页、搜索首屏的广告和 Shorts 推荐区被清理，首页、搜索首屏、播放页推荐列表的视频菜单和当前视频的“⋯”面板均出现“下载视频”“下载音频”，图标正常。搜索续页尚未处理。
