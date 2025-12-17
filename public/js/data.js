import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { db } from "./app.js";
// data fetching 관련 함수들
const USE_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const LOCAL_JSON_PATH = "./assets/data/books.json";
let localCache = null; // 로컬 JSON 캐시
import algoliasearch from "https://cdn.jsdelivr.net/npm/algoliasearch@4.24.0/dist/algoliasearch-lite.esm.browser.js";

/**
 * pageIndex/pageSize/orderBy/orderDirection 기준으로 필요한 범위만 받아온다.
 * orderBy: recent|rank|memberCount|old|lowRank|lessMemberCount
 */
export async function getBooks(searchCondition) {
  const field = normalizeOrder(searchCondition.orderBy);
  const offsetIndex = Math.max(searchCondition.pageIndex - 1, 0) * searchCondition.pageSize;
  if (USE_LOCAL) {
    // return getLocalPage(offsetIndex, searchCondition.pageSize, field); 과거 json 데이터
    return getEmulatorPage(searchCondition);
  }
  return getFirebasePage(searchCondition);
}

async function getEmulatorPage(searchCondition) {
  // searchCondition 은 받아두지만, 여기서는 정렬/페이징 안 쓰고 전체 반환만 함
  const colRef = collection(db, "books");
  const snap = await getDocs(colRef);

  const hits = snap.docs.map((doc) => ({
    objectID: doc.id, // Algolia 호환용
    ...doc.data(),
  }));
  return {
    hits, // 전체 책 데이터 배열
    page: 0, // 항상 0페이지로 고정
    nbPages: 1, // 페이지 1개라고 가정
    nbHits: hits.length, // 전체 개수
    hitsPerPage: hits.length, // 한 페이지에 전부 다
  };
}

function normalizeOrder(orderBy) {
  const map = {
    recent: "createdAt",
    rank: "rating",
    memberCount: "membersCount",
    lastMessagedAt: "lastMessagedAt",
  };
  const field = map[orderBy] || "createdAt";
  return field;
}

async function getLocalPage(offsetIndex, pageSize, field, direction = "desc") {
  if (!localCache) {
    localCache = await loadFromLocalJson();
  }
  const sorted = sortBooks(localCache, field, direction);
  const start = Math.max(0, offsetIndex);
  const hits = sorted.slice(start, start + pageSize);
  return {
    hits,
    nbHits: sorted.length,
    nbPages: Math.max(1, Math.ceil(sorted.length / pageSize)),
    page: Math.floor(start / pageSize),
  };
}

/**
 * Firestore + Algolia 에서 책 목록 가져오기
 * @param {Object} searchCondition
 *  - pageIndex: 1-based
 *  - pageSize
 *  - orderBy: 'recent' | 'rank' | 'memberCount' | 'old' | 'lowRank' | 'lessMemberCount'
 *  - searchFilter: 'all' | 'title' | 'author' | 'writer'
 *  - searchInput: string
 * @returns {Promise<AlgoliaSearchResponse>}
 *  - { hits, page, hitsPerPage, nbPages, nbHits, ... }
 */

const ALGOLIA_APP_ID = "FEFKVKE9CI";
const ALGOLIA_SEARCH_KEY = "f5a80954d9aadcbf3b034a85d791129e";
const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);

// 기본 인덱스 이름 (익스텐션에서 설정한 이름)
const BASE_INDEX_NAME = "bookchat-algolia-index";
function getIndexName(orderBy) {
  switch (orderBy) {
    case "recent": // 최신순 (createdAt 내림차순)
      return `${BASE_INDEX_NAME}_createdAt`;
    case "rank": // 평점 높은순
      return `${BASE_INDEX_NAME}_rating`;
    case "memberCount": // 멤버 많은순
      return `${BASE_INDEX_NAME}_membersCount`;
    case "lastMessagedAt": // 최근 대화순
      return `${BASE_INDEX_NAME}_lastMessagedAt`;
    default:
      return `${BASE_INDEX_NAME}_createdAt`;
  }
}

async function getFirebasePage(searchCondition) {
  // Algolia는 0-based page 사용
  const algoliaPage = Math.max(0, Number(searchCondition.pageIndex) - 1);
  const hitsPerPage = Number(searchCondition.pageSize) || 15;

  const indexName = getIndexName(searchCondition.orderBy);
  const index = algoliaClient.initIndex(indexName);

  const params = {
    query: searchCondition.searchInput.trim(),
    page: algoliaPage,
    hitsPerPage,
  };

  if (searchCondition.searchFilter === "title") {
    params.restrictSearchableAttributes = ["title"];
  } else if (searchCondition.searchFilter === "author") {
    params.restrictSearchableAttributes = ["author"];
  } else if (searchCondition.searchFilter === "writer") {
    params.restrictSearchableAttributes = ["createdByName"];
  }
  // 실제 검색
  const res = await index.search(searchCondition.searchInput || "", params);

  // res 구조 (중요한 것들):
  //  - res.hits      : 현재 페이지의 책 데이터 배열
  //  - res.page      : 0-based 현재 페이지
  //  - res.nbPages   : 전체 페이지 수
  //  - res.nbHits    : 전체 결과 개수
  //  - res.hitsPerPage: 페이지당 개수
  return res;
}

async function loadFromLocalJson() {
  try {
    const res = await fetch(LOCAL_JSON_PATH);
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    return (json.books || []).map(normalizeBook);
  } catch (err) {
    return [];
  }
}

async function loadFromFirebaseAll(field = "createdAt", direction = "desc") {
  if (typeof db === "undefined" || typeof collection !== "function") {
    return [];
  }
  const q = query(collection(db, "books"), orderBy(field, direction));
  const snap = await getDocs(q);
  const books = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    books.push(
      normalizeBook({
        ...data,
        slug: docSnap.id,
      })
    );
  });
  return sortBooks(books, field, direction);
}

function sortBooks(items, field, dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const normalize = (v) => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.getTime();
    return v;
  };
  const clone = [...items];
  clone.sort((a, b) => {
    const va = normalize(a[field]);
    const vb = normalize(b[field]);
    if (va === vb) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va > vb ? sign : -sign;
  });
  return clone;
}

function normalizeBook(raw) {
  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === "function") return v.toDate();
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };

  const membersCount = typeof raw.membersCount === "number" ? raw.membersCount : Array.isArray(raw.members) ? raw.members.length : 0;

  return {
    slug: raw.slug || raw.title || "",
    title: raw.title || "",
    author: raw.author || "",
    rating: typeof raw.rating === "number" ? raw.rating : null,
    createdByUid: raw.createdByUid || raw.writer || "",
    createdAt: toDate(raw.createdAt),
    lastMessage: raw.lastMessage || null,
    lastMessagedAt: toDate(raw.lastMessagedAt),
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    membersCount,
  };
}

// Naver 책 검색 (Functions 프록시 사용)
export async function searchNaverBooks(query, { display = 10, start = 1, sort = "sim" } = {}) {
  if (!query) return { items: [] };
  const qs = new URLSearchParams({ query, display, start, sort });
  const res = await fetch(`/searchBooks?${qs.toString()}`);
  if (!res.ok) throw new Error(`naver search failed: ${res.status}`);
  return res.json(); // { items: [...] }
}

//autocomplete
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
  console.log("searchAutocomplete", query);
  const requestId = ++lastRequestId;
  const index = algoliaClient.initIndex(BASE_INDEX_NAME);

  const params = {
    query: query.trim(),
    page: 0,
    hitsPerPage,
  };

  params.restrictSearchableAttributes = ["title", "author"];
  console.log("params", params);
  const res = await index.search(query || "", params);

  // 입력이 빠르게 바뀌면 이전 응답은 무시
  if (requestId !== lastRequestId) return null;

  return res.hits || [];
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderItems(items) {
  currentItems = items;
  activeIndex = -1;

  if (!items || items.length === 0) {
    panelEl.innerHTML = `<div class="ac-empty">검색 결과가 없어요.</div>`;
    openPanel();
    return;
  }

  panelEl.innerHTML = items
    .map((item, i) => {
      const title = escapeHtml(item.title);
      const author = escapeHtml(item.author);
      return `
        <div class="ac-item" data-index="${i}">
          <div>${title} - ${author}</div>
        </div>
      `;
    })
    .join("");

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
