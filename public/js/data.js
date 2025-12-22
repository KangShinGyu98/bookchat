import algoliasearch from "https://cdn.jsdelivr.net/npm/algoliasearch@4.24.0/dist/algoliasearch-lite.esm.browser.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { db } from "./app.js";
// data fetching 관련 함수들
const USE_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const LOCAL_JSON_PATH = "./assets/data/books.json";
let localCache = null; // 로컬 JSON 캐시

/**
 * pageIndex/pageSize/orderBy/orderDirection 기준으로 필요한 범위만 받아온다.
 * orderBy: recent|rank|memberCount|old|lowRank|lessMemberCount
 */
export async function getBooks(searchCondition) {
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
