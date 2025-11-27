const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const builder = new addonBuilder(require("./manifest.json"));

// ====================== MAIN STREAM HANDLER (anilab.to FIRST!) ======================
builder.defineStreamHandler(async (args) => {
  const anilistId = args.id.replace("anilist:", "");
  const episodeNum = parseInt(args.extra?.episode || 1);

  const streams = [];

  // ────── 1. PRIMARY: anilab.to (fastest, 1080p, hardsubs) ──────
  try {
    const searchRes = await axios.get(`https://api.anilab.to/search?query=${anilistId}`);
    const anime = searchRes.data.find(a => a.id === anilistId || a.anilistId === anilistId);
    if (anime) {
      const epRes = await axios.get(`https://api.anilab.to/episode/${anime.id}`);
      const ep = epRes.data.episodes.find(e => e.number === episodeNum);
      if (ep) {
        const sources = await axios.get(`https://api.anilab.to/sources/${ep.id}`);
        sources.data.forEach(src => {
          if (src.quality && src.url) {
            streams.push({
              url: src.url,
              title: `anilab.to • ${src.quality}p • Hardsub`,
              behaviorHints: { notWebReady: false }
            });
          }
        });
      }
    }
    if (streams.length > 0) return { streams };
  } catch (e) {
    console.log("anilab.to failed, trying backup...");
  }

  // ────── 2. BACKUP: Consumet / Gogoanime (still great) ──────
  try {
    const info = await axios.get(`https://api.consumet.org/anime/gogoanime/info/${anilistId}`);
    const episode = info.data.episodes.find(e => e.number === episodeNum);
    if (episode) {
      const sources = await axios.get(`https://api.consumet.org/anime/gogoanime/watch/${episode.id}`);
      sources.data.sources
        .filter(s => s.quality !== "default")
        .forEach(s => {
          streams.push({
            url: s.url,
            title: `Backup • ${s.quality}p`,
            behaviorHints: { notWebReady: false }
          });
        });
    }
    return { streams };
  } catch (e) {
    return { streams: [] };
  }
});

// Keep your existing catalog & meta handlers (they are already perfect)
builder.defineCatalogHandler(require("./catalog.js"));   // ← if you split it, or keep the old one here
builder.defineMetaHandler(require("./meta.js"));         // ← same

// ====================== SERVER ======================
serveHTTP(builder.getInterface(), { port: process.env.PORT || 10000 });
console.log("Crunchyroll Reborn + anilab.to is LIVE!");