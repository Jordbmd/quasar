import { execFile, type ChildProcess } from "node:child_process";

// Use the system HTTP client for the web firmware on macOS. It reliably closes
// each exchange; credentials are supplied on stdin, never in process arguments.
export function vendorHttpMac(
  input: {
    ip: string;
    port: number;
    source: string;
    endpoint: string;
    body: string;
    signal?: AbortSignal;
  },
  running: Set<ChildProcess>,
): Promise<{ status: number; xml: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "/usr/bin/curl",
      [
        "--silent",
        "--show-error",
        "--noproxy",
        "*",
        "--interface",
        input.source,
        "--proto",
        "=http",
        "--connect-timeout",
        "3",
        "--max-time",
        "8",
        "--max-filesize",
        "1048576",
        "--header",
        "Content-type: application/x-www-form-urlencoded",
        "--header",
        "X-Requested-With: XMLHttpRequest",
        "--header",
        "Connection: close",
        "--data-binary",
        "@-",
        "--write-out",
        "\n%{http_code}",
        "--url",
        `http://${input.ip}:${input.port}${input.endpoint}`,
      ],
      {
        signal: input.signal,
        timeout: 9000,
        maxBuffer: 1048576 + 4096,
        encoding: "utf8",
      },
      (error, stdout) => {
        running.delete(child);
        if (input.signal?.aborted) return reject(input.signal.reason);
        if (error)
          return reject(
            Error(
              (error as any).code === 28 || error.killed
                ? "Network timeout"
                : "Connexion API web interrompue.",
            ),
          );
        const status = /\n(\d{3})$/.exec(stdout);
        if (!status) return reject(Error("Réponse HTTP caméra incomplète."));
        resolve({
          status: Number(status[1]),
          xml: stdout.slice(0, status.index),
        });
      },
    );
    running.add(child);
    child.stdin?.on("error", () => {});
    child.stdin?.end(input.body);
  });
}
