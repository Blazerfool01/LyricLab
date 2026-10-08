import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
function offlineAssets(): Plugin {
  return {
    name: "lyriclab-offline",
    generateBundle(_options, bundle) {
      const assets = [
        "/",
        "/index.html",
        "/favicon.svg",
        ...Object.keys(bundle).map((p) => "/" + p),
      ];
      const cache =
        "lyriclab-" +
        Object.keys(bundle)
          .filter((p) => p.endsWith(".js"))
          .join("-");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(assets)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lyriclab-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.match(e.request,{ignoreVary:true}).then(cached=>cached||fetch(e.request)));});`,
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), offlineAssets()],
  server: { host: "0.0.0.0", port: 5173 },
});
