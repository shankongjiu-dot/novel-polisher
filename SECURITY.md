# 安全策略（Security Policy）

## Supported Versions

本项目当前处于早期开发阶段（版本 `0.0.0`）。安全更新仅针对 `main` 分支的最新代码提供。

| 版本 | 支持状态 |
|---|---|
| main（最新） | ✅ 支持 |
| 其他历史提交 | ❌ 不支持 |

## 漏洞报告

如果你发现安全漏洞，请**不要**通过公开 Issue 披露。请使用以下方式私密报告：

- 在仓库的 **Security → Report a vulnerability**（GitHub Security Advisory）提交
- 或发送邮件至维护者 GitHub 账号 [`@shankongjiu-dot`](https://github.com/shankongjiu-dot)

我们会尽快确认问题、评估影响并协调修复与披露时间。

## 安全设计说明

Novel Polisher 是**本地优先（local-first）**的 Web 应用：

- 所有文本处理、清洗、对齐、diff、投票与审核均在**用户浏览器本地**完成，数据不会上传到任何服务器。
- LLM 调用由用户**自行配置**的 OpenAI 兼容接口完成，仅把待裁决的「分歧文本片段」发送给用户指定的 API；请自行评估所用 API 的隐私风险。
- 本地持久化使用浏览器 **IndexedDB**，数据保存在用户本机，不会随仓库或网络外泄。

因此，本项目的攻击面主要限于前端依赖与用户本地环境；依赖更新与安全加固会随常规维护进行。
