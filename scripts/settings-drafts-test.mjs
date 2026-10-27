import { build } from "esbuild";
import assert from "node:assert/strict";

// Exercise actual React effects: an alert lasting one render can interrupt a
// camera switch even when the final form looks clean to a browser assertion.
export async function checkSettingsHydration(page, detail) {
  const bundle = await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { flushSync } from "react-dom";
        import { Settings } from "./src/renderer/Settings";
        window.checkSettingsHydration = (detail) => {
          const host = document.createElement("div");
          document.body.append(host);
          const root = createRoot(host);
          const changes = [];
          const render = (value) => flushSync(() => root.render(
            <Settings detail={value} busy={false}
              onDirty={(dirty) => changes.push(dirty)}
              run={() => { throw Error("Unexpected write"); }}
              onRefresh={() => { throw Error("Unexpected refresh"); }}
              onStop={() => { throw Error("Unexpected playback"); }} />
          ));
          try {
            render(undefined);
            render(detail);
            const updated = structuredClone(detail);
            updated.gateway.data = { IPv4Address: ["10.79.42.252"] };
            updated.video.data[0].config.rateControl.bitrateLimit = 4096;
            updated.osd.data = { strategy: "web", web: {
              enabled: false, title: "Test", titlePosition: "topLeft",
              timePosition: "bottomRight"
            }};
            render(updated);
            render(updated);
            return changes;
          } finally {
            flushSync(() => root.unmount());
            host.remove();
          }
        };
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
  });
  const scriptURL = new URL("/settings-drafts-fixture.js", page.url()).href;
  await page.route(scriptURL, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: bundle.outputFiles[0].text,
    }),
  );
  await page.addScriptTag({ url: scriptURL });
  const changes = await page.evaluate(
    (detail) => window.checkSettingsHydration(detail),
    detail,
  );
  assert.ok(changes.length > 0, "Le formulaire publie son état initial");
  assert.ok(
    changes.every((dirty) => dirty === false),
    "Une lecture seule ne doit jamais annoncer de modifications locales",
  );
}
