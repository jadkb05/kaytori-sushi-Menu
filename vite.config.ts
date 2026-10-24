import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Tunnels Cloudflare quick (`*.trycloudflare.com`) pour validation client.
    allowedHosts: [".trycloudflare.com"],
  },
});
