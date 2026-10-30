import { PreferencesPage } from "./pages/Preferences";
import { CameraReader } from "./camera-reader";
import { Diagnostic } from "./pages/Diagnostic";
import { displayValue as value } from "./format";
import { DefaultsPage, DefaultsApply } from "./Defaults";
import { Addressing } from "./Addressing";
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
import React, { useEffect, useState, useRef } from "react";
import {
  Camera as CameraIcon,
  Activity,
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
  const { confirm, dialog: confirmationDialog } = useConfirmation();
  const [state, setState] = useState<AppState>();
  const [page, setPage] = useState<
    "cameras" | "diagnostic" | "network" | "preferences" | "defaults"
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
  const chooseTheme = (next: "dark" | "light") => {
    try {
      localStorage.setItem("sezaam-theme", next);
    } catch {}
    setTheme(next);
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
    void run("Lecture de la connexion Ethernet", refresh);
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
            ? " Les modifications locales non appliquées ont été abandonnées après la perte de l’identité réseau ; aucun réglage n’a été envoyé."
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
      "Abandonner les modifications non enregistrées avant de changer de session ?",
    ));
  const choose = async (c: Camera) => {
    if (busyRef.current) return;
    if (c.id === selected) return;
    if (
      dirty &&
      !(await confirm(
        "Abandonner les modifications non enregistrées de cette caméra ?",
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
        !(await confirm("Abandonner les modifications non enregistrées ?"))
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
        "Abandonner les modifications non enregistrées avant de vérifier le profil ?",
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
      ? "Lecture des paramètres de la caméra en cours…"
      : !camera
        ? "Sélectionnez une caméra pour afficher ses paramètres."
        : camera.connectionError
          ? "Cette caméra n’est pas connectée. Consultez l’erreur affichée, puis utilisez « Réessayer les connexions »."
          : state?.session.active
            ? "Les paramètres de cette caméra ne sont pas chargés. Relancez leur lecture ou la connexion."
            : "Utilisez « Se connecter » dans la barre latérale pour accéder aux caméras.";
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
          `${next.session.connected} caméra(s) connectée(s), ${failed} à vérifier. Sélectionnez une caméra en erreur pour en connaître la cause, puis utilisez « Réessayer les connexions ».`,
        );
      else
        setNotice(
          next.session.total
            ? `${next.session.connected} caméra(s) connectée(s).`
            : "Session prête. Lancez la détection ou ajoutez une caméra.",
        );
    });
  const openAddressing = async () => {
    if (
      dirty &&
      !(await confirm(
        "Abandonner les modifications non enregistrées avant l’adressage ?",
      ))
    )
      return;
    setDirty(false);
    await stop();
    setAddressing(true);
  };
  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <header className="titlebar">
        <Button
          className="sidebar-toggle icon-button"
          aria-label={
            sidebarCollapsed
              ? "Ouvrir la barre latérale"
              : "Réduire la barre latérale"
          }
          title={
            sidebarCollapsed
              ? "Ouvrir la barre latérale"
              : "Réduire la barre latérale"
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
          <span>Configuration et diagnostic des caméras IP</span>
        </div>
        <div className="title-actions">
          <Status kind={networkStatus}>
            {networkWarning || (adapter?.link && !state?.network.ready)
              ? "Adressage Ethernet à vérifier"
              : state?.network.ready
                ? "Ethernet disponible"
                : "Ethernet à brancher"}
          </Status>
          <div className="divider" />
          <Button
            className="theme-toggle"
            title={
              theme === "dark"
                ? "Activer le thème clair"
                : "Activer le thème sombre"
            }
            aria-label={
              theme === "dark"
                ? "Activer le thème clair"
                : "Activer le thème sombre"
            }
            onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </Button>
        </div>
      </header>
      <aside className="sidebar" id="primary-sidebar">
        <nav aria-label="Navigation principale">
          <Button
            className={page === "cameras" ? "nav-item active" : "nav-item"}
            aria-label="Caméras Configuration et paramètres"
            title={sidebarCollapsed ? "Caméras" : undefined}
            aria-current={page === "cameras" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("cameras")}
          >
            <CameraIcon />
            <span>
              <strong>Caméras</strong>
              <small>Configuration et paramètres</small>
            </span>
          </Button>
          <Button
            className={page === "diagnostic" ? "nav-item active" : "nav-item"}
            aria-label="Diagnostic Tests et résolution de problèmes"
            title={sidebarCollapsed ? "Diagnostic" : undefined}
            aria-current={page === "diagnostic" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("diagnostic")}
          >
            <Activity />
            <span>
              <strong>Diagnostic</strong>
              <small>Tests et résolution de problèmes</small>
            </span>
          </Button>
          <Button
            className={page === "network" ? "nav-item active" : "nav-item"}
            aria-label="Réseau Ethernet"
            title="Réseau"
            aria-current={page === "network" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("network")}
          >
            <Network />
            <span>
              <strong>Réseau</strong>
              <small>Connexion Ethernet</small>
            </span>
          </Button>
          <Button
            className={page === "preferences" ? "nav-item active" : "nav-item"}
            aria-label="Paramètres de l’application"
            title="Paramètres"
            aria-current={page === "preferences" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("preferences")}
          >
            <SettingsIcon />
            <span>
              <strong>Paramètres</strong>
              <small>Lecture et apparence</small>
            </span>
          </Button>
          <Button
            className={page === "defaults" ? "nav-item active" : "nav-item"}
            aria-label="Paramètres par défaut"
            title="Paramètres par défaut"
            aria-current={page === "defaults" ? "page" : undefined}
            disabled={!!busy}
            onClick={() => navigate("defaults")}
          >
            <SlidersHorizontal />
            <span>
              <strong>Profil Sezaam</strong>
              <small>Paramètres par défaut</small>
            </span>
          </Button>
        </nav>
        <div className="sidebar-bottom">
          <Button
            className="sidebar-network"
            aria-label="État du réseau Ethernet"
            title="État du réseau Ethernet"
            onClick={() => navigate("network")}
          >
            <Status kind={networkStatus}>
              <span>
                {state?.network.ready
                  ? "Ethernet connecté"
                  : "Ethernet à vérifier"}
              </span>
            </Status>
          </Button>
          <SessionBar
            session={state?.session}
            busy={!!busy}
            ready={!!state?.network.ready}
            beforeChange={beforeSessionChange}
            onConnect={(credentials) =>
              sessionWork("Connexion aux caméras", () =>
                window.sezaam.call("connectSession", credentials),
              )
            }
            onRetry={() =>
              sessionWork("Nouvelle tentative de connexion", () =>
                window.sezaam.call("retryConnections", undefined),
              )
            }
            onDisconnect={() =>
              void run("Déconnexion de la session", async () => {
                await stop();
                setExpanded(false);
                setDetail(undefined);
                setProfile("");
                setDirty(false);
                await window.sezaam.call("disconnectSession", undefined);
                setNotice("Session déconnectée.");
              })
            }
          />
        </div>
      </aside>
      <main className={`workspace workspace-${page}`} aria-busy={!!busy}>
        <h1 className="sr-only">
          {page === "cameras"
            ? "Caméras"
            : page === "network"
              ? "Réseau Ethernet"
              : page === "preferences"
                ? "Paramètres de l’application"
                : page === "defaults"
                  ? "Paramètres par défaut"
                  : "Diagnostic des caméras"}
        </h1>
        {busy && <Loading label={busy} />}
        {error && !add && (
          <Alert kind="danger" onDismiss={() => setError("")}>
            {error}
          </Alert>
        )}
        {notice && (
          <div className="toast" role="status">
            <Alert kind="success" onDismiss={() => setNotice("")}>
              {notice}
            </Alert>
          </div>
        )}
        {page === "cameras" ? (
          <div className="camera-workspace">
            <Panel className="camera-list panel" aria-label="Liste des caméras">
              <div className="section-title">
                <h2>
                  Caméras détectées <span>({state?.cameras.length || 0})</span>
                </h2>
                <Button
                  className="icon-button"
                  aria-label="Relancer la détection"
                  disabled={!!busy || !state?.network.ready}
                  onClick={() =>
                    void run("Détection ONVIF", async () => {
                      const cs = await window.sezaam.call(
                        "discover",
                        undefined,
                      );
                      setNotice(`${cs.length} caméra(s) dans cette session.`);
                    })
                  }
                >
                  <RefreshCw size={18} />
                </Button>
              </div>
              <label className="search-box">
                <Search size={17} />
                <input
                  aria-label="Rechercher une caméra"
                  placeholder="Rechercher une caméra…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                className="camera-sort"
                aria-label="Trier les caméras"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="ip-asc">IP croissante</option>
                <option value="ip-desc">IP décroissante</option>
                <option value="name">Nom de la caméra</option>
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
                      {search ? "Aucun résultat" : "Aucune caméra détectée"}
                    </strong>
                    <p>
                      {search
                        ? "Essayez une autre IP ou référence."
                        : "Lancez la détection ou ajoutez une adresse IP."}
                    </p>
                    <Button
                      className="primary"
                      disabled={!!busy || !state?.network.ready}
                      onClick={() =>
                        search
                          ? setSearch("")
                          : void run("Détection ONVIF", () =>
                              window.sezaam.call("discover", undefined),
                            )
                      }
                    >
                      <RefreshCw size={16} />
                      {search ? "Effacer la recherche" : "Détecter"}
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
                Ajouter par IP
              </Button>
              <Button
                className="add-camera"
                disabled={!!busy || !state?.cameras.length}
                onClick={() =>
                  void applyDefaults(state!.cameras.map((c) => c.id))
                }
              >
                <SlidersHorizontal size={16} />
                Profil Sezaam · toutes
              </Button>
              {state?.cameras.some((c) => c.ambiguous) && (
                <Button
                  className="add-camera"
                  disabled={!!busy || !state.network.ready}
                  onClick={openAddressing}
                >
                  <Network size={16} />
                  Résoudre les conflits
                </Button>
              )}
              <details className="camera-maintenance">
                <summary>Actions avancées</summary>
                <Button
                  className="add-camera"
                  disabled={
                    !!busy || !state?.network.ready || !state?.cameras.length
                  }
                  onClick={openAddressing}
                >
                  <Network size={16} />
                  Attribuer les IP
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
                        "Abandonner les modifications non enregistrées avant de préparer le reset ?",
                      ))
                    )
                      return;
                    setDirty(false);
                    await stop();
                    setFactoryResetOpen(true);
                  }}
                >
                  Réinitialiser les caméras…
                </Button>
              </details>
              <Modal
                open={add}
                title="Ajouter une caméra par IP"
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
                    void run("Ajout de la caméra", async () => {
                      const c = await window.sezaam.call("addCamera", {
                        ip: manualIP.trim(),
                        port: Number(port),
                      });
                      setAdd(false);
                      await select(c);
                    });
                  }}
                >
                  <Field label="Adresse IPv4">
                    <input
                      autoFocus
                      required
                      value={manualIP}
                      placeholder="192.168.1.11"
                      onChange={(e) => setManualIP(e.target.value)}
                    />
                  </Field>
                  <Field label="Port ONVIF">
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
                    Ajouter
                  </Button>
                </form>
              </Modal>
            </Panel>
            <div className="camera-content">
              <Panel className="camera-overview panel">
                <div className="camera-heading">
                  <CameraIcon size={24} />
                  <div>
                    <h2>
                      {camera?.name ||
                        camera?.model ||
                        (camera
                          ? "Caméra ONVIF"
                          : "Aucune caméra sélectionnée")}
                    </h2>
                    <p>
                      {camera
                        ? `${camera.model || "Modèle non disponible"}  ·  SN : ${value(camera.serial)}  ·  Firmware : ${value(camera.firmware)}`
                        : "Sélectionnez une caméra dans la liste pour consulter ses informations."}
                    </p>
                  </div>
                  {camera && (
                    <Button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void run("Ouverture de l’interface web", () =>
                          window.sezaam.call("openWeb", { id: camera.id }),
                        )
                      }
                    >
                      <ExternalLink size={15} />
                      Ouvrir l’interface web
                    </Button>
                  )}
                </div>
                {camera && !detail && (
                  <div className="camera-read-state">
                    {loadingCamera === camera.id ? (
                      <div className="inline-note" role="status">
                        <LoaderCircle className="spin" size={16} />
                        Lecture des paramètres…
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
                              Relire les paramètres
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
                    aria-label={expanded ? "Aperçu vidéo agrandi" : undefined}
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
                        <strong>Connexion au direct…</strong>
                      </div>
                    ) : (
                      <VideoPlaceholder
                        selected={!!camera}
                        connected={!!detail}
                      />
                    )}
                    <div className="preview-toolbar">
                      <select
                        aria-label="Profil de l’aperçu vidéo"
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
                        <option value="">Choisir un flux</option>
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
                          Arrêter
                        </Button>
                      ) : (
                        <Button
                          className="primary"
                          disabled={!profile || !!busy}
                          onClick={() => void startPreview(selected, profile)}
                        >
                          <Play size={15} />
                          Lire
                        </Button>
                      )}
                      <Button
                        className="icon-button"
                        aria-label={
                          expanded ? "Réduire l’aperçu" : "Agrandir l’aperçu"
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
                        Relire les informations
                      </Button>
                    )}
                  </CameraFacts>
                </div>
              </Panel>
              {camera && (
                <div className="camera-default-action">
                  <span>Configuration Sezaam</span>
                  <Button
                    disabled={!!busy}
                    onClick={() => void applyDefaults([camera.id])}
                  >
                    <SlidersHorizontal size={16} />
                    Appliquer le profil à cette caméra
                  </Button>
                </div>
              )}
              {detail && (
                <p className="detail-freshness" role="status">
                  {detail.loading
                    ? "Lecture en cours · blocs disponibles affichés"
                    : detail.readState === "cached"
                      ? "Informations en mémoire · utilisez Relire pour les actualiser"
                      : detail.readState === "partial"
                        ? "Lecture partielle · certains blocs sont conservés en mémoire"
                        : "Informations lues sur la caméra"}
                  {detail.readAt &&
                    " · " + new Date(detail.readAt).toLocaleTimeString()}
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
                        " Relancez la détection ou utilisez Résoudre les conflits.",
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
            <h2>Réseau Ethernet</h2>
            <p className="help-text">
              Liaison entre le Mac, le switch PoE et les caméras.
            </p>{" "}
            <section className="network-strip" aria-label="Informations réseau">
              <div className="network-connection">
                <Network size={32} />
                <div>
                  <strong>Connexion Ethernet des caméras</strong>
                  <p>
                    {adapter?.service || "Branchez le hub et le câble RJ45"}
                  </p>
                  <code>
                    {adapter?.address || "Aucune IPv4"}
                    {adapter?.mask ? ` / ${adapter.mask}` : ""}
                  </code>
                </div>
                <Button
                  className="icon-button"
                  aria-label="Actualiser la connexion Ethernet"
                  disabled={!!busy}
                  onClick={() => void run("Actualisation du réseau", refresh)}
                >
                  <RefreshCw size={18} />
                </Button>
              </div>
              <div className="network-meta">
                <strong>État du réseau</strong>
                <Status kind={networkStatus}>
                  {networkWarning
                    ? "Adresse IPv4 locale"
                    : state?.network.ready
                      ? "Connecté"
                      : adapter?.link
                        ? "IPv4 indisponible"
                        : "Liaison inactive"}
                </Status>
                <div>
                  <span>
                    {adapter?.mode === "dhcp"
                      ? "DHCP"
                      : adapter?.mode === "manual"
                        ? "IPv4 statique"
                        : "Configuration système"}
                  </span>
                  <span>MTU : {value(adapter?.mtu)}</span>
                  <span>
                    {adapter?.media || "Paramètres du poste en lecture seule"}
                  </span>
                </div>
              </div>
            </section>
            {state && !state.network.ready && (
              <div className="inline-note" role="status">
                <Cable size={16} />
                {state.network.reason}
              </div>
            )}
            {networkWarning && <Alert kind="warning">{networkWarning}</Alert>}
            {!!state?.network.overlaps.length && (
              <div className="inline-note">
                <Info size={16} />
                Plusieurs interfaces partagent un sous-réseau (
                {state.network.overlaps.join(", ")}). Le chemin vers chaque
                caméra sera contrôlé.
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
            preferences={preferences}
            setPreferences={setPreferences}
            theme={theme}
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
        <Addressing
          open
          onClose={() => setAddressing(false)}
          busy={!!busy}
          run={run}
          cameras={state?.cameras ?? []}
          onApplied={() => {
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
