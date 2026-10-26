import { ProfileJournal } from "./profile-journal";
import { DefaultsStore } from "./defaults";
import sezaamProfile from "../../config/sezaam-profile.json";
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  session,
  clipboard,
  Menu,
} from "electron";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { MacNetwork, UnsupportedNetwork } from "./platform";
import { OSDStore } from "./osd";
import { NetworkGuard } from "./network";
import { Diagnostics } from "./diagnostics";
import { VideoRelay } from "./video";
import { CameraService, schemas } from "./service";
import type { Api } from "../shared/types";
const root = path.resolve(__dirname, "../..");
app.setName("Quasar");
app.setPath(
  "userData",
  process.env.SEZAAM_TEST_USER_DATA || path.join(root, ".runtime/electron"),
);
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");
let win: BrowserWindow;
let service: CameraService;
let timer: NodeJS.Timeout;
let quitting = false;
let busy = false;
let watching = false;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      await mkdir(path.join(root, ".runtime"), {
        recursive: true,
        mode: 0o700,
      });
      app.setAboutPanelOptions({
        applicationName: "Quasar",
        applicationVersion: app.getVersion(),
        credits:
          "Configuration locale et diagnostic de caméras IP.\nSora / Inter / JetBrains Mono — SIL OFL 1.1",
        iconPath: path.join(root, "build/icons/icon-128.png"),
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Quasar",
            submenu: [
              { role: "about", label: "À propos de Quasar" },
              { type: "separator" },
              { role: "hide", label: "Masquer Quasar" },
              { role: "unhide", label: "Tout afficher" },
              { type: "separator" },
              { role: "quit", label: "Quitter Quasar" },
            ],
          },
          {
            label: "Édition",
            submenu: [
              { role: "undo", label: "Annuler" },
              { role: "redo", label: "Rétablir" },
              { type: "separator" },
              { role: "cut", label: "Couper" },
              { role: "copy", label: "Copier" },
              { role: "paste", label: "Coller" },
              { role: "selectAll", label: "Tout sélectionner" },
            ],
          },
          {
            label: "Affichage",
            submenu: [
              { role: "resetZoom", label: "Taille réelle" },
              { role: "zoomIn", label: "Agrandir" },
              { role: "zoomOut", label: "Réduire" },
              { role: "togglefullscreen", label: "Plein écran" },
            ],
          },
          {
            label: "Fenêtre",
            submenu: [
              { role: "minimize", label: "Réduire" },
              { role: "close", label: "Fermer" },
            ],
          },
        ]),
      );
      const logs = new Diagnostics();
      const guard = new NetworkGuard(
        process.platform === "darwin"
          ? new MacNetwork()
          : new UnsupportedNetwork(),
        logs,
      );
      const video = new VideoRelay(root, guard, logs);
      const confirm = async (detail: string) => {
        const r = await dialog.showMessageBox(win, {
          type: "warning",
          title: "Confirmer la modification",
          message: "Vérifiez la cible et les nouveaux réglages",
          detail,
          buttons: ["Annuler", "Confirmer cette modification"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        return r.response === 1;
      };
      service = new CameraService(
        guard,
        logs,
        video,
        confirm,
        (url) => shell.openExternal(url),
        async () => {
          const r = await dialog.showSaveDialog(win, {
            title: "Exporter le diagnostic",
            defaultPath: "quasar-diagnostic.json",
            filters: [{ name: "JSON", extensions: ["json"] }],
          });
          if (r.canceled || !r.filePath) return "Export annulé";
          await writeFile(
            r.filePath,
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                platform: process.platform,
                arch: process.arch,
                network: guard.state,
                diagnostics: service.reports,
                events: logs.entries,
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
          return r.filePath;
        },
        new OSDStore(path.join(root, ".runtime/osd")),
        new DefaultsStore(path.join(root, ".runtime/camera-defaults.json"), sezaamProfile),
        new ProfileJournal(path.join(root, ".runtime/profile-journal")),
      );
      service.exportProfileRun = async (report) => {
        const result = await dialog.showSaveDialog(win, {
          title: "Exporter le journal du profil",
          defaultPath: `quasar-${report.kind}-${report.id}.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return "Export annulé";
        await writeFile(result.filePath, JSON.stringify(report, null, 2), {
          mode: 0o600,
        });
        return result.filePath;
      };
      win = new BrowserWindow({
        width: 1380,
        height: 940,
        minWidth: 1050,
        minHeight: 720,
        title: "Quasar",
        backgroundColor: "#0A0F28",
        show: false,
        icon: path.join(root, "build/icons/icon-512.png"),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          devTools: true,
        },
      });
      service.onDefaultsProgress = (update) => {
        if (!win.isDestroyed())
          win.webContents.send("sezaam:defaults-progress", update);
      };
      service.onFactoryResetProgress = (update) => {
        if (!win.isDestroyed())
          win.webContents.send("sezaam:factory-reset-progress", update);
      };
      service.onPreviewLighting = (update) => {
        if (!win.isDestroyed())
          win.webContents.send("sezaam:preview-lighting", update);
      };
      service.onCameraDetail = (update) => {
        if (!win.isDestroyed())
          win.webContents.send("sezaam:camera-detail", update);
      };
      const dev = process.env.SEZAAM_DEV_URL;
      const index = path.join(root, "dist/renderer/index.html");
      session.defaultSession.setPermissionRequestHandler((_, __, cb) =>
        cb(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
        try {
          const u = new URL(details.url);
          const allowed =
            u.protocol === "file:" ||
            u.protocol === "blob:" ||
            ((u.protocol === "http:" || u.protocol === "ws:") &&
              u.hostname === "127.0.0.1");
          cb({ cancel: !allowed });
        } catch {
          cb({ cancel: true });
        }
      });
      win.webContents.on("render-process-gone", () =>
        guard.suspend(
          "L’interface s’est arrêtée. Relancez l’application pour vous reconnecter.",
        ),
      );
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      win.webContents.on("will-attach-webview", (e) => e.preventDefault());
      ipcMain.handle(
        "sezaam:call",
        async (event, method: unknown, input: unknown) => {
          if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame
          )
            return { ok: false, error: "Appel non autorisé." };
          if (typeof method !== "string" || !Object.hasOwn(schemas, method))
            return { ok: false, error: "Action inconnue." };
          if (method === "copyLogs") {
            schemas.copyLogs.parse(input);
            clipboard.writeText(
              JSON.stringify(
                { reports: service.reports, events: logs.entries },
                null,
                2,
              ),
            );
            return { ok: true };
          }
          if (method === "stopVideo") {
            await service.stopVideo();
            return { ok: true };
          }
          if (method === "cancelCameraRead") {
            await service.cancelCameraRead();
            return { ok: true };
          }
          if (busy)
            return {
              ok: false,
              error: "Une opération est en cours. Patientez avant la suivante.",
            };
          // Browsing stays available while a camera is slow. Mutations and
          // session changes still take an exclusive lock and cancel detail reads.
          const background = [
            "state",
            "getDefaults",
            "listDefaultsRuns",
            "getDefaultsRun",
            "exportDefaultsRun",
            "selectCamera",
            "readCamera",
            "previewProfiles",
            "startVideo",
            "openWeb",
            "exportLogs",
          ].includes(method);
          if (!background) busy = true;
          try {
            if (!background) {
              await service.stopVideo();
              await service.cancelCameraRead();
              await service.finishPreviewLighting();
            }
            return {
              ok: true,
              value: await service.dispatch(method as keyof Api, input as any),
            };
          } catch (e) {
            const message = logs.safe(e);
            if (
              message !== "Lecture remplacée." &&
              message !== "Aperçu interrompu."
            )
              logs.add("erreur", method, message);
            return { ok: false, error: message };
          } finally {
            if (!background) busy = false;
          }
        },
      );
      guard.onSuspend(() => {
        if (!win.isDestroyed())
          win.webContents.send("sezaam:invalidated", guard.state.reason);
      });
      timer = setInterval(async () => {
        if (watching) return;
        watching = true;
        try {
          await guard.refresh();
          for (const c of service.connections.values())
            await guard.assert(c.camera.ip);
          if (video.activeIp) await guard.assert(video.activeIp);
        } catch (e) {
          guard.suspend(logs.safe(e));
        } finally {
          if (!win.isDestroyed())
            win.webContents.send("sezaam:network", guard.state);
          watching = false;
        }
      }, 5000);
      logs.add(
        "info",
        "Application démarrée",
        "Aucune découverte, requête caméra ou ouverture de flux automatique.",
      );
      if (dev === "http://127.0.0.1:5173") await win.loadURL(dev);
      else await win.loadFile(index);
      win.show();
    })
    .catch((e) => {
      dialog.showErrorBox("Démarrage impossible", String(e));
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    clearInterval(timer);
    Promise.resolve(service?.shutdown()).finally(() => app.quit());
  });
}
