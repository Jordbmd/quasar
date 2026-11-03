import {
  t,
  getLanguage,
  setLanguage,
  subscribeLanguage,
  type Language,
} from "../shared/i18n";
import type { AutoLoginStatus } from "../shared/auto-login";
import { Select } from "./design-system/Select";
import { BoxView } from "./BoxView";
import {
  readBoxLibrary,
  saveBoxLibrary,
  upsertBox,
  bindBox,
  type BoxLibrary as Library,
} from "./box-storage";
import { BoxLibrary } from "./BoxLibrary";
import { cameraKey, type BoxDefinition } from "../shared/box";
import type { LockerAssignment } from "../shared/addressing";
import { PreferencesPage } from "./pages/Preferences";
import { CameraReader } from "./camera-reader";
import { Diagnostic } from "./pages/Diagnostic";
import { displayValue as value } from "./format";
import { DefaultsPage, DefaultsApply } from "./Defaults";
import { Addressing } from "./Addressing";
import { IPConflicts } from "./IPConflicts";
import { FactoryResetDialog } from "./FactoryReset";
import {
  CameraCard,
  CameraFacts,
  VideoPlaceholder,
  DiagnosticResults,
  EventLog,
} from "./design-system/camera";
import {
  Button,
  Panel,
  Alert,
  Loading,
  EmptyState,
  Modal,
  useConfirmation,
} from "./design-system/components";
import React, {
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  Camera as CameraIcon,
  Activity,
  Boxes,
  Network,
  RefreshCw,
  Search,
  Plus,
  MonitorPlay,
  SlidersHorizontal,
  Settings as SettingsIcon,
  Type,
  ExternalLink,
  Play,
  Square,
  Download,
  Check,
  AlertTriangle,
  LoaderCircle,
  Sun,
  Moon,
  Maximize,
  X,
  Cable,
  ChevronRight,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
  Info,
} from "lucide-react";
import type {
  Api,
  AppState,
  Camera,
  CameraDetail,
  WriteResult,
  DiagnosticReport,
  Feature,
} from "../shared/types";
import { VideoPlayer } from "./VideoPlayer";
import { Settings } from "./Settings";
import { SessionBar } from "./SessionBar";
import {
  readPreferences,
  preferredProfile,
  compareCameraIPs,
} from "./preferences";
import "./style.css";
import { Brand } from "./design-system/Brand";
import { arr, tok, Field, Status, type Run } from "./ui";
export function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const chooseLanguage = async (next: Language) => {
    try {
      setLanguage(await window.sezaam.call("setLanguage", { language: next }));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const [themePreference, setThemePreference] = useState<
    "light" | "dark" | "system"
  >(() => {
    try {
      const saved = localStorage.getItem("sezaam-theme");
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
      return "system";
    }
  });
  const { confirm, dialog: confirmationDialog } = useConfirmation();
  const [cameraMode, setCameraMode] = useState<"classic" | "box">("classic");
  const [boxStore, setBoxStore] = useState(readBoxLibrary);
  const boxStoreRef = useRef(boxStore);
  const boxLibrary = boxStore.library;
  const boxState = boxLibrary.entries.find(
    (e) => e.id === boxLibrary.activeId,
  ) ?? { id: "", box: undefined, bindings: {} };
  const boxScope = (boxState.id || "classic") + "|";
  const commitLibrary = (library: Library) => {
    if (boxStoreRef.current.error) throw Error(boxStoreRef.current.error);
    saveBoxLibrary(library);
    boxStoreRef.current = { library };
    setBoxStore({ library });
  };
  const saveBindings = (bindings: Record<string, string>) =>
    commitLibrary(bindBox(boxStoreRef.current.library, boxState.id, bindings));
  const [boxAddressing, setBoxAddressing] = useState<LockerAssignment[]>();
  const [boxIssues, setBoxIssues] = useState<
    Record<string, { address?: string; profile?: string }>
  >({});
  const [state, setState] = useState<AppState>();
  const [page, setPage] = useState<
    "cameras" | "boxes" | "diagnostic" | "network" | "preferences" | "defaults"
  >("cameras");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("quasar-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("quasar-sidebar-collapsed", String(next));
    } catch {}
  };
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("sezaam-theme");
      return saved === "dark" || saved === "light"
        ? saved
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    } catch {
      return "dark";
    }
  });
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [autoLogin, setAutoLogin] = useState<AutoLoginStatus>();
  const autoLoginAttempted = useRef(false);
  const [selected, setSelected] = useState("");
  const selectedRef = useRef("");
  const previewGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const [cameraReader] = useState(() => new CameraReader(window.sezaam));
  useEffect(() => () => cameraReader.cancel(), [cameraReader]);
  const activeStream = useRef("");
  const [detail, setDetail] = useState<CameraDetail>();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("ip-asc");
  const [preferences, setPreferences] = useState(readPreferences);
  const [previewProfiles, setPreviewProfiles] = useState<any[]>([]);
  const [startingVideo, setStartingVideo] = useState(false);
  useEffect(() => {
    localStorage.setItem("quasar-preferences", JSON.stringify(preferences));
  }, [preferences]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const [add, setAdd] = useState(false);
  const [addressing, setAddressing] = useState(false);
  const [conflictResolution, setConflictResolution] = useState(false);
  const [factoryResetOpen, setFactoryResetOpen] = useState(false);
  const [manualIP, setManualIP] = useState("");
  const [port, setPort] = useState("80");
  const [loadingCamera, setLoadingCamera] = useState("");
  const [stream, setStream] = useState("");
  const [profile, setProfile] = useState("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const [defaultTargets, setDefaultTargets] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const camera = state?.cameras.find((c) => c.id === selected);
  const adapter = state?.network.adapter;
  const networkWarning = state?.network.warning;
  const networkStatus = networkWarning
    ? "warning"
    : state?.network.ready
      ? "success"
      : "neutral";
  const refresh = async () => {
    const next = await window.sezaam.call("state", undefined);
    setState(next);
    return next;
  };
  const run: Run = async (label, work) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      return await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      try {
        await refresh();
      } catch {}
      busyRef.current = false;
      setBusy("");
    }
  };
  const stop = async () => {
    previewGeneration.current++;
    activeStream.current = "";
    setStream("");
    setStartingVideo(false);
    await window.sezaam.call("stopVideo", undefined).catch(() => {});
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const chooseTheme = (next: "dark" | "light" | "system") => {
    setThemePreference(next);
    try {
      localStorage.setItem("sezaam-theme", next);
    } catch {}
    setTheme(
      next === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next,
    );
  };
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      let saved;
      try {
        saved = localStorage.getItem("sezaam-theme");
      } catch {}
      if (saved !== "dark" && saved !== "light")
        setTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!expanded || !previewRef.current) return;
    const preview = previewRef.current;
    const previous = document.activeElement as HTMLElement;
    // Keep keyboard and pointer interaction inside the enlarged preview.
    const siblings: HTMLElement[] = [];
    let node: HTMLElement = preview;
    while (node.parentElement && node.parentElement !== document.body) {
      for (const sibling of node.parentElement.children)
        if (
          sibling !== node &&
          sibling instanceof HTMLElement &&
          !sibling.inert
        ) {
          sibling.inert = true;
          siblings.push(sibling);
        }
      node = node.parentElement;
    }
    preview.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [
        ...preview.querySelectorAll<HTMLElement>(
          'button:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    preview.addEventListener("keydown", trap);
    return () => {
      preview.removeEventListener("keydown", trap);
      siblings.forEach((s) => (s.inert = false));
      previous?.focus();
    };
  }, [expanded]);
  useEffect(() => {
    void window.sezaam
      .call("getAutoLogin", undefined)
      .then(setAutoLogin)
      .catch(() =>
        setAutoLogin({
          enabled: false,
          available: false,
          error: t(
            "Impossible de lire les paramètres de connexion automatique.",
          ),
        }),
      );
    void run(t("Lecture de la connexion Ethernet"), refresh);
    const offNetwork = window.sezaam.onNetworkChanged((network) => {
      setState((s) => (s ? { ...s, network } : s));
    });
    const offInvalidated = window.sezaam.onInvalidated((reason) => {
      selectionGeneration.current++;
      previewGeneration.current++;
      activeStream.current = "";
      selectedRef.current = "";
      setSelected("");
      setDetail(undefined);
      setStream("");
      setExpanded(false);
      setProfile("");
      setLoadingCamera("");
      setDirty(false);
      setState((s) =>
        s
          ? {
              ...s,
              cameras: [],
              session: { ...s.session, connected: 0, total: 0, failures: [] },
            }
          : s,
      );
      setError(
        reason +
          (dirtyRef.current
            ? t(
                " Les modifications locales non appliquées ont été abandonnées après la perte de l’identité réseau ; aucun réglage n’a été envoyé.",
              )
            : ""),
      );
    });
    return () => {
      offNetwork();
      offInvalidated();
    };
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  const loadCamera = async (
    id: string,
    fresh = false,
    onProfiles?: (profiles: any[]) => void,
    scope?: "network",
  ) => {
    const generation = selectionGeneration.current;
    const current = () =>
      selectedRef.current === id && selectionGeneration.current === generation;
    const accept = (d: CameraDetail) => {
      if (!current()) return;
      setDetail(d);
      setPreviewProfiles(d.profiles);
      onProfiles?.(d.profiles);
      setProfile((p) =>
        d.profiles.some((x) => tok(x) === p)
          ? p
          : tok(preferredProfile(d.profiles)),
      );
    };
    setLoadingCamera(id);
    try {
      const d = await cameraReader.read(id, fresh, current, accept, scope);
      return d;
    } finally {
      if (current())
        setLoadingCamera((current) => (current === id ? "" : current));
    }
  };
  useEffect(
    () =>
      window.sezaam.onPreviewLighting?.((update) => {
        if (
          update.id === selectedRef.current &&
          update.url === activeStream.current &&
          update.warning
        )
          setError(update.warning);
      }),
    [],
  );
  const startPreview = async (id: string, profileToken: string) => {
    const generation = previewGeneration.current;
    setStartingVideo(true);
    try {
      const result = await window.sezaam.call("startVideo", {
        id,
        profile: profileToken,
      });
      if (
        generation === previewGeneration.current &&
        selectedRef.current === id
      ) {
        activeStream.current = result.url;
        setStream(result.url);
      }
    } catch (error) {
      if (generation === previewGeneration.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === previewGeneration.current) setStartingVideo(false);
    }
  };
  const select = async (c: Camera) => {
    const generation = ++selectionGeneration.current;
    const current = () =>
      generation === selectionGeneration.current &&
      selectedRef.current === c.id;
    selectedRef.current = c.id;
    setSelected(c.id);
    setDetail(undefined);
    setProfile("");
    setPreviewProfiles([]);
    setDirty(false);
    setExpanded(false);
    setError("");
    setLoadingCamera(c.status.startsWith("Connectée") ? c.id : "");
    await Promise.all([
      stop(),
      window.sezaam.call("cancelCameraRead", undefined).catch(() => {}),
    ]);
    if (!current()) return;
    if (c.status.startsWith("Connectée")) {
      let profilesChosen = false;
      const chooseProfiles = (profiles: any[]) => {
        if (!current() || profilesChosen || !profiles.length) return;
        profilesChosen = true;
        setPreviewProfiles(profiles);
        const chosen = tok(preferredProfile(profiles));
        setProfile(chosen);
        if (preferences.autoplay && chosen && page === "cameras")
          void startPreview(c.id, chosen);
      };
      try {
        const profiles = await window.sezaam.call("previewProfiles", {
          id: c.id,
        });
        if (!current()) return;
        chooseProfiles(profiles);
      } catch (e) {
        if (current()) setError(e instanceof Error ? e.message : String(e));
      }
      if (!current()) return;
      try {
        await loadCamera(c.id, false, chooseProfiles);
      } catch (e) {
        if (current() && String(e) !== "Error: Lecture remplacée.")
          setError(e instanceof Error ? e.message : String(e));
      }
    }
  };
  const beforeSessionChange = async () =>
    !dirty ||
    (await confirm(
      t(
        "Abandonner les modifications non enregistrées avant de changer de session ?",
      ),
    ));
  const choose = async (c: Camera) => {
    if (busyRef.current) return;
    if (c.id === selected) return;
    if (
      dirty &&
      !(await confirm(
        t("Abandonner les modifications non enregistrées de cette caméra ?"),
      ))
    )
      return;
    await select(c);
  };
  const read = async (scope?: "network") => {
    return loadCamera(selectedRef.current, true, undefined, scope);
  };
  const reloadCamera = async () => {
    const generation = selectionGeneration.current;
    setError("");
    try {
      await read();
    } catch (e) {
      if (
        generation === selectionGeneration.current &&
        String(e) !== "Error: Lecture remplacée."
      )
        setError(e instanceof Error ? e.message : String(e));
    }
  };
  const navigate = async (p: typeof page) => {
    if (busyRef.current) return;
    if (p !== page) {
      if (
        dirty &&
        !(await confirm(t("Abandonner les modifications non enregistrées ?")))
      )
        return;
      setDirty(false);
      const generation = ++selectionGeneration.current;
      setLoadingCamera("");
      const stopping = stop();
      void window.sezaam.call("cancelCameraRead", undefined).catch(() => {});
      setExpanded(false);
      setPage(p);
      await stopping;
      if (generation !== selectionGeneration.current) return;
      if (p === "cameras" && preferences.autoplay && profile && detail)
        void startPreview(selectedRef.current, profile);
      else if (p === "cameras" && camera && !detail) void select(camera);
    }
  };
  const applyDefaults = async (ids: string[]) => {
    if (busyRef.current || !ids.length) return;
    if (
      dirty &&
      !(await confirm(
        t(
          "Abandonner les modifications non enregistrées avant de vérifier le profil ?",
        ),
      ))
    )
      return;
    setDirty(false);
    await stop();
    setDefaultTargets(ids);
  };
  const visible = (state?.cameras ?? [])
    .filter((c) =>
      [c.name, c.ip, c.model, c.serial, c.mac, c.endpoint].some((v) =>
        v?.toLowerCase().includes(search.toLowerCase()),
      ),
    )
    .sort((a, b) =>
      sort === "name"
        ? (a.name || a.model || "").localeCompare(b.name || b.model || "", "fr")
        : compareCameraIPs(a.ip, b.ip) * (sort === "ip-desc" ? -1 : 1),
    );
  const report = state?.reports.find((r) => r.cameraId === selected);
  const unavailable =
    loadingCamera === selected && selected
      ? t("Lecture des paramètres de la caméra en cours…")
      : !camera
        ? t("Sélectionnez une caméra pour afficher ses paramètres.")
        : camera.connectionError
          ? t(
              "Cette caméra n’est pas connectée. Consultez l’erreur affichée, puis utilisez « Réessayer les connexions ».",
            )
          : state?.session.active
            ? t(
                "Les paramètres de cette caméra ne sont pas chargés. Relancez leur lecture ou la connexion.",
              )
            : t(
                "Utilisez « Se connecter » dans la barre latérale pour accéder aux caméras.",
              );
  const sessionWork = (label: string, work: () => Promise<unknown>) =>
    void run(label, async () => {
      await stop();
      setDetail(undefined);
      setDirty(false);
      setExpanded(false);
      await work();
      const next = await refresh();
      const current =
        next.cameras.find((c) => c.id === selectedRef.current) ??
        next.cameras.find((c) => c.status.startsWith("Connectée"));
      if (current) void select(current);
      const failed = next.session.total - next.session.connected;
      if (failed)
        setError(
          t(
            "{0} caméra(s) connectée(s), {1} à vérifier. Sélectionnez une caméra en erreur pour en connaître la cause, puis utilisez « Réessayer les connexions ».",
            next.session.connected,
            failed,
          ),
        );
      else
        setNotice(
          next.session.total
            ? t("{0} caméra(s) connectée(s).", next.session.connected)
            : t("Session prête. Lancez la détection ou ajoutez une caméra."),
        );
    });
  useEffect(() => {
    if (
      !autoLogin?.enabled ||
      !state?.network.ready ||
      busy ||
      dirty ||
      autoLoginAttempted.current
    )
      return;
    autoLoginAttempted.current = true;
    if (!state.session.active)
      sessionWork(t("Connexion automatique aux caméras"), () =>
        window.sezaam.call("connectSavedSession", undefined),
      );
  }, [autoLogin, state?.network.ready, state?.session.active, busy, dirty]);
  const resetBoxContext = async () => {
    const generation = ++selectionGeneration.current;
    cameraReader.cancel();
    selectedRef.current = "";
    setSelected("");
    setDetail(undefined);
    setLoadingCamera("");
    setDirty(false);
    setBoxAddressing(undefined);
    setExpanded(false);
    await stop();
    return generation;
  };
  const switchBox = async (id: string) => {
    if (
      busyRef.current ||
      !boxStoreRef.current.library.entries.some((e) => e.id === id)
    )
      return;
    if (
      dirty &&
      !(await confirm(
        t("Abandonner les modifications caméra avant de changer de Box ?"),
      ))
    )
      return;
    try {
      const generation = await resetBoxContext();
      if (generation !== selectionGeneration.current) return;
      commitLibrary({ ...boxStoreRef.current.library, activeId: id });
      setCameraMode("box");
      setPage("cameras");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveBoxDefinition = async (
    incoming: BoxDefinition,
    editingId?: string,
  ) => {
    if (busyRef.current) return false;
    if (
      dirty &&
      !(await confirm(
        t("Abandonner les modifications caméra non enregistrées ?"),
      ))
    )
      return false;
    const generation = await resetBoxContext();
    if (generation !== selectionGeneration.current) return false;
    const next = upsertBox(boxStoreRef.current.library, incoming, editingId);
    commitLibrary(next.library);
    setCameraMode("box");
    setPage("cameras");
    setNotice(
      next.updating
        ? t("Box mise à jour. Associations des casiers présents conservées.")
        : t(
            "Box ajoutée à la bibliothèque. Vérifiez les associations caméra–casier.",
          ),
    );
    return true;
  };
  const openAddressing = async (conflicts = false) => {
    if (
      dirty &&
      !(await confirm(
        t("Abandonner les modifications non enregistrées avant l’adressage ?"),
      ))
    )
      return;
    setDirty(false);
    await stop();
    setBoxAddressing(undefined);
    setConflictResolution(conflicts);
    setAddressing(true);
  };
  const AddressDialog = conflictResolution ? IPConflicts : Addressing;
  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <header className="titlebar">
        <Button
          className="sidebar-toggle icon-button"
          aria-label={
            sidebarCollapsed
              ? t("Ouvrir la barre latérale")
              : t("Réduire la barre latérale")
          }
          title={
            sidebarCollapsed
              ? t("Ouvrir la barre latérale")
              : t("Réduire la barre latérale")
          }
          aria-expanded={!sidebarCollapsed}
          aria-controls="primary-sidebar"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={20} />
          ) : (
            <PanelLeftClose size={20} />
          )}
        </Button>
        <div className="brand">
          <Brand />
          <span>{t("Configuration et diagnostic des caméras IP")}</span>
        </div>
        <div className="title-actions">
          <Status kind={networkStatus}>
            {networkWarning || (adapter?.link && !state?.network.ready)
              ? t("Adressage Ethernet à vérifier")
              : state?.network.ready
                ? t("Ethernet disponible")
                : t("Ethernet à brancher")}
          </Status>
          <div className="divider" />
          <Button
            className="theme-toggle"
            title={
              theme === "dark"
                ? t("Activer le thème clair")
                : t("Activer le thème sombre")
            }
            aria-label={
              theme === "dark"
                ? t("Activer le thème clair")
                : t("Activer le thème sombre")
            }
            onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </Button>
        </div>
      </header>
      <aside className="sidebar" id="primary-sidebar">
        <nav aria-label={t("Navigation principale")}>
          <span className="nav-group-label">{t("Interventions")}</span>
          <Button
            className={page === "cameras" ? "nav-item active" : "nav-item"}
            aria-label={t("Caméras")}
            title={t("Caméras")}
            aria-current={page === "cameras" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("cameras")}
          >
            <CameraIcon />
            <span>{t("Caméras")}</span>
          </Button>
          <Button
            className={page === "boxes" ? "nav-item active" : "nav-item"}
            title={t("Mes Box")}
            aria-current={page === "boxes" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("boxes")}
          >
            <Boxes />
            <span>{t("Mes Box")}</span>
            <span className="nav-count">{boxLibrary.entries.length}</span>
          </Button>
          <span className="nav-group-label">{t("Outils")}</span>
          <Button
            className={
              ["diagnostic", "network"].includes(page)
                ? "nav-item active"
                : "nav-item"
            }
            aria-label={t("Diagnostic")}
            title={t("Diagnostic et réseau")}
            aria-current={
              ["diagnostic", "network"].includes(page) ? "page" : undefined
            }
            disabled={!!busy}
            onClick={() => navigate("diagnostic")}
          >
            <Activity />
            <span>{t("Diagnostic")}</span>
          </Button>
          <Button
            className={
              ["preferences", "defaults"].includes(page)
                ? "nav-item active"
                : "nav-item"
            }
            aria-label={t("Paramètres")}
            title={t("Paramètres")}
            aria-current={
              ["preferences", "defaults"].includes(page) ? "page" : undefined
            }
            disabled={!!busy}
            onClick={() => navigate("preferences")}
          >
            <SettingsIcon />
            <span>{t("Paramètres")}</span>
          </Button>
        </nav>
        <div className="sidebar-bottom">
          <Button
            className="sidebar-network"
            aria-label={`${state?.network.ready ? t("Ethernet connecté") : t("Ethernet à vérifier")} · ${t("État du réseau Ethernet")}`}
            title={t("État du réseau Ethernet")}
            onClick={() => navigate("network")}
          >
            <Status kind={networkStatus}>
              <span>
                {state?.network.ready
                  ? t("Ethernet connecté")
                  : t("Ethernet à vérifier")}
              </span>
            </Status>
          </Button>
          <SessionBar
            session={state?.session}
            busy={!!busy}
            ready={!!state?.network.ready}
            beforeChange={beforeSessionChange}
            onConnect={(credentials) => {
              autoLoginAttempted.current = true;
              sessionWork(t("Connexion aux caméras"), () =>
                window.sezaam.call("connectSession", credentials),
              );
            }}
            onRetry={() =>
              sessionWork(t("Nouvelle tentative de connexion"), () =>
                window.sezaam.call("retryConnections", undefined),
              )
            }
            onDisconnect={() => {
              autoLoginAttempted.current = true;
              void run(t("Déconnexion de la session"), async () => {
                await stop();
                setExpanded(false);
                setDetail(undefined);
                setProfile("");
                setDirty(false);
                await window.sezaam.call("disconnectSession", undefined);
                setNotice(t("Session déconnectée."));
              });
            }}
          />
        </div>
      </aside>
      <main className={`workspace workspace-${page}`} aria-busy={!!busy}>
        <h1 className="sr-only">
          {page === "cameras"
            ? t("Caméras")
            : page === "boxes"
              ? t("Mes Box")
              : page === "network"
                ? t("Réseau Ethernet")
                : page === "preferences"
                  ? t("Paramètres de l’application")
                  : page === "defaults"
                    ? t("Paramètres par défaut")
                    : t("Diagnostic des caméras")}
        </h1>
        {busy && <Loading label={t(busy)} />}
        {error && !add && (
          <Alert kind="danger" onDismiss={() => setError("")}>
            {t(error)}
          </Alert>
        )}
        {notice && (
          <div className="toast">
            <Alert kind="success" onDismiss={() => setNotice("")}>
              {t(notice)}
            </Alert>
          </div>
        )}
        {boxStore.error && <Alert kind="danger">{boxStore.error}</Alert>}
        {["diagnostic", "network"].includes(page) && (
          <div className="page-section-header">
            <h2>{t("Diagnostic")}</h2>
            <div
              className="page-tabs"
              role="group"
              aria-label={t("Rubriques du diagnostic")}
            >
              <Button
                aria-pressed={page === "diagnostic"}
                disabled={!!busy}
                onClick={() => navigate("diagnostic")}
              >
                {t("Caméras et journal")}
              </Button>
              <Button
                aria-pressed={page === "network"}
                disabled={!!busy}
                onClick={() => navigate("network")}
              >
                {t("Réseau Ethernet")}
              </Button>
            </div>
          </div>
        )}
        {["preferences", "defaults"].includes(page) && (
          <div className="page-section-header">
            <h2>{t("Paramètres")}</h2>
            <div
              className="page-tabs"
              role="group"
              aria-label={t("Rubriques des paramètres")}
            >
              <Button
                aria-pressed={page === "preferences"}
                disabled={!!busy}
                onClick={() => navigate("preferences")}
              >
                {t("Application")}
              </Button>
              <Button
                aria-pressed={page === "defaults"}
                disabled={!!busy}
                onClick={() => navigate("defaults")}
              >
                {t("Profil Sezaam")}
              </Button>
            </div>
          </div>
        )}
        {page === "cameras" && (
          <div className="camera-context-bar">
            <div
              className="camera-mode-switch"
              role="group"
              aria-label={t("Mode de configuration")}
            >
              {(["classic", "box"] as const).map((mode) => (
                <Button
                  key={mode}
                  disabled={!!busy}
                  aria-pressed={cameraMode === mode}
                  onClick={async () => {
                    if (mode === cameraMode) return;
                    if (
                      dirty &&
                      !(await confirm(
                        t(
                          "Abandonner les modifications non enregistrées avant de changer de mode ?",
                        ),
                      ))
                    )
                      return;
                    setDirty(false);
                    selectionGeneration.current++;
                    cameraReader.cancel();
                    selectedRef.current = "";
                    setSelected("");
                    setDetail(undefined);
                    setLoadingCamera("");
                    await stop();
                    setCameraMode(mode);
                  }}
                >
                  {mode === "classic" ? t("Classique") : "Box"}
                </Button>
              ))}
            </div>
            {cameraMode === "box" && (
              <div className="box-switcher">
                <Select
                  label={t("Changer de Box")}
                  value={boxState.id}
                  disabled={
                    !!busy || !!boxStore.error || !boxLibrary.entries.length
                  }
                  onChange={(id) => void switchBox(id)}
                  options={boxLibrary.entries.map((e) => ({
                    value: e.id,
                    label:
                      e.box.name +
                      (e.box.metadata?.id ? " · #" + e.box.metadata.id : ""),
                  }))}
                />
                <Button disabled={!!busy} onClick={() => navigate("boxes")}>
                  {t("Mes Box")}
                </Button>
              </div>
            )}
          </div>
        )}
        {page === "boxes" ? (
          <BoxLibrary
            library={boxLibrary}
            busy={!!busy || !!boxStore.error}
            onOpen={(id) => void switchBox(id)}
            onSave={saveBoxDefinition}
          />
        ) : page === "cameras" ? (
          <div
            className={`camera-workspace${cameraMode === "box" ? " box-mode" : ""}`}
          >
            {cameraMode === "box" ? (
              <BoxView
                key={boxState.id}
                box={boxState.box}
                bindings={boxState.bindings}
                cameras={state?.cameras ?? []}
                busy={!!busy || !!boxStore.error}
                ready={!!state?.network.ready}
                issues={Object.fromEntries(
                  Object.entries(boxIssues)
                    .filter(([key]) => key.startsWith(boxScope))
                    .map(([key, issues]) => [
                      key.slice(boxScope.length),
                      Object.values(issues).filter(Boolean).join(" · "),
                    ]),
                )}
                onImport={(incoming, editing) =>
                  saveBoxDefinition(incoming, editing ? boxState.id : undefined)
                }
                onBind={(number, key) => {
                  try {
                    const bindings = { ...boxState.bindings, [number]: key };
                    saveBindings(bindings);
                  } catch {
                    setError(
                      "Impossible d’enregistrer l’association sur cet ordinateur.",
                    );
                  }
                }}
                onCamera={async (c) => {
                  if (!c) {
                    if (!(await beforeSessionChange())) return false;
                    await resetBoxContext();
                    return true;
                  }
                  await choose(c);
                  if (selectedRef.current !== c.id) return false;
                  requestAnimationFrame(() => {
                    if (selectedRef.current !== c.id) return;
                    const workspace = document.querySelector<HTMLElement>(
                      ".camera-workspace.box-mode",
                    );
                    const content =
                      workspace?.querySelector<HTMLElement>(".camera-content");
                    if (workspace && content)
                      workspace.scrollTo({
                        top:
                          workspace.scrollTop +
                          content.getBoundingClientRect().top -
                          workspace.getBoundingClientRect().top,
                        behavior: "instant",
                      });
                  });
                  return true;
                }}
                onDetect={() =>
                  void run(t("Détection des caméras de la Box"), () =>
                    window.sezaam.call("discover", undefined),
                  )
                }
                onResolveConflicts={() => void openAddressing(true)}
                onAddress={(assignments) => {
                  void (async () => {
                    if (
                      dirty &&
                      !(await confirm(
                        t(
                          "Abandonner les modifications non enregistrées avant l’adressage ?",
                        ),
                      ))
                    )
                      return;
                    const bindings = { ...boxState.bindings };
                    for (const item of assignments) {
                      const c = state?.cameras.find((c) => c.id === item.id);
                      if (c) bindings[String(item.locker)] = cameraKey(c);
                    }
                    try {
                      saveBindings(bindings);
                    } catch {
                      setError(
                        t(
                          "Impossible d’enregistrer les associations. Attribution annulée.",
                        ),
                      );
                      return;
                    }
                    setDirty(false);
                    await stop();
                    setConflictResolution(false);
                    setBoxAddressing(assignments);
                    setAddressing(true);
                  })();
                }}
                onProfile={(ids) => void applyDefaults(ids)}
              />
            ) : (
              <Panel
                className="camera-list panel"
                aria-label={t("Liste des caméras")}
              >
                <div className="section-title">
                  <h2>
                    {t("Caméras détectées")}{" "}
                    <span>({state?.cameras.length || 0})</span>
                  </h2>
                  <Button
                    className="icon-button"
                    aria-label={t("Relancer la détection")}
                    disabled={!!busy || !state?.network.ready}
                    onClick={() =>
                      void run(t("Détection ONVIF"), async () => {
                        const cs = await window.sezaam.call(
                          "discover",
                          undefined,
                        );
                        setNotice(
                          t("{0} caméra(s) dans cette session.", cs.length),
                        );
                      })
                    }
                  >
                    <RefreshCw size={18} />
                  </Button>
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label={t("Rechercher une caméra")}
                    placeholder={t("Rechercher une caméra…")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  className="camera-sort"
                  aria-label={t("Trier les caméras")}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="ip-asc">{t("IP croissante")}</option>
                  <option value="ip-desc">{t("IP décroissante")}</option>
                  <option value="name">{t("Nom de la caméra")}</option>
                </select>
                <div className="list-scroll">
                  {visible.map((c) => (
                    <CameraCard
                      key={c.id}
                      camera={c}
                      selected={c.id === selected}
                      disabled={!!busy}
                      onSelect={() => void choose(c)}
                    />
                  ))}
                  {!visible.length && (
                    <div className="list-empty">
                      <Search size={30} />
                      <strong>
                        {search
                          ? t("Aucun résultat")
                          : t("Aucune caméra détectée")}
                      </strong>
                      <p>
                        {search
                          ? t("Essayez une autre IP ou référence.")
                          : t("Lancez la détection ou ajoutez une adresse IP.")}
                      </p>
                      <Button
                        className="primary"
                        disabled={!!busy || !state?.network.ready}
                        onClick={() =>
                          search
                            ? setSearch("")
                            : void run(t("Détection ONVIF"), () =>
                                window.sezaam.call("discover", undefined),
                              )
                        }
                      >
                        <RefreshCw size={16} />
                        {search ? t("Effacer la recherche") : t("Détecter")}
                      </Button>
                    </div>
                  )}
                </div>
                <Button
                  className="add-camera"
                  disabled={!!busy}
                  onClick={() => {
                    setError("");
                    setAdd(true);
                  }}
                >
                  <Plus size={16} />
                  {t("Ajouter par IP")}
                </Button>
                <Button
                  className="add-camera"
                  disabled={!!busy || !state?.cameras.length}
                  onClick={() =>
                    void applyDefaults(state!.cameras.map((c) => c.id))
                  }
                >
                  <SlidersHorizontal size={16} />
                  {t("Profil Sezaam · toutes")}
                </Button>
                {state?.cameras.some((c) => c.ambiguous) && (
                  <Button
                    className="add-camera"
                    disabled={!!busy || !state.network.ready}
                    onClick={() => void openAddressing(true)}
                  >
                    <Network size={16} />
                    {t("Résoudre les conflits")}
                  </Button>
                )}
                <details className="camera-maintenance">
                  <summary>{t("Actions avancées")}</summary>
                  <Button
                    className="add-camera"
                    disabled={
                      !!busy || !state?.network.ready || !state?.cameras.length
                    }
                    onClick={() => void openAddressing(false)}
                  >
                    <Network size={16} />
                    {t("Attribuer les IP")}
                  </Button>
                  <Button
                    className="add-camera"
                    variant="tertiary"
                    disabled={
                      !!busy || !state?.network.ready || !state?.cameras.length
                    }
                    onClick={async () => {
                      if (
                        dirty &&
                        !(await confirm(
                          t(
                            "Abandonner les modifications non enregistrées avant de préparer le reset ?",
                          ),
                        ))
                      )
                        return;
                      setDirty(false);
                      await stop();
                      setFactoryResetOpen(true);
                    }}
                  >
                    {t("Réinitialiser les caméras…")}
                  </Button>
                </details>
                <Modal
                  open={add}
                  title={t("Ajouter une caméra par IP")}
                  onClose={() => {
                    if (!busy) {
                      setAdd(false);
                      setError("");
                    }
                  }}
                >
                  {error && <Alert kind="danger">{error}</Alert>}
                  <form
                    className="manual-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(t("Ajout de la caméra"), async () => {
                        const c = await window.sezaam.call("addCamera", {
                          ip: manualIP.trim(),
                          port: Number(port),
                        });
                        setAdd(false);
                        await select(c);
                      });
                    }}
                  >
                    <Field label={t("Adresse IPv4")}>
                      <input
                        autoFocus
                        required
                        value={manualIP}
                        placeholder="192.168.1.11"
                        onChange={(e) => setManualIP(e.target.value)}
                      />
                    </Field>
                    <Field label={t("Port ONVIF")}>
                      <input
                        type="number"
                        required
                        min="1"
                        max="65535"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                      />
                    </Field>
                    <Button className="primary" type="submit" disabled={!!busy}>
                      {t("Ajouter")}
                    </Button>
                  </form>
                </Modal>
              </Panel>
            )}
            <div
              className="camera-content"
              hidden={cameraMode === "box" && !camera}
            >
              <Panel className="camera-overview panel">
                <div className="camera-heading">
                  <CameraIcon size={24} />
                  <div>
                    <h2>
                      {camera?.name ||
                        camera?.model ||
                        (camera
                          ? t("Caméra ONVIF")
                          : t("Aucune caméra sélectionnée"))}
                    </h2>
                    <p>
                      {camera
                        ? `${camera.model || t("Modèle non disponible")}  ·  SN : ${value(camera.serial)}  ·  Firmware : ${value(camera.firmware)}`
                        : t(
                            "Sélectionnez une caméra dans la liste pour consulter ses informations.",
                          )}
                    </p>
                  </div>
                  {camera && (
                    <Button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void run(t("Ouverture de l’interface web"), () =>
                          window.sezaam.call("openWeb", { id: camera.id }),
                        )
                      }
                    >
                      <ExternalLink size={15} />
                      {t("Ouvrir l’interface web")}
                    </Button>
                  )}
                </div>
                {camera && !detail && (
                  <div className="camera-read-state">
                    {loadingCamera === camera.id ? (
                      <div className="inline-note" role="status">
                        <LoaderCircle className="spin" size={16} />
                        {t("Lecture des paramètres…")}
                      </div>
                    ) : (
                      <>
                        <Alert
                          kind={camera.connectionError ? "warning" : "info"}
                        >
                          {camera.connectionError || unavailable}
                        </Alert>
                        {state?.session.active &&
                          camera.status.startsWith("Connectée") && (
                            <Button
                              disabled={!!busy}
                              onClick={() => void reloadCamera()}
                            >
                              {t("Relire les paramètres")}
                            </Button>
                          )}
                      </>
                    )}
                  </div>
                )}
                <div className="preview-info">
                  <div
                    className={expanded ? "preview expanded" : "preview"}
                    ref={previewRef}
                    role={expanded ? "dialog" : undefined}
                    aria-modal={expanded || undefined}
                    aria-label={
                      expanded ? t("Aperçu vidéo agrandi") : undefined
                    }
                  >
                    {stream ? (
                      <VideoPlayer
                        key={stream}
                        url={stream}
                        lowLatency={preferences.lowLatency}
                        onFailure={(message) => {
                          if (activeStream.current !== stream) return;
                          setError(message);
                          void stop();
                        }}
                      />
                    ) : startingVideo ? (
                      <div className="preview-placeholder">
                        <LoaderCircle className="spin" />
                        <strong>{t("Connexion au direct…")}</strong>
                      </div>
                    ) : (
                      <VideoPlaceholder
                        selected={!!camera}
                        connected={!!detail}
                      />
                    )}
                    <div className="preview-toolbar">
                      <select
                        aria-label={t("Profil de l’aperçu vidéo")}
                        value={profile}
                        disabled={
                          !previewProfiles.length || !!busy || startingVideo
                        }
                        onChange={(e) => {
                          const next = e.target.value;
                          setProfile(next);
                          if (stream || startingVideo) {
                            const stopping = stop();
                            const generation = previewGeneration.current;
                            void stopping.then(() => {
                              if (
                                generation === previewGeneration.current &&
                                selectedRef.current === selected
                              )
                                void startPreview(selected, next);
                            });
                          }
                        }}
                      >
                        <option value="">{t("Choisir un flux")}</option>
                        {previewProfiles.map((p) => (
                          <option key={tok(p)} value={tok(p)}>
                            {p.name || tok(p)}
                          </option>
                        ))}
                      </select>
                      {stream || startingVideo ? (
                        <Button
                          className="secondary"
                          onClick={() => void stop()}
                        >
                          <Square size={14} />
                          {t("Arrêter")}
                        </Button>
                      ) : (
                        <Button
                          className="primary"
                          disabled={!profile || !!busy}
                          onClick={() => void startPreview(selected, profile)}
                        >
                          <Play size={15} />
                          {t("Lire")}
                        </Button>
                      )}
                      <Button
                        className="icon-button"
                        aria-label={
                          expanded
                            ? t("Réduire l’aperçu")
                            : t("Agrandir l’aperçu")
                        }
                        disabled={!camera}
                        onClick={() => setExpanded(!expanded)}
                      >
                        {expanded ? <X size={18} /> : <Maximize size={18} />}
                      </Button>
                    </div>
                  </div>
                  <CameraFacts camera={camera}>
                    {detail && (
                      <Button
                        className="text-button"
                        disabled={!!busy || dirty || loadingCamera === selected}
                        onClick={() => void reloadCamera()}
                      >
                        <RefreshCw size={14} />
                        {t("Relire les informations")}
                      </Button>
                    )}
                  </CameraFacts>
                </div>
              </Panel>
              {camera && (
                <div className="camera-default-action">
                  <span>{t("Configuration Sezaam")}</span>
                  <Button
                    disabled={!!busy}
                    onClick={() => void applyDefaults([camera.id])}
                  >
                    <SlidersHorizontal size={16} />
                    {t("Appliquer le profil à cette caméra")}
                  </Button>
                </div>
              )}
              {detail && (
                <p className="detail-freshness" role="status">
                  {detail.loading
                    ? t("Lecture en cours · blocs disponibles affichés")
                    : detail.readState === "cached"
                      ? t(
                          "Informations en mémoire · utilisez Relire pour les actualiser",
                        )
                      : detail.readState === "partial"
                        ? t(
                            "Lecture partielle · certains blocs sont conservés en mémoire",
                          )
                        : t("Informations lues sur la caméra")}
                  {detail.readAt &&
                    " · " +
                      new Date(detail.readAt).toLocaleTimeString(getLanguage())}
                </p>
              )}
              <Settings
                key={selected}
                detail={detail}
                unavailable={unavailable}
                busy={!!busy}
                onDirty={setDirty}
                run={run}
                onNetworkResult={(result) => {
                  if (result.verified) {
                    setNotice(result.message);
                  } else {
                    selectionGeneration.current++;
                    cameraReader.cancel();
                    selectedRef.current = "";
                    setSelected("");
                    setDetail(undefined);
                    setLoadingCamera("");
                    setDirty(false);
                    setError(
                      result.message +
                        t(
                          " Relancez la détection ou utilisez Résoudre les conflits.",
                        ),
                    );
                  }
                }}
                onRefresh={read}
                onStop={stop}
              />
            </div>
          </div>
        ) : page === "network" ? (
          <div className="network-page">
            <h2>{t("Réseau Ethernet")}</h2>
            <p className="help-text">
              {t("Liaison entre le Mac, le switch PoE et les caméras.")}
            </p>{" "}
            <section
              className="network-strip"
              aria-label={t("Informations réseau")}
            >
              <div className="network-connection">
                <Network size={32} />
                <div>
                  <strong>{t("Connexion Ethernet des caméras")}</strong>
                  <p>
                    {adapter?.service || t("Branchez le hub et le câble RJ45")}
                  </p>
                  <code>
                    {adapter?.address || t("Aucune IPv4")}
                    {adapter?.mask ? ` / ${adapter.mask}` : ""}
                  </code>
                </div>
                <Button
                  className="icon-button"
                  aria-label={t("Actualiser la connexion Ethernet")}
                  disabled={!!busy}
                  onClick={() =>
                    void run(t("Actualisation du réseau"), refresh)
                  }
                >
                  <RefreshCw size={18} />
                </Button>
              </div>
              <div className="network-meta">
                <strong>{t("État du réseau")}</strong>
                <Status kind={networkStatus}>
                  {networkWarning
                    ? t("Adresse IPv4 locale")
                    : state?.network.ready
                      ? t("Connecté")
                      : adapter?.link
                        ? t("IPv4 indisponible")
                        : t("Liaison inactive")}
                </Status>
                <div>
                  <span>
                    {adapter?.mode === "dhcp"
                      ? "DHCP"
                      : adapter?.mode === "manual"
                        ? t("IPv4 statique")
                        : t("Configuration système")}
                  </span>
                  <span>MTU : {value(adapter?.mtu)}</span>
                  <span>
                    {adapter?.media ||
                      t("Paramètres du poste en lecture seule")}
                  </span>
                </div>
              </div>
            </section>
            {state && !state.network.ready && (
              <div className="inline-note" role="status">
                <Cable size={16} />
                {t(state.network.reason)}
              </div>
            )}
            {networkWarning && (
              <Alert kind="warning">{t(networkWarning)}</Alert>
            )}
            {!!state?.network.overlaps.length && (
              <div className="inline-note">
                <Info size={16} />
                {t("Plusieurs interfaces partagent un sous-réseau (")}
                {state.network.overlaps.join(", ")}
                {t("). Le chemin vers chaque caméra sera contrôlé.")}
              </div>
            )}
          </div>
        ) : page === "defaults" ? (
          <DefaultsPage
            busy={!!busy}
            run={run}
            onDirty={setDirty}
            onApply={(ids) => void applyDefaults(ids)}
            cameras={state?.cameras ?? []}
            selected={selected}
          />
        ) : page === "preferences" ? (
          <PreferencesPage
            onLoginDirty={() => setDirty(true)}
            autoLogin={autoLogin}
            busy={!!busy}
            onSaveAutoLogin={async (value) => {
              const saved = await run(
                t("Enregistrement de la connexion"),
                async () => {
                  const next = await window.sezaam.call("saveAutoLogin", value);
                  autoLoginAttempted.current = false;
                  setDirty(false);
                  setAutoLogin(next);
                  setNotice(
                    next.enabled
                      ? t("Connexion automatique enregistrée.")
                      : t(
                          "Connexion automatique désactivée. Identifiants supprimés.",
                        ),
                  );
                  return true;
                },
              );
              return saved === true;
            }}
            preferences={preferences}
            setPreferences={setPreferences}
            theme={themePreference}
            language={language}
            chooseLanguage={chooseLanguage}
            chooseTheme={chooseTheme}
          />
        ) : (
          <Diagnostic
            state={state}
            selected={selected}
            onSelect={(id) => {
              const c = state?.cameras.find((c) => c.id === id);
              if (c) void choose(c);
            }}
            report={report}
            busy={!!busy}
            run={run}
            onNotice={setNotice}
            onConnect={() => navigate("cameras")}
            onStop={stop}
          />
        )}
      </main>
      <DefaultsApply
        targets={defaultTargets}
        busy={!!busy}
        run={run}
        onClose={() => setDefaultTargets(null)}
        onResult={(result) => {
          setBoxIssues((previous) => {
            const next = { ...previous };
            for (const report of result.cameras) {
              const failed = report.rows.filter(
                (row) => row.state !== "same" && row.state !== "verified",
              );
              next[boxScope + cameraKey(report.camera)] = {
                ...next[boxScope + cameraKey(report.camera)],
                profile:
                  report.error ||
                  (failed.length
                    ? t("{0} réglage(s) du profil à vérifier", failed.length)
                    : ""),
              };
            }
            return next;
          });
        }}
        onApplied={async () => {
          if (selectedRef.current) {
            setDetail(undefined);
            await loadCamera(selectedRef.current, true).catch((e) =>
              setError(e.message),
            );
          }
        }}
      />
      {addressing && (
        <AddressDialog
          open
          onClose={() => setAddressing(false)}
          busy={!!busy}
          run={run}
          cameras={state?.cameras ?? []}
          assignments={boxAddressing}
          onApplied={(plan) => {
            if (plan)
              setBoxIssues((previous) => {
                const next = { ...previous };
                for (const row of plan.rows) {
                  const c = state?.cameras.find((c) => c.id === row.id);
                  if (c)
                    next[boxScope + cameraKey(c)] = {
                      ...next[boxScope + cameraKey(c)],
                      address: ["failed", "skipped", "blocked"].includes(
                        row.state,
                      )
                        ? row.message
                        : "",
                    };
                }
                return next;
              });
            setDetail(undefined);
            setSelected("");
            selectedRef.current = "";
            void refresh();
          }}
        />
      )}
      {confirmationDialog}
      {factoryResetOpen && (
        <FactoryResetDialog
          cameras={state?.cameras ?? []}
          busy={!!busy}
          run={run}
          onClose={() => setFactoryResetOpen(false)}
          onApplied={() => {
            setDetail(undefined);
            setSelected("");
            selectedRef.current = "";
            void refresh();
          }}
        />
      )}
    </div>
  );
}
