//autocomplete
import algoliasearch from "https://cdn.jsdelivr.net/npm/algoliasearch@4.24.0/dist/algoliasearch-lite.esm.browser.js";
const BASE_INDEX_NAME = "bookchat-algolia-index";
const ALGOLIA_APP_ID = "FEFKVKE9CI";
const ALGOLIA_SEARCH_KEY = "f5a80954d9aadcbf3b034a85d791129e";
const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);

const inputEl = document.getElementById("searchInput");
const panelEl = document.getElementById("autocomplete");

const hitsPerPage = 8;
let activeIndex = -1;
let currentItems = [];
let debounceTimer = null;
let lastRequestId = 0;

// 패널 열기/닫기
function openPanel() {
  panelEl.style.display = "block";
}
function closePanel() {
  panelEl.style.display = "none";
  activeIndex = -1;
}
async function searchAutocomplete(query) {
  const requestId = ++lastRequestId;
  const index = algoliaClient.initIndex(BASE_INDEX_NAME);

  const params = {
    query: query.trim(),
    page: 0,
    hitsPerPage,
  };

  params.restrictSearchableAttributes = ["title", "author"];
  const res = await index.search(query || "", params);

  // 입력이 빠르게 바뀌면 이전 응답은 무시
  if (requestId !== lastRequestId) return null;

  return res.hits || [];
}

function renderItems(items) {
  currentItems = items;
  activeIndex = -1;

  // 패널 내용 비우기
  panelEl.replaceChildren();

  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ac-empty";
    empty.textContent = "검색 결과가 없어요.";
    panelEl.appendChild(empty);
    openPanel();
    return;
  }

  const frag = document.createDocumentFragment();

  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "ac-item";
    row.dataset.index = String(i);

    const line = document.createElement("div");
    // ✅ textContent를 쓰면 escapeHtml 자체가 필요 없음
    const title = item?.title ?? "";
    const author = item?.author ?? "";
    line.textContent = `${title} - ${author}`;

    row.appendChild(line);
    frag.appendChild(row);
  });

  panelEl.appendChild(frag);
  openPanel();
}

function debounce(fn, delay = 150) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delay);
  };
}
const runAutocomplete = debounce(async () => {
  const q = inputEl.value.trim();
  if (!q) {
    closePanel();
    panelEl.innerHTML = "";
    return;
  }
  const items = await searchAutocomplete(q);
  if (items === null) return; // stale response
  renderItems(items);
}, 180);

let lastValue = "";

// 입력 시 검색
inputEl.addEventListener("input", () => {
  if (inputEl.value === lastValue) return;
  lastValue = inputEl.value;
  runAutocomplete();
});

// 포커스 시: 값 있으면 열기
inputEl.addEventListener("focus", () => {
  if (inputEl.value.trim() && panelEl.innerHTML) openPanel();
});

// blur 시 닫기: 클릭 선택이 먼저 되도록 약간 지연
inputEl.addEventListener("blur", () => {
  setTimeout(() => closePanel(), 150);
});

// 클릭 선택
panelEl.addEventListener("mousedown", (e) => {
  const itemEl = e.target.closest(".ac-item");
  if (!itemEl) return;
  const idx = Number(itemEl.dataset.index);
  const item = currentItems[idx];
  if (!item) return;

  // 1) 검색어 확정: title로 채우거나, 그냥 입력값 유지
  inputEl.value = item.title || inputEl.value;

  closePanel();
  const searchForm = document.getElementById("searchForm");

  if (searchForm) {
    searchForm.submit();
  }
  // 2) 여기서 “결정 이후” 동작:
  // - (A) 바로 상세로 이동하거나
  // - (B) 검색 결과 페이지로 이동하거나
  // - (C) 너의 기존 getFirebasePage()로 목록을 다시 로드
  //
  // 예: 검색 페이지로 이동
  // window.location.href = `/search?q=${encodeURIComponent(inputEl.value)}&page=1&orderBy=${getCurrentOrderBy()}`;
});

// 키보드 이동/선택/닫기
inputEl.addEventListener("keydown", (e) => {
  if (panelEl.style.display !== "block") return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
    updateActive();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActive();
  } else if (e.key === "Enter") {
    if (activeIndex >= 0 && currentItems[activeIndex]) {
      e.preventDefault();
      const item = currentItems[activeIndex];
      inputEl.value = item.title || inputEl.value;
      closePanel();
      // 결정 이후 동작 연결 (검색 실행/이동)
      // 해당 검색어로 검색
      // searchInput 값을 변경후 submit
      const searchForm = document.getElementById("searchForm");

      if (searchForm) {
        searchForm.submit();
      }
    }
  } else if (e.key === "Escape") {
    closePanel();
  }
});

function updateActive() {
  const nodes = panelEl.querySelectorAll(".ac-item");
  nodes.forEach((n) => n.classList.remove("is-active"));
  const active = panelEl.querySelector(`.ac-item[data-index="${activeIndex}"]`);
  if (active) {
    active.classList.add("is-active");
    active.scrollIntoView({ block: "nearest" });
  }
}
