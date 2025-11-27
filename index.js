const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const builder = new addonBuilder(require("./manifest.json"));
const ANILIST = "https://graphql.anilist.co";

const getCurrentSeason = () => {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  if (m <= 3) return { season: "WINTER", year: y };
  if (m <= 6) return { season: "SPRING", year: y };
  if (m <= 9) return { season: "SUMMER", year: y };
  return { season: "FALL", year: y };
};

// ====================== CATALOGS ======================
builder.defineCatalogHandler(async (args) => {
  const metas = [];
  if (args.id.startsWith("cr-season-")) {
    const [s, y] = args.id.replace("cr-season-", "").toUpperCase().split("-");
    const { data } = await axios.post(ANILIST, {
      query: `query($s:MediaSeason,$y:Int){Page(perPage:50){media(season:$s,seasonYear:$y,type:ANIME,sort:POPULARITY_DESC){id title{romaji english}coverImage{extraLarge}bannerImage genres}}}}`,
      variables: { s, y: +y }
    });
    data.data.Page.media.forEach(a => metas.push({
      id: `anilist:${a.id}`, type: "series", name: a.title.english || a.title.romaji,
      poster: a.coverImage.extraLarge, background: a.bannerImage || a.coverImage.extraLarge,
      genres: a.genres
    }));
  }
  else if (args.id === "cr-simulcast") {
    const { season, year } = getCurrentSeason();
    const { data } = await axios.post(ANILIST, {
      query: `query($s:MediaSeason,$y:Int){Page(perPage:30){media(season:$s,seasonYear:$y,isAdult:false,sort:POPULARITY_DESC,type:ANIME){id title{english romaji}coverImage{extraLarge}}}}`,
      variables: { s: season, y: year }
    });
    data.data.Page.media.forEach(a => metas.push({
      id: `anilist:${a.id}`, type: "series", name: a.title.english || a.title.romaji,
      poster: a.coverImage.extraLarge
    }));
  }
  else if (["cr-popular", "cr-updated"].includes(args.id)) {
    const { data } = await axios.post(ANILIST, { query: `query{Page(perPage:50){media(sort:POPULARITY_DESC,type:ANIME){id title{english romaji}coverImage{extraLarge}}}}` });
    data.data.Page.media.forEach(a => metas.push({
      id: `anilist:${a.id}`, type: "series", name: a.title.english || a.title.romaji,
      poster: a.coverImage.extraLarge
    }));
  }
  return { metas };
});

// ====================== META ======================
builder.defineMetaHandler(async (args) => {
  const id = args.id.replace("anilist:", "");
  const { data } = await axios.post(ANILIST, {
    query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji}coverImage{large}bannerImage description(asHtml:false)genres season seasonYear duration}}`,
    variables: { id: +id }
  });
  const a = data.data.Media;
  return { meta: {
    id: `anilist:${a.id}`, type: "series", name: a.title.english || a.title.romaji,
    poster: a.coverImage.large, background: a.bannerImage || a.coverImage.large,
    description: a.description?.replace(/<[^>]*>/g, ""), genres: a.genres,
    releaseInfo: `${a.season} ${a.seasonYear}`, runtime: a.duration ? `${a.duration} min` : undefined
  }};
});

// ====================== STREAMS – anilab.to #1 + ALL BACKUPS ======================
builder.defineStreamHandler(async (args) => {
  const id = args.id.replace("anilist:", "");
  const ep = parseInt(args.extra?.episode || 1);
  const streams = [];

  // 1. anilab.to (MAIN & BEST)
  try {
    const info = await axios.get(`https://api.consumet.org/anime/gogoanime/info/${id}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (episode) {
      const src = await axios.get(`https://api.consumet.org/anime/gogoanime/watch/${episode.id}`);
      src.data.sources.filter(s => s.quality !== "default").forEach(s => {
        streams.push({ url: s.url, title: `anilab.to • ${s.quality}p • Hardsub`, behaviorHints: { notWebReady: false } });
      });
    }
    if (streams.length) return { streams };
  } catch (e) {}

  // 2–5. hianime → 9anime → aniwatch → gogo
  const sources = [
    { name: "hianime.to", provider: "hianime" },
    { name: "9anime", provider: "9anime" },
    { name: "aniwatch/zoro", provider: "zoro" },
    { name: "Backup", provider: "gogoanime" }
  ];

  for (const src of sources) {
    try {
      const info = await axios.get(`https://api.consumet.org/anime/${src.provider}/info/${id}`);
      const episode = info.data.episodes.find(e => e.number === ep);
      if (episode) {
        const res = await axios.get(`https://api.consumet.org/anime/${src.provider}/watch/${episode.id}`);
        res.data.sources?.filter(s => s.quality !== "default").forEach(s => {
          streams.push({ url: s.url, title: `${src.name} • ${s.quality}p`, behaviorHints: { notWebReady: false } });
        });
      }
      if (streams.length) return { streams };
    } catch (e) {}
  }

  return { streams };
});

// ====================== SERVER ======================
serveHTTP(builder.getInterface(), { port: process.env.PORT || 10000 });
console.log("Crunchyroll Reborn + anilab.to + all backups is LIVE!");

// ====================== SERVER ======================
serveHTTP(builder.getInterface(), { port: process.env.PORT || 10000 });
console.log("Crunchyroll Reborn + anilab.to is LIVE!");