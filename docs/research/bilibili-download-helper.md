# 哔哩哔哩下载助手的下载流程

2026-10-21 只读核对了本机 Chrome 中的「哔哩哔哩下载助手」1.5.8，扩展 ID 为 `djinnjdnedmcilpnboifdhfgbbhgieee`。以下结论来自实际安装包中的 JavaScript 和规则文件。

## 实际调用链

| 文件 / 方法 | 职责 |
| --- | --- |
| `js/video_bilibili_accessible.js` | 从页面的 `__INITIAL_STATE__` 或 `__playinfo__` 读取视频信息，通过页面消息交给内容脚本。 |
| `js/popup.js` → `getVideoInfo` | 根据 BV/AV 号、`cid` 和 URL 的 `p` 选中当前分 P，发起两种播放地址请求。 |
| `js/background.js` → `request` 消息处理 | 使用 `fetch` 请求传入的 B 站接口地址，把 JSON 响应返回给弹窗。 |
| `js/popup.js` → `getvideos` | 渲染带声音的视频、纯视频、纯音频和封面链接，点击后打开地址。内容脚本中也有同类入口。 |
| `rules.json` | 对匹配的 B 站媒体地址设置 `Referer: https://www.bilibili.com` 和 `Content-Disposition: attachment`。 |

带声音的视频请求：

```text
https://api.bilibili.com/x/player/playurl?cid=…&bvid=…&qn=…&otype=json&fourk=1
```

从 `accept_quality`、`accept_description` 生成清晰度选项，点击其他清晰度时重新请求。原插件使用 `durl[0].url` 作为下载地址。

独立音视频请求：

```text
https://api.bilibili.com/x/player/playurl?cid=…&bvid=…&qn=…&fnver=0&fnval=16&fourk=1&voice_balance=1
```

纯视频来自 `dash.video[].baseUrl`，按清晰度去重；纯音频来自 `dash.audio[].baseUrl`。插件把音轨按 ID 排序后，依次写成「无损品质、高品质、标准品质」，这不能证明第一档是无损：本次实际响应里的普通音轨均为 AAC。

扩展没有在浏览器内合并音视频。「格式转换工具」指向 `cv.pictureknow.com/downloads/convert`，属于外部工具。

## 当前项目的实现

普通视频页右上角直接展开下载面板，UP 主页可勾选视频批量下载；原直播回放页继续进入分段投稿。通过 `/x/web-interface/view` 定位当前分 P，再使用上面的两种 `playurl` 请求。保留接口返回的全部 `durl` 分段，按实际编码和码率显示音频，优先使用标准 HTTPS 备用 CDN，同一清晰度优先选择 AVC 视频以提高兼容性。

v0.4.1 从原 B 站页面触发文件导航，并显式使用 `strict-origin-when-cross-origin`，由浏览器携带 B 站 Referer。[declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) 会话规则只匹配本次完整下载地址的 `main_frame` 导航，通过 `Content-Disposition` 设置附件和 UTF-8 文件名，不影响播放器媒体请求。未引入外部转换工具，当前范围为普通视频的当前分 P。

验证结果：原有投稿自检和新增下载自检通过；浏览器预览核对了三组下载入口和封面显示。对当前视频 `BV1pAWA63Et8` 的未登录只读请求成功读取元信息与两种播放格式，并用 Referer 和 Range 请求取得 MP4 开头 1024 字节，CDN 返回 `206`，文件头含 `ftyp`。

这些结果不等同于安装扩展后浏览器中的 Cookie、CORS、CDN 请求头与完整文件下载验证；预览按钮不会发起真实下载。扩展安装后的完整下载仍待目标浏览器验证。

## v0.4.0 的 403 故障与 v0.4.1 修复

Chrome 的实际失败记录来自本扩展，响应 MIME 为 `text/html`，文件名被识别为 `42705355636-1-192.html`，下载被服务器拒绝。对该记录中的同一个未过期 CDN 地址只改变 Referer，结果如下；未记录完整签名 URL 或账号凭据。

| 请求来源头 | HTTP 响应 | 内容 |
| --- | --- | --- |
| 无 Referer | 403 | HTML 错误页 |
| `Referer: https://www.bilibili.com/` | 206 | MP4，文件头含 `ftyp` |

这表明文件和节点本身可用，失败与来源校验有关。v0.4.0 从扩展页调用 `chrome.downloads.download`，之前的单元检查和命令行 Range 检查没有覆盖浏览器实际下载所需的来源。v0.4.1 改为从原 B 站页面发起，保留完整签名参数，并移除不再使用的 `downloads` 权限；开始下载前再次核对原视频页和分 P。

回归检查先复现旧下载入口的 403 失败，再验证下载从 B 站页面发起、显式来源策略、完整地址附件规则、UTF-8 文件名和切换视频后的阻止行为。原有投稿自检与下载自检均通过。

使用正确 Referer 的独立 HTTP 请求已将当前 720P 文件完整保存到项目 `artifacts/downloads/`，大小为 36,607,609 字节，与服务器长度一致；ffprobe 确认是 1280×720 H.264 视频和 AAC 音频，时长约 254.65 秒。该目录不进入 Git。此结果仍不等同于更新后的 Chrome 扩展完整下载验收；浏览器访问策略禁止自动操作 `chrome-extension://` 页面，更新和浏览器内重试需要由用户完成。

## v0.5.0 页面内下载与 UP 批量选择（2026-10-30）

视频页和 UP 主页使用内容脚本显示右上角入口，页面内面板复用扩展 HTML。UP 封面勾选基于当前实际页面的 `.bili-video-card`、`.bili-video-card__cover` 和 `.bili-video-card__title`，不扫描用户的其他页面、不自动加载全部投稿；最多选择 100 个视频。

批量时每个视频读取一次分 P 列表，再逐 P 获取带声音的视频地址。同一时间只处理一个文件，通过 Chrome 下载事件确认当前文件完成后再继续；失败暂停，暂停后保留分 P 和文件位置。实际文件导航改为复用一个隐藏帧，继续保留 B 站来源，避免异步批量下载需要不断打开新窗口。DNR 仅匹配精确媒体 URL 的 `sub_frame` 附件响应。

多个面板只在启动阶段互斥，避免相互覆盖附件规则；取得 Chrome 下载 ID 后释放规则，批量队列再跟踪这个 ID 的完成状态。已经完成的视频只保留进度计数，释放其完整分 P 元信息。

验证：投稿、下载、批量自检通过；浏览器交互演示核对了原位面板、勾选、跨页、全选、暂停继续和 3 个视频共 4 个文件完成的模拟队列。真实公开视频 `BV1AinZ64E6j` 用 UP 主页 Referer 读取成功，返回 `206 video/mp4` 和 MP4 文件头；元信息和播放地址接口均允许 `Origin: https://space.bilibili.com` 及带登录凭据的跨域请求。

本地隐藏帧附件探测触发了 Chrome 下载记录，但该次记录被取消（`USER_CANCELED`），未作为文件下载成功证据。模拟队列也不是 Chrome 中真实整批视频下载验收；更新扩展后的实际批量下载仍待目标浏览器验证。
