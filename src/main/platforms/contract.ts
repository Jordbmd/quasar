import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Adapter } from "../../shared/types";
const exec = promisify(execFile);
export type Run = (
  file: string,
  args: string[],
  timeout?: number,
) => Promise<string>;
export const run: Run = async (file, args, timeout = 6000) => {
  const r = await exec(file, args, {
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  if (/AuthorizationCreate\(\) failed|Error:/.test(r.stdout))
    throw new Error(r.stdout.trim());
  return r.stdout.trim();
};
export interface SystemNetwork {
  list(): Promise<Adapter[]>;
  route(ip: string, interfaceId: string, source?: string): Promise<string>;
  neighbors(id: string): Promise<{ ip: string; mac: string }[]>;
  probe(ip: string, source: string): Promise<void>;
}
