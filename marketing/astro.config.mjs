import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// `site` is updated to the real deployed URL right after the first deploy —
// needed for sitemap.xml and canonical link tags to be correct.
export default defineConfig({
  site: "https://marketing-beta-jade.vercel.app",
  integrations: [sitemap()],
});
