# Chrome Web Store 上架资料（复制粘贴用）

> 版本：v1.9.1 · 更新：2026-09-21
> 上传包：`bookmark-cleaner-v1.9.1.zip`（仓库根目录 / 已复制到 Windows 用户目录）

---

## 1. 商店信息（Store listing）

**名称**：书签清理助手

**简短说明（≤132 字符）**：
```
本地清理失效、重复书签与空文件夹；支持归档、搬家检测、Wayback 救援、书签画像与分享页。全程本地运行，不上传任何数据。
```

**详细说明**：
```
书签清理助手 —— 让你的收藏重新可用

【为什么需要它】
收藏了几年，书签越攒越多：失效的、重复的、忘了为什么收藏的。
浏览器自带的清理功能很弱，第三方工具要么收费、要么删了不能恢复。
书签清理助手是一次"安全、彻底、本地"的整理。

【核心功能】
🧹 清理
• 失效书签检测（404 / 网络错误 / 超时，自动分类并给出原因）
• 重复书签识别（URL 归一化，忽略跟踪参数）
• 空文件夹扫描（含嵌套）
• 扫描结果支持关键词搜索、时间范围过滤与排序

🛡️ 安全
• 删除全部进回收站，随时恢复
• 一键导出完整备份（JSON，可回灌）
• 操作历史记录 + 一键撤销（归档/移动/改标题/标为正常）

📂 整理
• 移动 / 归档到指定文件夹；死链一键归档
• 批量打开、批量清理标题（去掉 " - CSDN博客" 这类后缀）
• 指定目录（如「归档」）不参与检测，历史存档不被打扰

🚑 救援
• 搬家检测：网站换域名了？一键更新为新地址
• Wayback 救援：死链查询 archive.org 存档，一键替换为存档地址

📊 画像与回顾
• 书签画像：收藏趋势折线图（月/日下钻）、Top 网站、死链率、年份分布
• 时光机：那年今日 + 随机回顾，支持侧边栏常驻 / 独立小窗

📤 分享
• 把精选书签导出为精美网页（4 种主题）或长图海报（适合朋友圈/小红书）

⏰ 自动化
• 每周自动扫描（增量）+ 每周自动备份
• 扩展图标角标显示待处理数量

【隐私承诺】
• 全程本地运行：书签数据不上传、不收集、不出售
• 无账号、无分析、无广告、无第三方代码
• 敏感权限（网站访问 / 历史 / 下载）全部按需申请，不在安装时索取

【开源】
MIT 协议，代码公开：https://github.com/LeafInCode/bookmark-cleaner
如果它帮到了你，可以请作者喝杯柠檬水（纯自愿，不影响任何功能）
```

**类别**：生产力工具（Productivity）
**语言**：中文（简体）

---

## 2. 隐私规范（Privacy practices）

**单一用途说明（Single purpose）**：
```
清理、整理与回顾浏览器书签：检测失效/重复书签与空文件夹，支持归档、搬家检测、Wayback 救援、书签画像与分享导出。所有数据均在本地处理。
```

**权限用途说明（Permission justifications，逐条填）**：

| 权限 | 说明（英文，直接填后台） |
|---|---|
| `bookmarks` | Core functionality: reading, organizing, moving and deleting bookmarks at the user's request. |
| `storage` / `unlimitedStorage` | Stores user settings, the recycle bin, operation history and scan results locally on the device. |
| `alarms` | Schedules the optional weekly auto-scan and weekly auto-backup. |
| `sidePanel` | Displays the optional Time Machine (on this day / random bookmarks) in the browser side panel. |
| Host permission `<all_urls>`（按需申请） | Requested only at first scan, to check whether the user's bookmarked links are still alive or have moved. Not requested at install. |
| `webRequest` / `webNavigation`（按需申请） | Used only when the user clicks "Verify in browser" to obtain the real HTTP status of a bookmark link. |
| `history`（按需申请） | Used only when the user clicks "Never opened" to locally compare bookmarks against browsing history. Data never leaves the device. |
| `downloads`（按需申请） | Used only to save exported backups, share pages and posters to the user's Downloads folder. |

**数据使用申报（Data usage）**：
- Does this extension collect or use user data? → **不收集**（所有处理均在本地；不上传到开发者或第三方）
- 三条认证全部勾选：不出售数据 / 不用于与单一用途无关的目的 / 不用于信用评估
- 说明备注（如后台有补充框）：
```
All bookmark, history and settings data is processed locally in the browser and never transmitted to the developer or any third party. The only network requests are: (1) requests to the user's bookmarked URLs to check availability, and (2) optional archive.org lookups when the user clicks "Check archive".
```

**隐私政策 URL**：
```
https://leafincode.github.io/bookmark-cleaner/privacy.html
```

---

## 3. 截图清单（1280×800，1-5 张）

1. 扫描结果页（失效列表 + 左侧色条 + 单卡操作按钮）
2. 书签画像（折线图 + 渐变卡片 + 年份筛选）
3. 时光机（双 tab + 彩色卡片）
4. 导出分享页（主题缩略图选择 + 生成效果）
5. 设置页（排除目录 + 每周自动任务 + 关于与支持）

（可选）小型宣传图 440×280

---

## 4. 上传流程备忘

1. Chrome Web Store Developer Dashboard → New item → 上传 `bookmark-cleaner-v1.9.1.zip`
2. 填 Store listing（本文件第 1 节）
3. 填 Privacy practices（本文件第 2 节）
4. Distribution：Public / 全部地区
5. Submit for review（首次审核通常 1-7 天，新账号可能更久）
6. 后续更新：改代码 → 升 manifest version → `python3 scripts/package.py` → 上传新 zip
