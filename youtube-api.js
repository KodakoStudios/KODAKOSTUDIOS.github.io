(() => {
  const config = window.KODAKO_YOUTUBE_CONFIG;
  const status = document.getElementById("youtube-api-status");
  const note = document.getElementById("youtube-api-note");
  const cards = [...document.querySelectorAll("[data-youtube-kind]")];
  if (!config || !status || !note || cards.length === 0) return;

  const cacheKey = "kodakoYouTubeLatestV1";
  const cacheDuration = 6 * 60 * 60 * 1000;
  const channelUrl = "https://youtube.com/KodakoOfficial";
  const apiUrl = "https://www.googleapis.com/youtube/v3";

  const setStatus = (message, state = "info") => {
    status.lastChild.textContent = ` ${message}`;
    status.dataset.state = state;
  };

  const showCardMessage = (kind, message) => {
    const card = cards.find((item) => item.dataset.youtubeKind === kind);
    if (card) card.querySelector(".video-card-copy p").textContent = message;
  };

  const request = async (resource, params) => {
    const url = new URL(`${apiUrl}/${resource}`);
    Object.entries({ ...params, key: config.apiKey }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.error) {
      const reason = data.error?.errors?.[0]?.reason;
      const error = new Error(data.error?.message || `YouTube API returned ${response.status}.`);
      error.reason = reason;
      throw error;
    }
    return data;
  };

  const durationInSeconds = (isoDuration) => {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(isoDuration);
    if (!match) return 0;
    return (Number(match[1] || 0) * 3600) +
      (Number(match[2] || 0) * 60) +
      Number(match[3] || 0);
  };

  const getLatestVideos = async () => {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.savedAt < cacheDuration && Array.isArray(parsed.videos)) {
        return { videos: parsed.videos, cached: true };
      }
    }

    const channelParams = config.channelId
      ? { id: config.channelId, part: "contentDetails" }
      : { forUsername: config.channelUsername, part: "contentDetails" };
    const channelData = await request("channels", channelParams);
    const uploadsPlaylist = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylist) {
      throw new Error("YouTubeチャンネルを確認できません。チャンネルIDまたはユーザー名を確認してください。");
    }

    const videos = [];
    let pageToken = "";
    for (let page = 0; page < 3; page += 1) {
      const playlistData = await request("playlistItems", {
        part: "contentDetails",
        playlistId: uploadsPlaylist,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });
      const videoIds = playlistData.items
        ?.map((item) => item.contentDetails?.videoId)
        .filter(Boolean) || [];
      if (videoIds.length) {
        const details = await request("videos", {
          part: "snippet,contentDetails,liveStreamingDetails",
          id: videoIds.join(","),
          maxResults: "50",
        });
        videos.push(...(details.items || []).map((video) => ({
          id: video.id,
          title: video.snippet?.title || "タイトル未設定",
          publishedAt: video.snippet?.publishedAt || "",
          thumbnail: video.snippet?.thumbnails?.maxres?.url ||
            video.snippet?.thumbnails?.high?.url ||
            video.snippet?.thumbnails?.medium?.url ||
            "",
          duration: durationInSeconds(video.contentDetails?.duration || ""),
          isLive: Boolean(
            video.liveStreamingDetails?.actualStartTime ||
            video.liveStreamingDetails?.scheduledStartTime ||
            (video.snippet?.liveBroadcastContent && video.snippet.liveBroadcastContent !== "none")
          ),
        })));
      }
      pageToken = playlistData.nextPageToken || "";
      if (!pageToken) break;
    }
    videos.sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt));

    sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), videos }));
    return { videos, cached: false };
  };

  const renderVideo = (kind, video) => {
    const card = cards.find((item) => item.dataset.youtubeKind === kind);
    if (!card) return;
    const link = card.querySelector(".youtube-video-link");
    const title = card.querySelector(".video-card-copy h3");
    const description = card.querySelector(".video-card-copy p");
    const label = card.querySelector(".video-label");
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;
    link.setAttribute("aria-label", `YouTubeで「${video.title}」を見る`);
    if (video.thumbnail) {
      link.style.backgroundImage = `url("${video.thumbnail.replaceAll('"', "%22")}")`;
      link.classList.add("youtube-video-loaded");
    }
    title.textContent = video.title;
    description.textContent = video.publishedAt
      ? new Date(video.publishedAt).toLocaleDateString("ja-JP")
      : "公開日不明";
    label.textContent = kind === "live" ? "ライブ配信" : kind === "short" ? "Shorts" : "最新動画";
  };

  const renderLatest = (videos) => {
    const latestVideo = videos.find((video) => !video.isLive && video.duration > 180);
    const latestLive = videos.find((video) => video.isLive);
    const latestShort = videos.find((video) => !video.isLive && video.duration > 0 && video.duration <= 180);
    const latestByKind = { video: latestVideo, live: latestLive, short: latestShort };

    Object.entries(latestByKind).forEach(([kind, video]) => {
      if (video) {
        renderVideo(kind, video);
      } else {
        showCardMessage(kind, "該当するコンテンツはまだ見つかりません。");
      }
    });
  };

  if (!config.apiKey) {
    setStatus("APIキー未設定");
    note.textContent = "YouTube Data API v3を有効にしたGoogle CloudプロジェクトのAPIキーをyoutube-config.jsに設定すると、動画が自動表示されます。公開キーはHTTPリファラー制限とAPI制限を必ず設定してください。";
    cards.forEach((card) => {
      card.querySelector(".video-card-copy p").textContent = "YouTube APIキーの設定後に最新情報を表示します。";
    });
    return;
  }

  getLatestVideos()
    .then(({ videos, cached }) => {
      renderLatest(videos);
      setStatus(cached ? "キャッシュ表示" : "YouTubeと連携中", "success");
      note.textContent = "ゲームチャンネルのアップロード一覧から取得しています。Shortsは長さ3分以内の動画として判定します。API応答はこのタブで6時間キャッシュされます。";
    })
    .catch((error) => {
      console.error("YouTube API request failed:", error);
      const quotaExceeded = error.reason === "quotaExceeded";
      setStatus(quotaExceeded ? "API利用上限に達しました" : "YouTube情報を取得できません", "error");
      note.textContent = quotaExceeded
        ? "YouTube Data APIの1日あたりの割り当て上限です。翌日以降に再度表示されます。"
        : "YouTube APIキー、キーのHTTPリファラー制限、チャンネル設定、ネットワーク接続を確認してください。";
      cards.forEach((card) => {
        card.querySelector(".video-card-copy p").textContent = "YouTubeの最新情報を読み込めませんでした。";
      });
    });
})();
