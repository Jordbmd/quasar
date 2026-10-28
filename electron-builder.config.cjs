// Standalone packages are separate from the existing source-linked macOS launcher.
module.exports = {
  appId: "fr.sezaam.camera-tool",
  productName: "Quasar",
  directories: { output: "release", buildResources: "build/icons" },
  asar: true,
  files: ["dist/**/*", "package.json", "!dist/**/*.map"],
  extraResources: [
    {
      from: process.env.QUASAR_VIDEO_DIR || "bin",
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
  toolsets: { nsis: "1.2.1" },
  publish: null,
  mac: {
    target: ["dmg"],
    artifactName: "Quasar-${version}-macOS-${arch}.${ext}",
    icon: "build/icons/quasar.icns",
    identity: "-",
    hardenedRuntime: false,
    extendInfo: {
      NSLocalNetworkUsageDescription:
        "Quasar recherche et configure vos caméras IP via la connexion Ethernet de votre hub.",
    },
  },
  dmg: {
    title: "Quasar ${version}",
    backgroundColor: "#FAF9FD",
    window: { width: 540, height: 380 },
    contents: [
      { x: 130, y: 190, type: "file" },
      { x: 410, y: 190, type: "link", path: "/Applications" },
    ],
  },
  linux: {
    target: ["AppImage"],
    artifactName: "Quasar-${version}-Linux-${arch}.${ext}",
    executableName: "quasar",
    extraFiles: [{ from: "scripts/linux-apprun.sh", to: "AppRun" }],
    icon: "build/icons/icon-512.png",
    category: "Utility",
  },
  appImage: { executableArgs: [] },
  win: {
    target: ["nsis"],
    artifactName: "Quasar-${version}-Windows-${arch}-Setup.${ext}",
    icon: "build/icons/quasar.ico",
    requestedExecutionLevel: "asInvoker",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createStartMenuShortcut: true,
    createDesktopShortcut: false,
    deleteAppDataOnUninstall: false,
    differentialPackage: false,
    installerLanguages: ["fr_FR", "en_US"],
    displayLanguageSelector: true,
  },
};
