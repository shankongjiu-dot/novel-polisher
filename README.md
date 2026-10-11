# 📚 Novel Polisher · 小说多源对照精修工具

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform: Web](https://img.shields.io/badge/Platform-Web-brightgreen.svg)](#)
[![Stack: React + TS + Vite](https://img.shields.io/badge/Stack-React%20%2B%20TS%20%2B%20Vite-9cf.svg)](#)

> 本地优先（local-first）的小说精修工具：通过**多源对照**，把「广告 / 水印 / 错别字」从「靠 AI 猜」变成「靠差异直接暴露」，大幅降低误判与漏检，同时显著减少 LLM 调用量（省钱）。

---

## 中文简介

Novel Polisher 面向长篇小说（TXT / EPUB）的精修场景，解决三类问题：

1. **错别字 / 标点 / 病句**修正
2. **传播中插入的网站水印 / 广告 / 乱码**删除
3. **缺章 / 重复段 / 缺段**修复

**核心创新：多源对照。** 同一本书从多个独立来源导入，通过对齐 + 差异对比 + 投票，将问题直接暴露：

- **广告 / 水印 / 乱码**：通常只在某一源出现 → 差异直接暴露，命中规则库即删，无需 AI 判断。
- **错别字 / 标点**：多源在同一位置写法不一致 → 多数源一致者判为正确。
- **缺章 / 重复段**：来源间结构对比即可定位，无需 AI。
- **AI 只做仲裁**：仅当「所有源分歧」或「置信度低」时才调用 LLM，把全文校对降级为分歧裁决器。

## English Abstract

Novel Polisher is a **local-first** desktop-class web tool for polishing long-form novels (TXT / EPUB). Its core idea is **multi-source comparison**: import the same book from several independent sources, then align, diff, and vote to surface ads, watermarks, typos, and missing/duplicate paragraphs directly from divergence — instead of guessing with AI. Large-language-model calls are reserved for genuine disagreements only, sharply cutting cost and false positives.

---

## ✨ 功能特性

- 🔍 **多源导入**（TXT / EPUB），自动来源指纹去重，识别「假多源」（搬运转载）并降权
- 🧹 **标准化清洗**：编码/换行归一、去除零宽字符与广告水印规则库过滤
- 📐 **章节切分 + 段落对齐**：LCS + bigram 相似度（非 embedding），容忍拆段 / 合并 / 缺段
- 🗳 **逐段 diff + 差异分类 + 投票仲裁**：多数源一致自动采纳，全分歧进入 AI 仲裁队列
- 🤖 **AI 仲裁**：仅对分歧点调用 LLM，内置并发池 + 限流，结果回写本地库并附置信度与分类
- 👀 **人工审核 UI**：diff 高亮、按裁决分类筛选、批量采纳 / 拒绝 / 编辑、修改建议持久化（IndexedDB，支持断点续跑）
- 📤 **导出 TXT / EPUB**，全程可审核、可回退

---

## 🚀 快速开始

### 环境要求

- **Node.js 20+**（开发/构建）
- 一个 OpenAI 兼容的 LLM API（baseURL / apiKey / model 自定义；仅 AI 仲裁阶段需要）

### 安装与运行

```bash
# 仓库根目录下进入应用
cd novel-polisher

# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 生产构建（输出到 dist/）
npm run build

# 预览构建产物
npm run preview

# 代码检查
npm run lint
```

> 💡 Windows 用户可直接双击根目录的 **`start.bat`** 一键启动（自动检测 Node、安装依赖并打开浏览器）。

配置 LLM：打开应用内 **设置（Settings）**，填写 baseURL、apiKey、model。未配置时，多源对照与规则清洗仍可正常工作，仅 AI 仲裁不可用。

---

## 📖 使用流程

```
导入多源 → 标准化清洗 → 章节切分 → 段落对齐
   → 逐段 diff → 差异分类 → 投票仲裁 → AI 兜底 → 人工审核 → 导出
```

1. **导入（Import）**：导入 ≥2 个独立来源的同一本书（TXT / EPUB）
2. **对照（Compare）**：自动对齐 + diff + 投票，查看被暴露的广告 / 错别字 / 缺段
3. **审核（Review）**：逐条采纳 / 拒绝 / 编辑，分歧点交由 AI 仲裁
4. **导出（Export）**：导出精修后的 TXT / EPUB

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| 代码检查 | Oxlint |
| 本地持久化 | IndexedDB（浏览器原生，支持断点续跑）|
| 文件解析 | jszip（EPUB）|
| LLM 接入 | OpenAI 兼容接口（可插拔 baseURL / apiKey / model）|
| 桌面壳（规划中） | Tauri 2 + Rust（性能关键路径）|

> 注：当前为 **Web 版**（无需后端、纯本地运行）。Tauri 桌面壳为路线图项，需另行安装 Rust 工具链。

---

## 📂 项目结构

```
novel-polisher/
├─ src/
│  ├─ pages/          # 导入 / 对照 / 审核 / 导出 页面
│  ├─ components/     # 侧边导航、设置面板
│  ├─ lib/            # cleaner / compare / compare.worker / llm / epub / export / db / storage / parse
│  ├─ store/          # 全局状态（AppContext / useApp）
│  ├─ types.ts        # 类型与裁决分类定义
│  ├─ App.tsx         # 应用入口与路由
│  └─ main.tsx
├─ public/            # favicon / 图标
├─ index.html
├─ vite.config.ts
├─ tsconfig*.json
└─ package.json
```

开发规划详见 [`PLAN.md`](PLAN.md)。

---

## 🗺 路线图（Roadmap）

- [x] 单源清洗 MVP（去广告 + 纠错 + 人工采纳 + 导出）
- [x] 多源对照（对齐 + diff + 投票仲裁）
- [x] AI 仲裁（并发池 + 限流）+ 审核 UI 打磨
- [x] EPUB 导入 / 导出
- [ ] 规则库可视化编辑
- [ ] 批量任务队列
- [ ] 审核经验回流规则库
- [ ] Tauri 桌面壳

---

## ⚠️ 免责声明

- **本工具仅供学习与技术研究使用**，不得用于任何商业用途，亦不得用于侵犯他人合法权益（包括版权）的场景。
- 本项目为**本地自用工具**，不内置任何小说下载 / 爬取功能。请仅对你**拥有合法权利**的文本进行处理，尊重原作者版权，遵守所在地法律法规。
- 因使用本工具产生的任何版权、法律或经济问题，均由使用者自行承担，作者与贡献者不承担任何责任。

> **Disclaimer (English):** This tool is provided **for learning and technical research purposes only**. It must not be used for any commercial purpose or in any way that infringes the legitimate rights (including copyright) of others. This is a local-only utility with no built-in downloading or scraping. You are solely responsible for any copyright, legal, or financial consequences arising from its use; the author and contributors accept no liability.

---

## 🤝 贡献

欢迎 Issue 与 Pull Request！请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发流程与规范，并遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

---

## 📄 许可证

本项目以 **GNU General Public License v3.0** 开源。详见 [LICENSE](LICENSE)。

> 衍生作品（包括基于此项目修改或链接本项目的软件）在相同许可证下开源。
