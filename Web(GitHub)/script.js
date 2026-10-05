const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

const topButton = document.querySelector(".top-button");
if (topButton) {
  const updateTopButton = () => {
    topButton.classList.toggle("is-visible", window.scrollY > 400);
  };
  window.addEventListener("scroll", updateTopButton, { passive: true });
  updateTopButton();
}

const lightbox = document.querySelector(".character-lightbox");
if (lightbox) {
  const lightboxImage = lightbox.querySelector("img");
  const lightboxCaption = lightbox.querySelector("p");

  document.querySelectorAll(".character-zoom").forEach((button) => {
    button.addEventListener("click", () => {
      lightboxImage.src = button.dataset.image;
      lightboxImage.alt = button.dataset.caption || "キャラクターアート";
      lightboxCaption.textContent = button.dataset.caption || "";
      lightbox.showModal();
    });
  });

  lightbox.querySelector(".lightbox-close").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
}

const fanArtInput = document.getElementById("fan-art-file");
if (fanArtInput) {
  const preview = document.getElementById("fan-art-preview");
  const previewImage = preview.querySelector("img");
  const status = document.getElementById("fan-art-status");
  let previewUrl = "";

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    previewImage.removeAttribute("src");
    preview.hidden = true;
    fanArtInput.value = "";
  };

  fanArtInput.addEventListener("change", () => {
    const file = fanArtInput.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      clearPreview();
      status.textContent = "PNG・JPEG・WebP形式の画像を選択してください。";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      clearPreview();
      status.textContent = "画像は10MB以下のファイルを選択してください。";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    previewImage.alt = `${file.name}のプレビュー`;
    preview.hidden = false;
    status.textContent = "プレビューを表示しています。投稿はまだ保存されていません。";
  });

  preview.querySelector(".preview-remove").addEventListener("click", clearPreview);
  const visibilityInputs = document.querySelectorAll('input[name="fan-art-visibility"]');
  const recipientsInput = document.getElementById("fan-art-recipients");
  const recipientsStatus = document.getElementById("fan-art-recipient-status");
  const updateRecipientAvailability = () => {
    const selectedOnly = document.querySelector('input[name="fan-art-visibility"]:checked')?.value === "selected";
    recipientsInput.disabled = !selectedOnly;
    recipientsStatus.textContent = selectedOnly
      ? "ユーザー名の確認・権限設定はFirebase連携後に有効になります。"
      : "「選択したユーザーのみ」を選ぶと閲覧者を指定できます。指定した公開範囲は現在保存されません。";
  };
  visibilityInputs.forEach((input) => input.addEventListener("change", updateRecipientAvailability));
  updateRecipientAvailability();

  window.addEventListener("beforeunload", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
}

const fanVideoInput = document.getElementById("fan-video-file");
if (fanVideoInput) {
  const preview = document.getElementById("fan-video-preview");
  const video = preview.querySelector("video");
  const status = document.getElementById("fan-video-status");
  const visibilityInputs = document.querySelectorAll('input[name="fan-video-visibility"]');
  const recipientsInput = document.getElementById("fan-video-recipients");
  let videoUrl = "";

  const clearVideoPreview = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = "";
    video.removeAttribute("src");
    video.load();
    preview.hidden = true;
    fanVideoInput.value = "";
  };

  fanVideoInput.addEventListener("change", () => {
    const file = fanVideoInput.files[0];
    if (!file) return;
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      clearVideoPreview();
      status.textContent = "MP4またはWebM形式の動画を選択してください。";
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;
    preview.hidden = false;
    status.textContent = "動画情報を確認しています。アップロードは行われません。";
  });

  video.addEventListener("loadedmetadata", () => {
    const { videoWidth, videoHeight } = video;
    const maxDimension = Math.max(videoWidth, videoHeight);
    const qualityNote = maxDimension > 1280
      ? "動画の解像度が通常メンバーの上限（最大720p）を超えています。1080p対応には有効なサブスクとサーバー側の動画変換が必要です。"
      : `動画情報：${videoWidth}×${videoHeight}。通常メンバーは最大720p / 30fpsです。`;
    status.textContent = `${qualityNote} フレームレートの確認・変換はサーバー連携後に行います。`;
  });

  video.addEventListener("error", () => {
    status.textContent = "この動画をプレビューできません。MP4またはWebM形式をご確認ください。";
  });

  preview.querySelector(".preview-remove").addEventListener("click", clearVideoPreview);
  visibilityInputs.forEach((input) => {
    input.addEventListener("change", () => {
      recipientsInput.disabled = document.querySelector('input[name="fan-video-visibility"]:checked').value !== "selected";
    });
  });
  window.addEventListener("beforeunload", () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  });
}

document.querySelectorAll(".ai-use-select").forEach((select) => {
  const tag = document.getElementById(select.id.replace("-use", "-tag"));
  if (!tag) return;
  const updateAiTag = () => {
    tag.hidden = select.value !== "yes";
  };
  select.addEventListener("change", updateAiTag);
  updateAiTag();
});

const feedFilterButtons = document.querySelectorAll("[data-feed-filter]");
if (feedFilterButtons.length) {
  const feedItems = document.querySelectorAll("[data-post-type]");
  feedFilterButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.tagName === "A") event.preventDefault();
      const filter = button.dataset.feedFilter;
      feedFilterButtons.forEach((item) => {
        const selected = item.dataset.feedFilter === filter;
        item.classList.toggle("active", selected);
        if (item.hasAttribute("aria-pressed")) item.setAttribute("aria-pressed", String(selected));
      });
      feedItems.forEach((item) => {
        item.hidden = filter !== "all" && item.dataset.postType !== filter;
      });
    });
  });
}

const avatarInput = document.getElementById("avatar-file");
if (avatarInput) {
  const avatarPreview = document.getElementById("avatar-preview");
  let avatarUrl = "";

  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;
    const status = document.getElementById("avatar-status");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      avatarInput.value = "";
      if (status) status.textContent = "PNG・JPEG・WebP形式、5MB以下の画像を選択してください。";
      return;
    }
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    avatarUrl = URL.createObjectURL(file);
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "プロフィール画像のプレビュー";
    avatarPreview.replaceChildren(image);
    if (status) status.textContent = "プレビューを表示しています。まだ保存されていません。";
  });

  window.addEventListener("beforeunload", () => {
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
  });
}

const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.querySelector(".menu-panel");
if (menuToggle && menuPanel) {
  const closeMenu = () => {
    menuPanel.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "メニューを開く");
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuPanel.hidden = isOpen;
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "メニューを開く" : "メニューを閉じる");
  });

  menuPanel.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!menuPanel.hidden && !menuPanel.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
}

const searchForm = document.querySelector(".site-search");
if (searchForm) {
  const searchInput = searchForm.querySelector('input[type="search"]');
  const searchStatus = searchForm.querySelector(".search-status");
  const searchableContent = document.querySelector(".searchable-content");
  const searchTargets = searchableContent
    ? searchableContent.querySelectorAll(":scope > section")
    : document.querySelectorAll("main > section");

  const searchPage = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const normalizedQuery = query.replace(/\s/g, "");
    let visibleCount = 0;

    searchTargets.forEach((target) => {
      const matches = !normalizedQuery ||
        target.textContent.toLocaleLowerCase().replace(/\s/g, "").includes(normalizedQuery);
      target.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (!query) {
      searchStatus.textContent = "検索を解除しました。";
    } else if (visibleCount) {
      searchStatus.textContent = `${visibleCount}件の項目が見つかりました。`;
    } else {
      searchStatus.textContent = "一致する項目はありません。";
    }
  };

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchPage();
  });

  searchInput.addEventListener("input", () => {
    if (!searchInput.value) searchPage();
  });
}
