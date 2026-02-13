import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { deployPlugin } from "./deploy-plugin.js";

export default defineConfig({
  base: "/",
  plugins: [react(), deployPlugin()],
});
