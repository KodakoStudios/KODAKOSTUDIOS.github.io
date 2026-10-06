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
  const lightboxCredit = lightbox.querySelector(".lightbox-credit");
  const lightboxCaption = lightbox.querySelector(".lightbox-caption");
  const lightboxDescription = lightbox.querySelector(".lightbox-description");

  document.querySelectorAll(".character-zoom").forEach((button) => {
    button.addEventListener("click", () => {
      lightboxImage.src = button.dataset.image;
      lightboxImage.alt = button.dataset.caption || "キャラクターアート";
      lightboxCredit.textContent = button.dataset.credit || "";
      lightboxCredit.hidden = !button.dataset.credit;
      lightboxCaption.textContent = button.dataset.caption || "";
      lightboxDescription.textContent = button.dataset.description || "";
      lightboxDescription.hidden = !button.dataset.description;
      lightbox.showModal();
    });
  });

  lightbox.querySelector(".lightbox-close").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
}

const mediaSupportDialog = document.getElementById("media-support-dialog");
if (mediaSupportDialog) {
  document.querySelectorAll("[data-support-modal-open]").forEach((button) => {
    button.addEventListener("click", () => mediaSupportDialog.showModal());
  });
  mediaSupportDialog.querySelector("[data-support-modal-close]").addEventListener("click", () => mediaSupportDialog.close());
  mediaSupportDialog.addEventListener("click", (event) => {
    if (event.target === mediaSupportDialog) mediaSupportDialog.close();
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
  const getFeedItems = () => document.querySelectorAll("[data-post-type]");
  const applyFeedFilter = (filter) => {
    getFeedItems().forEach((item) => {
      item.hidden = filter !== "all" && item.dataset.postType !== filter;
    });
  };
  feedFilterButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.tagName === "A") event.preventDefault();
      const filter = button.dataset.feedFilter;
      feedFilterButtons.forEach((item) => {
        const selected = item.dataset.feedFilter === filter;
        item.classList.toggle("active", selected);
        if (item.hasAttribute("aria-pressed")) item.setAttribute("aria-pressed", String(selected));
      });
      applyFeedFilter(filter);
    });
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
