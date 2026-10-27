// Standalone packages are separate from the existing source-linked macOS launcher.
module.exports = {
  appId: "fr.sezaam.camera-tool",
  productName: "Quasar",
  directories: { output: "release", buildResources: "build/icons" },
  asar: true,
  files: ["dist/**/*", "package.json", "!dist/**/*.map"],
  extraResources: [
    {
      from: "bin",
      to: "bin",
      filter: ["go2rtc", "go2rtc.exe", "go2rtc-version.json"],
    },
    {
      from: "scripts/video-supervisor.cjs",
      to: "scripts/video-supervisor.cjs",
    },
    { from: "build/icons", to: "build/icons", filter: ["*.png"] },
  ],
  afterPack: "scripts/after-pack.cjs",
  npmRebuild: false,
  publish: null,
  mac: {
    target: ["dir"],
    icon: "build/icons/quasar.icns",
    identity: "-",
    hardenedRuntime: false,
    extendInfo: {
      NSLocalNetworkUsageDescription:
        "Quasar recherche et configure vos caméras IP via la connexion Ethernet de votre hub.",
    },
  },
  linux: {
    target: ["dir"],
    icon: "build/icons/icon-512.png",
    category: "Utility",
  },
  win: {
    target: ["dir"],
    icon: "build/icons/quasar.ico",
    requestedExecutionLevel: "asInvoker",
  },
};
