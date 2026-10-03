# Contributing

Thanks for helping improve Yavqo Fetch. The project is intentionally small, so the best contributions are usually bug fixes, tests, and documentation. If you want to add a feature, please open an issue first so we can agree it fits the scope ("native fetch, but cleaner").

## Setup

Requires Node.js 20 or newer for development.

```bash
git clone https://github.com/Yavqo/Fetch.git
cd Fetch
npm install
```

## Everyday commands

| Command              | What it does                      |
| -------------------- | --------------------------------- |
| `npm test`           | Run the unit tests                |
| `npm run test:watch` | Run tests in watch mode           |
| `npm run lint`       | Lint with ESLint                  |
| `npm run typecheck`  | Type-check with `tsc`             |
| `npm run format`     | Format with Prettier              |
| `npm run build`      | Build ESM, CJS and `.d.ts` output |

Before opening a pull request, run `npm run lint && npm run typecheck && npm test && npm run build`. CI runs the same checks.

## Guidelines

- **Keep it small.** No runtime dependencies. Prefer a short function over a new class or abstraction.
- **Test behaviour.** Every bug fix needs a test that fails without it. Tests pass a mock `fetch` through the `fetch` option instead of making real requests.
- **Keep it tree-shakeable.** No module-level side effects.
- **Document public changes.** Update the README and `CHANGELOG.md` when the public API changes.
- **One concern per pull request.** Small, focused changes are reviewed faster.

## Commit messages

Use short, imperative summaries, e.g. `Fix retry delay when signal is aborted`. Conventional Commit prefixes (`fix:`, `feat:`) are welcome but not required.

## Releasing

Maintainers publish by bumping the version in `package.json`, updating `CHANGELOG.md`, and creating a GitHub release. The `Publish` workflow runs the checks and publishes to npm with provenance.

## Reporting security issues

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting under the repository's **Security** tab instead.

## License

By contributing you agree that your contributions are licensed under the MIT License.
