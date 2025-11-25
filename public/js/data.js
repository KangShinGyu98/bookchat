// data fetching 관련 함수들
const USE_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const LOCAL_JSON_PATH = "./assets/data/books.json";
let localCache = null; // 로컬 JSON 캐시

/**
 * pageIndex/pageSize/orderBy/orderDirection 기준으로 필요한 범위만 받아온다.
 * orderBy: recent|rank|memberCount|old|lowRank|lessMemberCount
 */
export async function getBooks(pageIndex = 1, pageSize = 15, orderBy = "recent", orderDirection = "desc") {
  const [field, direction] = normalizeOrder(orderBy, orderDirection);
  const offsetIndex = Math.max(pageIndex - 1, 0) * pageSize;

  if (USE_LOCAL) {
    return getLocalPage(offsetIndex, pageSize, field, direction);
  }
  return getFirebasePage(offsetIndex, pageSize, field, direction);
}

function normalizeOrder(orderBy, orderDirection) {
  const defaults = {
    recent: "desc",
    rank: "desc",
    memberCount: "desc",
    old: "asc",
    lowRank: "asc",
    lessMemberCount: "asc",
  };
  const map = {
    recent: "createdAt",
    old: "createdAt",
    rank: "rating",
    lowRank: "rating",
    memberCount: "membersCount",
    lessMemberCount: "membersCount",
  };
  const field = map[orderBy] || "createdAt";
  const dir = orderDirection || defaults[orderBy] || "desc";
  return [field, dir];
}

async function getLocalPage(offsetIndex, pageSize, field, direction) {
  if (!localCache) {
    localCache = await loadFromLocalJson();
  }
  const sorted = sortBooks(localCache, field, direction);
  return sorted.slice(offsetIndex, offsetIndex + pageSize);
}

async function getFirebasePage(offsetIndex, pageSize, field, direction) {
  if (typeof db === "undefined" || typeof collection !== "function") {
    console.warn("Firebase가 설정되지 않았습니다. 빈 배열 반환.");
    return [];
  }

  const constraints = [orderBy(field, direction)];
  if (typeof offset === "function" && offsetIndex > 0) {
    constraints.push(offset(offsetIndex));
  }
  constraints.push(limit(pageSize));

  try {
    const q = query(collection(db, "books"), ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        slug: doc.id,
        title: d.title || "",
        author: d.author || "",
        rating: typeof d.rating === "number" ? d.rating : null,
        createdByUid: d.createdByUid || d.writer || "",
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : d.createdAt ? new Date(d.createdAt) : null,
        membersCount: typeof d.membersCount === "number" ? d.membersCount : Array.isArray(d.members) ? d.members.length : 0,
      };
    });
  } catch (err) {
    console.error("Firebase 페이지 로드 실패, 전체 로드로 대체:", err);
    const all = await loadFromFirebaseAll(field, direction);
    return all.slice(offsetIndex, offsetIndex + pageSize);
  }
}

async function loadFromLocalJson() {
  try {
    const res = await fetch(LOCAL_JSON_PATH);
    if (!res.ok) {
      console.error("local books.json 로드 실패:", res.status, res.statusText);
      return [];
    }
    const json = await res.json();
    return (json.books || []).map(normalizeBook);
  } catch (err) {
    console.error("local books.json 파싱 오류:", err);
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
    lastMessageAt: toDate(raw.lastMessageAt),
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    membersCount,
  };
}

// 전역 노출
window.getBooks = getBooks;
