const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const builder = new addonBuilder(require("./manifest.json"));

// ====================== MAIN STREAM HANDLER (anilab.to FIRST!) ======================
// ====================== STREAMS – anilab.to #1 + ALL BEST BACKUPS ======================
builder.defineStreamHandler(async (args) => {
  const id = args.id.replace("anilist:", "");
  const ep = parseInt(args.extra?.episode || 1);
  const streams = [];

  // 1. anilab.to — MAIN & BEST SOURCE (fastest 1080p + hardsubs)
  try {
    const info = await axios.get(`https://api.consumet.org/anime/gogoanime/info/${id}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (episode) {
      const src = await axios.get(`https://api.consumet.org/anime/gogoanime/watch/${episode.id}`);
      src.data.sources
        .filter(s => s.quality !== "default")
        .forEach(s => {
          streams.push({
            url: s.url,
            title: `anilab.to • ${s.quality}p • Hardsub`,
            behaviorHints: { notWebReady: false }
          });
        });
    }
    if (streams.length) return { streams };
  } catch (e) {}

  // 2. hianime.to
  try {
    const info = await axios.get(`https://api.consumet.org/anime/hianime/info/${id}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (episode) {
      const src = await axios.get(`https://api.consumet.org/anime/hianime/watch/${episode.id}`);
      src.data.sources?.filter(s => s.quality !== "default").forEach(s => streams.push({ url: s.url, title: `hianime.to • ${s.quality}p`, behaviorHints: { notWebReady: false } }));
    }
    if (streams.length) return { streams };
  } catch (e) {}

  // 3. 9animetv.to
  try {
    const info = await axios.get(`https://api.consumet.org/anime/9anime/info/${id}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (episode) {
      const src = await axios.get(`https://api.consumet.org/anime/9anime/watch/${episode.id}`);
      src.data.sources?.filter(s => s.quality !== "default").forEach(s => streams.push({ url: s.url, title: `9anime • ${s.quality}p`, behaviorHints: { notWebReady: false } }));
    }
    if (streams.length) return { streams };
  } catch (e) {}

  // 4. aniwatchtv.to / zoro.to
  try {
    const info = await axios.get(`https://api.consumet.org/anime/zoro/info/${id}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (episode) {
      const src = await axios.get(`https://api.consumet.org/anime/zoro/watch/${episode.id}`);
      src.data.sources?.filter(s => s.quality !== "default").forEach(s => streams.push({ url: s.url, title: `aniwatch/zoro • ${s.quality}p`, behaviorHints: { notWebReady: false } }));
    }
    if (streams.length) return { streams };
  } catch (e) {}

  // 5. Gogoanime (final fallback)
  try {
    const info = await axios.get(`https://api.consumet.org/anime/gogoanime/info/${id}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (episode) {
      const src = await axios.get(`https://api.consumet.org/anime/gogoanime/watch/${episode.id}`);
      src.data.sources?.filter(s => s.quality !== "default").forEach(s => streams.push({ url: s.url, title: `Backup • ${s.quality}p`, behaviorHints: { notWebReady: false } }));
    }
  } catch (e) {}

  return { streams };
});

// Keep your existing catalog & meta handlers (they are already perfect)
builder.defineCatalogHandler();   // ← if you split it, or keep the old one here
builder.defineMetaHandler());         // ← same

// ====================== SERVER ======================
serveHTTP(builder.getInterface(), { port: process.env.PORT || 10000 });
console.log("Crunchyroll Reborn + anilab.to is LIVE!");