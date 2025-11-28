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
    return getLocalPage(offsetIndex, searchCondition.pageSize, field);
  }
  return getFirebasePage(searchCondition);
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

// 기본 인덱스 이름 (익스텐션에서 설정한 이름)
const BASE_INDEX_NAME = "bookchat-algolia-index";
function getIndexName(orderBy) {
  switch (orderBy) {
    case "recent": // 최신순 (createdAt 내림차순)
      return `${BASE_INDEX_NAME}`;
    case "rank": // 평점 높은순
      return `${BASE_INDEX_NAME}_rating`;
    case "memberCount": // 멤버 많은순
      return `${BASE_INDEX_NAME}_membersCount`;
    case "lastMessagedAt": // 최근 대화순
      return `${BASE_INDEX_NAME}_lastMessagedAt`;
    default:
      return `${BASE_INDEX_NAME}`;
  }
}

async function getFirebasePage(searchCondition) {
  const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
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
