# Contributing to BabaDeluxe Webview

👋 **Hello and Welcome!**

First off, thank you for considering contributing to BabaDeluxe! We are thrilled that you're here. We believe that great software is built by great communities, and every contribution—whether it's a typo fix, a new feature, or a bug report—helps us achieve our mission of **empowering engineering excellence**.

This guide is designed to help you get started comfortably and effectively. We aim for enterprise-grade quality, but we also value a friendly, collaborative environment.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js**: v20.19.0+ or v22.12.0+ (We are strict about engines!)
- **NPM**: v9+

### Setting Up Your Environment

1. **Fork & Clone** the repository.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Start Development**:
   ```bash
   npm run dev
   ```

---

## 🛠️ Development Workflow

We use a standard feature-branch workflow.

1. **Create a Branch**:
   ```bash
   git checkout -b feature/my-amazing-feature
   # or
   git checkout -b fix/pesky-bug
   ```
2. **Code**: Follow our [Coding Standards](#-coding-standards).
3. **Commit**: We use **Conventional Commits**. This is important for our automated release process.
   - `feat: add new chat bubble component`
   - `fix: resolve crash on login`
   - `docs: update readme diagrams`
4. **Push & PR**: Push your branch and open a Pull Request against `main`.

---

## 📐 Coding Standards

We take pride in our codebase. To keep it clean and maintainable, please adhere to these guidelines:

- **Vue 3 & TypeScript**: We exclusively use the **Composition API** with `<script setup lang="ts">`.
- **Strict Typing**: Avoid `any`. If you find yourself using it, take a step back and see if a proper type or interface can be defined.
- **Defensive Programming**: We use `neverthrow` for error handling. Avoid throwing raw exceptions for expected failure states.
- **Project Structure**: Respect the directory structure (e.g., atomic components in `src/components`, composables in `src/composables`).

### Linting & Formatting

Before submitting, please run:

```bash
npm run format
npm run type-check
```

---

## 🧪 Testing

Quality is non-negotiable at BabaDeluxe.

- **Unit Tests**: If you add logic, add a test in `vitest`.
- **E2E Tests**: If you change the UI flow, ensure `playwright` tests pass or are updated.

Run tests locally:

```bash
npm test
```

---

## 🤝 Code of Conduct

We are professionals. We treat each other with respect, patience, and kindness. Harassment or exclusionary behavior is not tolerated. Let's build something amazing together!

---

**Happy Coding!** 🤖✨
