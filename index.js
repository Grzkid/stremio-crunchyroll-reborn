const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const manifest = require("./manifest.json");
const builder = new addonBuilder(manifest);

const ANILIST = "https://graphql.anilist.co";

// Current season helper
const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
};

// ====================== CATALOGS ======================
builder.defineCatalogHandler(async (args) => {
  const metas = [];

  // Seasonal (Fall 2025, etc.)
  if (args.id.startsWith("cr-season-")) {
    const [season, yearStr] = args.id.replace("cr-season-", "").toUpperCase().split("-");
    const year = parseInt(yearStr);

    const query = `
      query($s: MediaSeason, $y: Int) {
        Page(perPage: 50) {
          media(season: $s, seasonYear: $y, type: ANIME, sort: POPULARITY_DESC) {
            id title { romaji english } coverImage { extraLarge } bannerImage genres
          }
        }
      }
    `;

    const { data } = await axios.post(ANILIST, { query, variables: { s: season, y: year } });
    data.data.Page.media.forEach(a => {
      metas.push({
        id: `anilist:${a.id}`,
        type: "series",
        name: a.title.english || a.title.romaji,
        poster: a.coverImage.extraLarge,
        background: a.bannerImage || a.coverImage.extraLarge,
        genres: a.genres,
      });
    });
  }

  // Simulcast
  else if (args.id === "cr-simulcast") {
    const { season, year } = getCurrentSeason();
    const query = `
      query($s: MediaSeason, $y: Int) {
        Page(perPage: 30) {
          media(season: $s, seasonYear: $y, isAdult: false, sort: POPULARITY_DESC, type: ANIME) {
            id title { english romaji } coverImage { extraLarge }
          }
        }
      }
    `;
    const { data } = await axios.post(ANILIST, { query, variables: { s: season, y: year } });
    data.data.Page.media.forEach(a => {
      metas.push({
        id: `anilist:${a.id}`,
        type: "series",
        name: a.title.english || a.title.romaji,
        poster: a.coverImage.extraLarge,
      });
    });
  }

  // Popular & Updated
  else if (args.id === "cr-popular" || args.id === "cr-updated") {
    const { data } = await axios.post(ANILIST, {
      query: `query { Page(perPage: 50) { media(sort: POPULARITY_DESC, type: ANIME) { id title { english romaji } coverImage { extraLarge } } } }`,
    });
    data.data.Page.media.forEach(a => {
      metas.push({
        id: `anilist:${a.id}`,
        type: "series",
        name: a.title.english || a.title.romaji,
        poster: a.coverImage.extraLarge,
      });
    });
  }

  return { metas };
});

// ====================== META ======================
builder.defineMetaHandler(async (args) => {
  const id = args.id.replace("anilist:", "");
  const { data } = await axios.post(ANILIST, {
    query: `
      query($id: Int) {
        Media(id: $id, type: ANIME) {
          id title { english romaji } coverImage { large } bannerImage description(asHtml: false) genres season seasonYear duration
        }
      }
    `,
    variables: { id: parseInt(id) },
  });

  const a = data.data.Media;
  return {
    meta: {
      id: `anilist:${a.id}`,
      type: "series",
      name: a.title.english || a.title.romaji,
      poster: a.coverImage.large,
      background: a.bannerImage || a.coverImage.large,
      description: a.description?.replace(/<[^>]*>/g, ""),
      genres: a.genres,
      releaseInfo: `${a.season} ${a.seasonYear}`,
      runtime: a.duration ? `${a.duration} min` : undefined,
    },
  };
});

// ====================== STREAMS ======================
builder.defineStreamHandler(async (args) => {
  const anilistId = args.id.replace("anilist:", "");
  const ep = parseInt(args.extra?.episode || 1);

  try {
    const info = await axios.get(`https://api.consumet.org/anime/gogoanime/info/${anilistId}`);
    const episode = info.data.episodes.find(e => e.number === ep);
    if (!episode) return { streams: [] };

    const sources = await axios.get(`https://api.consumet.org/anime/gogoanime/watch/${episode.id}`);
    const streams = sources.data.sources
      .filter(s => s.quality !== "default")
      .map(s => ({
        url: s.url,
        title: `${s.quality}p • Direct`,
        behaviorHints: { notWebReady: false },
      }));

    return { streams };
  } catch (e) {
    return { streams: [] };
  }
});

// ====================== SERVER ======================
serveHTTP(builder.getInterface(), { port: process.env.PORT || 10000 });
console.log("Crunchyroll Reborn add-on is running!");