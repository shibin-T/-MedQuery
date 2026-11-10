// Metro bundler config: lets the app import the shared MedQuery core from ../site,
// so the website and the app use exactly the same article, hospital and prompt logic.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, "../site")];
module.exports = config;
