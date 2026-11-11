// Metro bundler config.
// 1. Lets the app import the shared MedQuery core from ../site, so the website and the
//    app use exactly the same article, hospital and prompt logic.
// 2. Loads the Anthropic SDK's CommonJS build: its ES-module build has a circular import
//    that Metro's development mode evaluates out of order ("Cannot access … before
//    initialization"). Production builds were unaffected, but live reloading needs this.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "../site")];

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const ctx = moduleName === "@anthropic-ai/sdk" || moduleName.startsWith("@anthropic-ai/sdk/")
    ? { ...context, unstable_conditionNames: ["require", "default"] }
    : context;
  return (defaultResolve || context.resolveRequest)(ctx, moduleName, platform);
};
module.exports = config;
