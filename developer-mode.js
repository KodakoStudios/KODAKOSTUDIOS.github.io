(() => {
  const panel = document.getElementById("developer-mode-panel");
  if (!panel) return;

  const storageKey = "kodakoLocalScreenTests";
  const feedback = document.getElementById("developer-mode-feedback");
  const panelToggle = document.getElementById("developer-mode-toggle");
  const subscriptionSelect = document.getElementById("developer-subscription-state");
  const subscriptionButton = document.getElementById("developer-subscription-save");
  const donationForm = document.getElementById("developer-donation-form");
  const donationList = document.getElementById("developer-test-donations");
  const donationTotal = document.getElementById("developer-test-donation-total");
  const donationSubmit = donationForm.querySelector('button[type="submit"]');
  const donationClear = document.getElementById("developer-test-donation-clear");
  const aiFilterToggle = document.getElementById("ai-filter-toggle");
  const aiFilterStatus = document.getElementById("ai-filter-status");
  const allowedAmounts = new Set([1000, 3000, 5000, 10000]);

  const showFeedback = (message, isError = false) => {
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.dataset.state = isError ? "error" : "info";
  };

  const readState = () => {
    const saved = localStorage.getItem(storageKey);
    if (saved === null) {
      return { testSubscriptionActive: false, aiFilterEnabled: false, donations: [] };
    }

    const state = JSON.parse(saved);
    if (
      typeof state.testSubscriptionActive !== "boolean" ||
      typeof state.aiFilterEnabled !== "boolean" ||
      !Array.isArray(state.donations) ||
      !state.donations.every((item) =>
        Number.isInteger(item.amount) &&
        allowedAmounts.has(item.amount) &&
        typeof item.createdAt === "string" &&
        typeof item.comment === "string"
      )
    ) {
      throw new Error("このブラウザーに保存されたテストデータを読み取れません。");
    }
    return state;
  };

  const writeState = (state) => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  };

  const renderDonations = (donations) => {
    donationList.replaceChildren();
    const total = donations.reduce((sum, donation) => sum + donation.amount, 0);
    donationTotal.textContent =
      `このブラウザーのテスト記録合計：${total.toLocaleString("ja-JP")}円（実際の入金額ではありません）`;

    if (!donations.length) {
      const empty = document.createElement("li");
      empty.textContent = "テスト記録はありません。";
      donationList.append(empty);
      return;
    }

    donations.slice().reverse().forEach((donation) => {
      const item = document.createElement("li");
      const date = document.createElement("span");
      date.textContent =
        `${new Date(donation.createdAt).toLocaleString("ja-JP")} · ${donation.amount.toLocaleString("ja-JP")}円 · テスト`;
      item.append(date);
      if (donation.comment) {
        const comment = document.createElement("small");
        comment.textContent = donation.comment;
        item.append(comment);
      }
      donationList.append(item);
    });
  };

  const renderState = (state) => {
    subscriptionSelect.value = state.testSubscriptionActive ? "active" : "inactive";
    document.getElementById("developer-test-subscription-status").textContent =
      state.testSubscriptionActive ? "テスト表示：サブスク加入中" : "テスト表示：サブスク未加入";
    aiFilterToggle.disabled = !state.testSubscriptionActive;
    aiFilterToggle.checked = state.testSubscriptionActive && state.aiFilterEnabled;
    aiFilterStatus.textContent = state.testSubscriptionActive
      ? "テスト購読中の画面表示です。設定はこのブラウザー内だけに保存され、実際の投稿表示には影響しません。"
      : "テスト購読を「加入中」にすると、画面上の切替を試せます。実際の購読確認や投稿の絞り込みは行いません。";
    renderDonations(state.donations);
  };

  const updateState = (change, successMessage) => {
    try {
      const state = { ...readState(), ...change };
      writeState(state);
      renderState(state);
      showFeedback(successMessage);
    } catch (error) {
      showFeedback(`テストデータを保存できませんでした: ${error.message}`, true);
    }
  };

  panelToggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    panelToggle.setAttribute("aria-expanded", String(!panel.hidden));
    panelToggle.textContent = panel.hidden ? "画面テストを開く" : "画面テストを閉じる";
    if (!panel.hidden) {
      try {
        renderState(readState());
        feedback.hidden = true;
      } catch (error) {
        showFeedback(`テストデータを読み込めませんでした: ${error.message}`, true);
      }
    }
  });

  subscriptionButton.addEventListener("click", () => {
    const active = subscriptionSelect.value === "active";
    updateState(
      { testSubscriptionActive: active, aiFilterEnabled: active && aiFilterToggle.checked },
      "サブスクリプションのテスト表示を更新しました。実際の契約状態には影響しません。",
    );
  });

  aiFilterToggle.addEventListener("change", () => {
    updateState(
      { aiFilterEnabled: aiFilterToggle.checked },
      "AIタグ設定の画面表示を更新しました。ファン広場の表示には影響しません。",
    );
  });

  donationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = Number(donationForm.elements.namedItem("amount").value);
    const comment = donationForm.elements.namedItem("comment").value.trim();
    if (!allowedAmounts.has(amount) || comment.length > 300) {
      showFeedback("金額またはコメントを確認してください。", true);
      return;
    }

    donationSubmit.disabled = true;
    try {
      const state = readState();
      state.donations.push({ amount, comment, createdAt: new Date().toISOString() });
      writeState(state);
      renderState(state);
      donationForm.reset();
      showFeedback("テスト記録をこのブラウザーに保存しました。決済は行われず、実際の支援ではありません。");
    } catch (error) {
      showFeedback(`テスト記録を保存できませんでした: ${error.message}`, true);
    } finally {
      donationSubmit.disabled = false;
    }
  });

  donationClear.addEventListener("click", () => {
    updateState(
      { donations: [] },
      "このブラウザー内のテスト記録を削除しました。実際の支援記録には影響しません。",
    );
  });

  try {
    renderState(readState());
  } catch (error) {
    showFeedback(`テストデータを読み込めませんでした: ${error.message}`, true);
  }
})();
