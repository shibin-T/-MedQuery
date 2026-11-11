// Extends app.json. EXPO_BASE_URL lets the web build live in a sub-folder, e.g.
// https://<user>.github.io/<repo>/app/ on GitHub Pages (set by .github/workflows/deploy-pages.yml).
// Locally it is empty, so `npx expo start` serves the app at the root as usual.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...(config.experiments || {}), ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) }
});
