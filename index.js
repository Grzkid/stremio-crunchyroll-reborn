const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const builder = new addonBuilder(require("./manifest.json"));
const ANILIST = "https://graphql.anilist.co";

const getCurrentSeason = () => {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  if (m <= 3) return { s: "WINTER", y };
  if (m <= 6) return { s: "SPRING", y };
  if (m <= 9) return { s: "SUMMER", y };
  return { s: "FALL", y };
};

// CATALOGS & META (unchanged – keep your Crunchyroll layout)
builder.defineCatalogHandler(async (args) => {   // === DUBBED CATALOG – REAL & ALWAYS UPDATED (2025) ===
  else if (args.id === "cr-dubbed") {
    try {
      const res = await axios.get("https://raw.githubusercontent.com/youkan/anime-dubbed-list/main/dubbed.json");
      const dubbed = res.data.slice(0, 80);

      for (const a of dubbed) {
        metas.push({
          id: `anilist:${a.anilist_id}`,
          type: "anime",
          name: a.title_english || a.title_romaji,
          poster: a.cover_image,
          background: a.banner_image || a.cover_image,
        });
      }
    } catch (e) {
      // Fallback list (in case GitHub is slow)
      const fallbackIds = [21087,16498,1535,11061,5114,30276,4181,20583,47778,48583,50265,51009,52144,52701,54008,55245];
      const { data } = await axios.post(ANILIST, {
        query: `query($ids:[Int]){Page{media(id_in:$ids,type:ANIME){id title{english romaji}coverImage{extraLarge}bannerImage}}}`,
        variables: { ids: fallbackIds }
      });
      data.data.Page.media.forEach(a => metas.push({
        id: `anilist:${a.id}`, type: "anime",
        name: a.title.english || a.title.romaji,
        poster: a.coverImage.extraLarge
      }));
    }
  } });
builder.defineMetaHandler(async (args) => { /* ... your existing meta code ... */ });

// === HYBRID STREAMS: AniLab.to → GogoAnime fallback ===
builder.defineStreamHandler(async (args) => {
  const anilistId = args.id.replace("anilist:", "");
  const episodeNum = parseInt(args.extra?.episode || 1);

  // Try AniLab.to first
  try {
    const animeInfo = await axios.get(`https://api.anilab.to/anime/${anilistId}`);
    const episode = animeInfo.data.episodes.find(e => e.number === episodeNum);
    if (episode) {
      const sources = await axios.get(`https://api.anilab.to/episode/${episode.id}`);
      const streams = sources.data.sources
        .filter(s => s.quality === "1080" || s.quality === "720" || s.quality === "default")
        .map(s => ({
          url: s.url,
          title: `AniLab • ${s.quality === "default" ? "Auto" : s.quality + "p"}`,
          behaviorHints: { notWebReady: false }
        }));

      if (sources.data.subtitles?.length) {
        streams[0].subtitles = sources.data.subtitles.map(sub => ({
          lang: sub.lang || "English",
          url: sub.url
        }));
      }
      if (streams.length > 0) return { streams };
    }
  } catch (e) {
    console.log("AniLab failed → trying GogoAnime");
  }

  // Fallback to GogoAnime
  try {
    const info = await axios.get(`https://api.consumet.org/anime/gogoanime/info/${anilistId}`);
    const ep = info.data.episodes.find(e => e.number === episodeNum);
    if (!ep) return { streams: [] };

    const sources = await axios.get(`https://api.consumet.org/anime/gogoanime/watch/${ep.id}`);
    const streams = sources.data.sources
      .filter(s => s.quality !== "default")
      .map(s => ({
        url: s.url,
        title: `Gogo • ${s.quality}p`,
        behaviorHints: { notWebReady: false }
      }));

    if (sources.data.subtitles?.length) {
      streams[0].subtitles = sources.data.subtitles.map(sub => ({
        lang: sub.lang || "English",
        url: sub.url
      }));
    }
    return { streams };
  } catch (e) {
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("Crunchyroll Reborn + AniLab + GogoAnime → LIVE!");