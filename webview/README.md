# AnkiBrain webview (side panel UI)

React app built with [Vite](https://vitejs.dev/) and managed with
[Yarn 4](https://yarnpkg.com/) (pinned via the `packageManager` field in
`package.json`; enable Corepack with `corepack enable` if `yarn` is missing).

App source is plain JavaScript; TypeScript tooling is configured
(`tsconfig.json`, `@types/*`, `vite.config.ts`) so new files can be written
as `.ts`/`.tsx` and existing files can be converted incrementally.

## Available Scripts

In this directory, run:

### `yarn dev`

Runs the app in the development mode (Vite dev server in `STANDALONE` env
mode, see `.env.STANDALONE`).
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.

### `yarn test`

Runs the test suite once with [Vitest](https://vitest.dev/).
Use `yarn test:watch` for interactive watch mode.

### `yarn build`

Builds the app for production to the `dist` folder.
Anki's side panel (`SidePanel.py`) loads `dist/index.html`, so rebuild after
changing the UI and reload Anki to see the changes.

### `yarn lint`

Lints the project with ESLint (flat config in `eslint.config.js`).

## Notes

- Environment variables must be prefixed `VITE_` and are read via
  `import.meta.env` (not `process.env`).
- The build uses relative asset URLs (`base: './'` in `vite.config.ts`)
  because the bundle is loaded from the local filesystem by QtWebEngine.
