import { networkInterfaces } from "node:os";
import type { Adapter, NetworkState } from "../shared/types";
import type { SystemNetwork } from "./platform";
import { ipNumber, overlap } from "./ip";
import { Diagnostics } from "./diagnostics";

const fingerprint = (a: Adapter) =>
  JSON.stringify([
    a.id,
    a.service,
    a.mac,
    a.address,
    a.mask,
    a.link,
    a.enabled,
  ]);
/** Detect the wired camera connection without changing system configuration. */
export class NetworkGuard {
  state: NetworkState = {
    ready: false,
    reason: "Branchez le hub Ethernet et le câble RJ45 des caméras.",
    overlaps: [],
  };
  private stamp = "";
  private pending?: Promise<NetworkState>;
  epoch = 0;
  private listeners: (() => void)[] = [];
  constructor(
    public system: SystemNetwork,
    private log: Diagnostics,
  ) {}
  onSuspend(fn: () => void) {
    this.listeners.push(fn);
  }
  suspend(reason: string) {
    this.state.ready = false;
    this.state.reason = reason;
    this.stamp = "";
    this.epoch++;
    this.log.add("attention", "Connexion réseau interrompue", reason);
    for (const f of this.listeners) f();
  }
  current() {
    if (!this.state.adapter?.enabled || !this.state.ready)
      throw new Error(this.state.reason);
    return this.state.adapter;
  }
  refresh(): Promise<NetworkState> {
    if (!this.pending)
      this.pending = this.readEthernet()
        .catch((error: unknown) => {
          const code = (error as NodeJS.ErrnoException)?.code;
          const reason =
            code === "ENOENT"
              ? "Outil réseau système absent. Linux nécessite iproute2 ; Windows nécessite PowerShell et NetTCPIP."
              : code === "EACCES" || code === "EPERM"
                ? "Lecture du réseau refusée par le système. Vérifiez les permissions réseau."
                : `Lecture du réseau impossible : ${this.log.safe(error)}`;
          if (this.state.ready || this.stamp) this.suspend(reason);
          this.state = { ready: false, reason, overlaps: [] };
          return this.state;
        })
        .finally(() => {
          this.pending = undefined;
        });
    return this.pending;
  }
  private async readEthernet() {
    const adapters = (await this.system.list()).filter(
      (a) => a.kind === "ethernet" && a.enabled,
    );
    const connected = adapters.filter((a) => a.link);
    // More than one live wired path is ambiguous. Never silently choose a
    // different network, and never fall back to Wi-Fi or a virtual interface.
    const a =
      connected.length === 1
        ? connected[0]
        : connected.length === 0 && adapters.length === 1
          ? adapters[0]
          : undefined;
    const ambiguous = connected.length > 1;
    if (this.stamp && (!a || fingerprint(a) !== this.stamp))
      this.suspend(
        "La connexion Ethernet a changé. Les connexions caméra ont été fermées.",
      );
    this.state.adapter = a;
    this.state.overlaps = [];
    if (a?.address && a.mask) {
      for (const [id, ips] of Object.entries(networkInterfaces()))
        for (const ip of ips ?? []) {
          try {
            if (
              id !== a.id &&
              ip.address !== a.address &&
              ip.family === "IPv4" &&
              !ip.internal &&
              overlap(a.address, a.mask, ip.address, ip.netmask)
            )
              this.state.overlaps.push(`${id} : ${ip.address}`);
          } catch {}
        }
    }
    this.state.ready = !!(
      a?.enabled &&
      a.link &&
      a.address &&
      a.mask &&
      !a.issue
    );
    // Link-local IPv4 can still discover a peer on the same segment. Keep
    // discovery available, but don't present it as a normal DHCP lease.
    this.state.warning =
      this.state.ready && a?.address.startsWith("169.254.")
        ? `Ethernet connecté avec l’adresse locale ${a.address}. ${a.mode === "dhcp" ? "Aucune adresse DHCP reçue. " : ""}Avec un routeur, vérifiez le port LAN et son serveur DHCP. En liaison directe ou via un switch sans DHCP, configurez manuellement une adresse Ethernet dans le sous-réseau de la caméra. La découverte reste disponible ; l’accès aux caméras dépend de leur adressage.`
        : undefined;
    this.state.reason = ambiguous
      ? "Plusieurs connexions Ethernet sont actives. Gardez uniquement le hub des caméras branché."
      : a?.issue
        ? a.issue
        : !a || !a.link
          ? "Branchez le hub Ethernet et le câble RJ45 des caméras, directement ou via le routeur/switch."
          : !a.address || !a.mask
            ? a.mode === "dhcp"
              ? "Ethernet connecté, mais IPv4 indisponible : attente d’une adresse DHCP. Avec un routeur, vérifiez le port LAN et son serveur DHCP. Sans serveur DHCP, une adresse Ethernet manuelle dans le sous-réseau de la caméra est nécessaire."
              : "Ethernet connecté, mais IPv4 indisponible. Vérifiez son adressage dans les réglages réseau du système."
            : "Connexion Ethernet des caméras disponible.";
    if (this.state.ready && a) this.stamp = fingerprint(a);
    return this.state;
  }
  async assert(ip?: string) {
    await this.refresh();
    const a = this.current();
    if (!this.state.ready) throw new Error(this.state.reason);
    if (ip) {
      const n = ipNumber(ip),
        first = n >>> 24;
      if (
        first === 0 ||
        first === 127 ||
        first >= 224 ||
        this.ownAddresses().includes(ip)
      )
        throw new Error("Destination caméra invalide ou attribuée au poste.");
      if ((await this.system.route(ip, a.id, a.address)) !== a.id)
        throw new Error(
          `La route vers ${ip} ne passe pas par ${a.service}. Vérifiez le branchement RJ45 des caméras et l’adressage Ethernet du poste.`,
        );
    }
    return a;
  }
  ownAddresses() {
    return Object.values(networkInterfaces()).flatMap((a) =>
      (a ?? []).filter((x) => x.family === "IPv4").map((x) => x.address),
    );
  }
  ensureEpoch(epoch: number) {
    if (epoch !== this.epoch || !this.state.ready)
      throw new Error("Opération interrompue : interface réseau modifiée.");
  }
}
