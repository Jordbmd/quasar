import { execFile, type ChildProcess } from "node:child_process";
import http from "node:http";

export type VendorHttpInput = {
  ip: string;
  port: number;
  source: string;
  endpoint: string;
  body: string;
  signal?: AbortSignal;
};
const responseLimit = 1024 * 1024;
// Firmware configuration workers are serial. Bound each exchange, not time in the queue.
const exchangeTimeoutMs = 8000;

/** Portable client: no external executable, credentials remain in the POST body.
 * No redirects and no retries here; the connection owns read-only retry policy. */
export function vendorHttpNode(
  input: VendorHttpInput,
  agent?: http.Agent,
): Promise<{ status: number; xml: string }> {
  return new Promise((resolve, reject) => {
    input.signal?.throwIfAborted();
    const request = http.request(
      {
        hostname: input.ip,
        port: input.port,
        localAddress: input.source,
        path: input.endpoint,
        method: "POST",
        agent: agent ?? false,
        signal: input.signal,
        headers: {
          "Content-type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          "Content-Length": Buffer.byteLength(input.body),
          Connection: "close",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > responseLimit)
            request.destroy(Error("Réponse caméra trop volumineuse."));
          else chunks.push(chunk);
        });
        response.once("aborted", () =>
          request.destroy(Error("Réponse HTTP caméra incomplète.")),
        );
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            xml: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(Error("Network timeout")),
      exchangeTimeoutMs,
    );
    request.once("error", (error) =>
      reject(input.signal?.aborted ? input.signal.reason : error),
    );
    request.once("close", () => clearTimeout(timer));
    request.end(input.body);
  });
}

// Use the system HTTP client for the web firmware on macOS. It reliably closes
// each exchange; credentials are supplied on stdin, never in process arguments.
export function vendorHttpMac(
  input: VendorHttpInput,
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
              error.code === 28 || error.killed
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
    // curl's completion callback reports a closed pipe; never log the body.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input.body);
  });
}
