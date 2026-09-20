# 书签清理助手（Bookmark Cleaner Assistant）

> 本地清理失效 / 重复书签与空文件夹 · 支持归档、搬家检测与 Wayback 救援。
> **全程本地运行，不上传任何数据。** 公益免费，无账号、无服务器、无追踪。

## 功能

| 分类 | 能力 |
|---|---|
| 清理 | 失效书签检测（状态码/超时/网络错误）、重复书签（URL 归一化去重）、空文件夹 |
| 安全 | 删除前自动快照 → 回收站（可恢复）；可一键导出完整备份 |
| 整理 | 移动 / 归档到指定文件夹；死链一键归档；批量打开 |
| 救援 | 搬家站检测（重定向域名变化 → 一键更新）；Wayback 存档查询与替换 |
| 画像 | 收藏 Top 网站、死链率、重复数、月度新增趋势、最早/最新收藏 |
| 导出 | 备份 JSON、扫描报告 CSV、分享页 HTML（自包含） |
| 语言 | 中文 / English |

## 安装（开发者模式）

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择本目录
4. 点击工具栏图标 → 「打开仪表盘」

## 使用流程

1. 仪表盘 → 「开始扫描」（首次会请求全站访问权限用于链接检测）
2. 扫描完成后按分类处理：失效 / 重复 / 空文件夹 / 已搬家 / 无法确认
3. 删除的操作都进回收站，随时可恢复；重要操作前建议先「导出备份」

## 目录结构

```
bookmark-cleaner/
├── manifest.json         MV3 清单
├── background.js         扫描编排（并发队列 / 进度持久化 / Wayback 查询）
├── popup.html/js         弹窗（快捷扫描 + 统计）
├── dashboard.html/js     仪表盘（扫描 / 结果处理 / 画像 / 回收站）
├── lib/
│   ├── url.js            URL 归一化（去重键）
│   ├── bookmarks.js      书签树遍历 / 重复 / 空夹 / 删除快照 / 恢复 / 移动
│   ├── linkcheck.js      链接检测分类 + 搬家检测 + Wayback API
│   ├── stats.js          书签画像计算
│   ├── export.js         备份 / CSV 报告 / 分享页导出
│   ├── storage.js        设置 / 回收站 / 扫描状态
│   └── i18n.js           中英词典
├── styles/               样式
├── icons/                图标（scripts/gen_icons.py 生成）
└── PLAN.md               方案文档（功能规划 / 阶段 / 边界）
```

## 隐私

- 数据只存于 `chrome.storage.local`（本机）
- 链接检测会直接访问你的书签 URL（用于判断状态）；Wayback 查询仅发送 URL 到 archive.org
- 无分析、无遥测、无第三方代码
- 完整声明见 [privacy.html](privacy.html)

## 支持作者（纯自愿）

如果这个工具帮到了你，可以请作者喝杯柠檬水——**不影响任何功能**（全功能免费）。
把收款码图片放到 `assets/support.png`，扩展内「设置 → 关于与支持」会显示。

## 开发

- 零构建：原生 ES Modules，改完直接在扩展页「重新加载」
- 图标重新生成：`python3 scripts/gen_icons.py`

## License

MIT
