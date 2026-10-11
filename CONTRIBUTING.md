# 贡献指南（Contributing）

感谢你考虑为 **Novel Polisher** 做出贡献！本文档说明如何参与开发与提交改动。

## 行为准则

参与本项目的所有贡献者都须遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 如何开始

1. **Fork** 本仓库并克隆到本地
2. 进入应用目录：`cd novel-polisher`
3. 安装依赖：`npm install`
4. 创建特性分支：`git checkout -b feat/your-feature`（或 `fix/your-bug`）

## 开发规范

- **语言**：TypeScript（严格模式），React 函数组件 + Hooks
- **代码检查**：提交前请运行 `npm run lint`（Oxlint），确保 0 警告 0 错误
- **类型检查与构建**：`npm run build`（`tsc -b && vite build`）须通过
- **提交信息**：建议采用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：
  - `feat:` 新功能
  - `fix:` 缺陷修复
  - `docs:` 文档
  - `refactor:` 重构
  - `test:` 测试
  - `chore:` 构建/工具链

## 提交 Pull Request

1. 确保 `npm run lint` 与 `npm run build` 均通过
2. 推送分支并在 GitHub 发起 PR，描述改动动机与验证方式
3. 如涉及行为变更，请同步更新 README / 相关文档

## 报告缺陷（Bug）

请通过 **GitHub Issues** 提交，并尽量包含：

- 复现步骤
- 预期与实际行为
- 浏览器 / Node 版本
- 相关日志或截图

## 开发规划

详细的架构、模块设计与里程碑见 [PLAN.md](PLAN.md)。新功能建议先对齐路线图与现有设计再动手。
