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

  if (args.id.startsWith("cr-season-")) {
    const [season, yearStr] = args.id.replace("cr-season-", "").toUpperCase().split("-");
    const year = parseInt(yearStr);
    const { data } = await axios.post(ANILIST, {
      query: `
        query($s: MediaSeason, $y: Int) {
          Page(perPage: 50) {
            media(season: $s, seasonYear: $y, type: ANIME, sort: POPULARITY_DESC) {
              id title { romaji english } coverImage { extraLarge } bannerImage genres
            }
          }
        }
      `,
      variables: { s: season, y: year }
    });
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

  else if (args.id === "cr-simulcast") {
    const { season, year } = getCurrentSeason();
    const { data } = await axios.post(ANILIST, {
      query: `
        query($s: MediaSeason, $y: Int) {
          Page(perPage: 30) {
            media(season: $s, seasonYear: $y, isAdult: false, sort: POPULARITY_DESC, type: ANIME) {
              id title { english romaji } coverImage { extraLarge }
            }
          }
        }
      `,
      variables: { s: season, y: year }
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

// ====================== META – MDBLIST + RPDB SUPPORT ======================
builder.defineMetaHandler(async (args) => {
  const id = args.id.replace("anilist:", "");

  // Get basic data from AniList
  const { data } = await axios.post(ANILIST, {
    query: `
      query($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { english romaji }
          coverImage { large }
          bannerImage
          description(asHtml: false)
          genres
          season
          seasonYear
          duration
        }
      }
    `,
    variables: { id: parseInt(id) },
  });

  const a = data.data.Media;

  let poster = a.coverImage.large;
  let background = a.bannerImage || a.coverImage.large;

  // MDBList – better backdrops & extra info
  if (process.env.MDBLIST_API_KEY) {
    try {
      const res = await axios.get(
        `https://mdblist.com/api/?apikey=${process.env.MDBLIST_API_KEY}&i=${a.id}`
      );
      if (res.data?.poster && res.data.poster.includes("http")) poster = res.data.poster;
      if (res.data?.backdrop && res.data.backdrop.includes("http")) background = res.data.backdrop;
    } catch (e) {}
  }

  // RPDB – BEST POSTERS IN THE WORLD (overrides everything)
  if (process.env.RPDB_API_KEY) {
    poster = `https://api.requestposterdb.com/poster/${process.env.RPDB_API_KEY}/${a.id}?fallback=true`;
  }

  return {
    meta: {
      id: `anilist:${a.id}`,
      type: "series",
      name: a.title.english || a.title.romaji,
      poster: poster,
      background: background,
      description: a.description?.replace(/<[^>]*>/g, ""),
      genres: a.genres,
      releaseInfo: `${a.season} ${a.seasonYear}`,
      runtime: a.duration ? `${a.duration} min` : undefined,
    },
  };
});

// ====================== STREAMS (Fast & stable via Consumet) ======================
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

// ====================== SERVER – RENDER READY ======================
serveHTTP(builder.getInterface(), { port: process.env.PORT });
console.log("Crunchyroll Reborn + MDBList + RPDB is running!");