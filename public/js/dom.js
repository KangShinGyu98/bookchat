import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, callNaverBooksApi, createBook, db } from "./app.js";
import { getBooks } from "./data.js";
import { showLoginModal } from "./login.js";
import { toastShow } from "./myToast.js";
// dom 조작, event 리스너 등록, rendering, format 과 같은 Util 함수들

const orderSelect = document.getElementById("orderBy");
const searchInput = document.getElementById("searchInput");
const searchFilter = document.getElementById("searchFilter");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const searchForm = document.getElementById("searchForm");
const orderByButton = document.getElementById("orderByButton");
const searchFilterButton = document.getElementById("searchFilterButton");
const newPostOpenBtn = document.getElementById("newPostOpenBtn");
const newPostModalEl = document.getElementById("newPostModal");
const naverSearchModalEl = document.getElementById("naverSearchModal");
const openNaverSearchBtn = document.getElementById("openNaverSearchBtn");
const naverQueryInput = document.getElementById("naverQueryInput");
const naverBtn = document.getElementById("naverSearchBtn");
const naverResultList = document.getElementById("naverResultList");
const titleInput = document.getElementById("newTitle");
const authorInput = document.getElementById("newAuthor");
const imgInput = document.getElementById("newImageUrl");
const imgPreview = document.getElementById("newImagePreview");
const newPostForm = document.getElementById("newPostForm");
const enrollBookBtn = document.getElementById("enrollBookBtn");
const cancelBookBtn = document.getElementById("cancelBookBtn");
const ratingInput = document.getElementById("newRating");
const questionInput = document.getElementById("newQuestion");
const ratingValueDisplay = document.getElementById("ratingValueDisplay");
const ISBNInput = document.getElementById("ISBN");
const ISBNModalEl = document.getElementById("ISBNModal");
const ISBNForm = document.getElementById("ISBNForm");
let ISBNModal;
if (ISBNModalEl && window.bootstrap) ISBNModal = new bootstrap.Modal(ISBNModalEl);
const syncRating = () => {
  if (!ratingInput || !ratingValueDisplay) return;
  ratingValueDisplay.textContent = ratingInput.value;
};

ratingInput?.addEventListener("input", syncRating); // 드래그 중
ratingInput?.addEventListener("change", syncRating); // 드래그 완료
syncRating(); // 초기값 표시

// 토스트 테스트 버튼

// const toastBtn = document.getElementById("toastbtn");

// //토스트 테스트 버튼
// toastBtn?.addEventListener("click", (e) => {
//   e.preventDefault();
//   badToastShow("토스트 테스트입니다.");
// });

let newPostModal;
if (newPostModalEl && window.bootstrap) newPostModal = new window.bootstrap.Modal(newPostModalEl);
// 모달 인스턴스
let naverSearchModal;
if (naverSearchModalEl && window.bootstrap) naverSearchModal = new bootstrap.Modal(naverSearchModalEl);
const overlay = document.getElementById("modalLoadingOverlay");
const modalContent = document.getElementById("newPostModalContent");

function setModalLoading(isLoading) {
  overlay?.classList.toggle("d-none", !isLoading);
  modalContent?.classList.toggle("is-loading", isLoading);
}
async function saveNewBook() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) return toastShow("로그인이 필요합니다.");
  const user = auth.currentUser;
  // 프로필에서 닉네임 다시 읽기

  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const nickname = profile.nickname || "익명";
  if (!profile.nickname) return toastShow("별명 설정이 필요합니다.");
  const payload = {
    title: titleInput?.value?.trim(),
    author: authorInput?.value?.trim(),
    rating: Number(ratingInput?.value || 0),
    imageUrl: imgInput?.value || "",
    question: questionInput?.value?.trim(),
    createdByName: nickname,
    ISBN: ISBNInput?.value?.trim() || "",
  };
  if (!payload.title || !payload.author) return toastShow("제목/저자를 입력하세요.");
  if (payload.title.length > 100) return toastShow("책제목은 최대 100자까지 입력할 수 있습니다.");
  if (payload.author.length > 100) return toastShow("저자는 최대 100자까지 입력할 수 있습니다.");
  if (payload.question.length > 300) return toastShow("질문은 최대 300자까지 입력할 수 있습니다.");
  setModalLoading(true);

  try {
    const res = await createBook(payload);
    if (res.ok) {
      toastShow("책이 등록되었습니다.");
    }
  } catch (e) {
    switch (e?.code) {
      case "unauthenticated":
        toastShow("로그인이 필요합니다.");
        break;
      case "permission-denied":
        toastShow("책을 등록하기 위해서는 로그인이 필요합니다.");
        break;
      case "invalid-argument":
        toastShow(e?.message ?? "입력값이 올바르지 않습니다.");
        break;
      case "failed-precondition":
        toastShow(e?.message ?? "닉네임을 설정해야합니다.");
        break;
      case "already-exists":
        toastShow(e?.message ?? "이미 등록된 책입니다.");
        break;
      default:
        toastShow("서버 오류가 발생했습니다.");
    }
  } finally {
    setModalLoading(false);
  }

  newPostForm.reset();
  newPostModal?.hide();
  // 다시 book render
  const p = new URLSearchParams(location.search);
  const searchCondition = {
    pageIndex: Number(p.get("pageIndex")) || 1,
    pageSize: Number(p.get("pageSize")) || 15,
    orderBy: p.get("orderBy") || "recent",
    searchFilter: p.get("searchFilter") || "all",
    searchInput: p.get("searchInput") || "",
  };
  const booksRes = await getBooks(searchCondition);
  renderBooks(booksRes.hits || []);
  imgPreview.classList.toggle("d-none", true); // 미리보기 숨기기
}
//등록 버튼
newPostForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const isbn = ISBNInput?.value?.trim().replace(/[-\s]/g, "") || "";
  if (isbn) {
    const q = query(collection(db, "books"), where("ISBN", "==", isbn));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      return toastShow("이미 등록된 도서입니다.");
    }
  } else {
    ISBNModal?.show();
    return false;
  }
  saveNewBook();
});
ISBNForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  saveNewBook();
  ISBNModal?.hide();
});

cancelBookBtn?.addEventListener("click", () => {
  newPostForm?.reset(); // 입력 초기화
  const imgPreview = document.getElementById("newImagePreview");
  if (imgPreview) imgPreview.classList.add("d-none"); // 미리보기 숨기기
  newPostModal?.hide(); // 모달 닫기 (이미 만들어둔 newPostModal 인스턴스 사용)
  syncRating();
});

const stripTags = (str = "") => str.replace(/<[^>]+>/g, "");
// 공용 검색 함수
const runNaverSearch = async (keyword) => {
  if (!keyword) return toastShow("검색어를 입력해주세요.");
  if (keyword.length > 50) return toastShow("검색어는 최대 50자까지 입력할 수 있습니다.");

  naverBtn.disabled = true;
  naverBtn.textContent = "검색 중...";
  naverResultList.innerHTML = `<div class="col-12 text-muted small">불러오는 중...</div>`;

  try {
    const res = await callNaverBooksApi({ query: keyword });
    const data = res.data || {};

    (data.items || []).forEach((item) => {
      item.author = (item.author || "").replaceAll("^", ",");
    });

    renderNaverCards(data.items || []);
  } catch (err) {
    console.error(err);

    // callable 에러는 err.code / err.message가 있음
    switch (err?.code) {
      case "unauthenticated":
      case "permission-denied":
        toastShow("로그인이 필요합니다.");
        break;
      case "invalid-argument":
        toastShow(err?.message ?? "검색어가 올바르지 않습니다.");
        break;
      default:
        toastShow("네이버 검색에 실패했습니다.");
    }
  } finally {
    naverBtn.disabled = false;
    naverBtn.textContent = "검색";
  }
};

// 카드 렌더 (이미지 포함)
const renderNaverCards = (items) => {
  naverResultList.innerHTML = "";
  if (!items.length) {
    naverResultList.innerHTML = `<div class="col-12 text-muted small">검색 결과가 없습니다.</div>`;
    return;
  }
  items.forEach((item) => {
    const title = stripTags(item.title);
    const author = stripTags(item.author);
    const img = item.image || "";

    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-lg-4";

    const card = document.createElement("div");
    card.className = "card h-100 hover-shadow";
    card.style.cursor = "pointer";

    // 이미지
    if (img) {
      const imgEl = document.createElement("img");
      imgEl.src = img;
      imgEl.alt = title;
      imgEl.className = "card-img-top";
      imgEl.style.objectFit = "cover";
      imgEl.style.height = "200px";
      card.appendChild(imgEl);
    }

    // body
    const body = document.createElement("div");
    body.className = "card-body";

    const titleEl = document.createElement("h6");
    titleEl.className = "card-title text-truncate";
    titleEl.textContent = title || "-";

    const authorEl = document.createElement("p");
    authorEl.className = "card-text text-muted text-truncate mb-1";
    authorEl.textContent = author || "-";

    const publisherEl = document.createElement("small");
    publisherEl.className = "text-muted";
    publisherEl.textContent = item.publisher || "";

    body.append(titleEl, authorEl, publisherEl);
    card.appendChild(body);
    col.appendChild(card);

    // 클릭 이벤트
    col.onclick = () => {
      if (titleInput) titleInput.value = title;
      if (authorInput) authorInput.value = author;
      if (imgInput) imgInput.value = img;

      if (imgPreview) {
        imgPreview.src = img;
        imgPreview.classList.toggle("d-none", !img);
      }

      if (ISBNInput) ISBNInput.value = item.isbn || "";

      toastShow("입력이 성공적으로 완료되었습니다.");
      naverSearchModal?.hide();
    };

    naverResultList.appendChild(col);
  });
};

// “네이버 검색” 버튼 (새 글 모달 안)
openNaverSearchBtn?.addEventListener("click", () => {
  const seed = titleInput?.value?.trim() || "";
  if (naverQueryInput) naverQueryInput.value = seed;
  naverSearchModal?.show();
  if (!seed) {
    naverQueryInput?.focus();
    return;
  }
  runNaverSearch(seed);
});

// 검색 모달 안 “검색” 버튼
naverBtn?.addEventListener("click", () => {
  const q = naverQueryInput?.value?.trim();
  naverSearchModal?.show(); // 혹시 모달이 닫혀있으면 열기
  runNaverSearch(q);
});

// 엔터키로 검색
naverQueryInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    naverBtn?.click();
  }
});

newPostOpenBtn?.addEventListener("click", () => {
  const isUser = auth.currentUser && !auth.currentUser.isAnonymous;
  if (isUser) {
    newPostModal?.show();
  } else {
    toastShow("로그인이 필요합니다.");
    showLoginModal();
  }
});

//조회
orderByButton?.addEventListener("click", () => {
  const p = new URLSearchParams(location.search);
  p.set("orderBy", orderBy);
  p.set("pageIndex", "1"); // 정렬 변경 시 1페이지로 이동
  searchForm.action = p.toString() ? `?${p.toString()}` : "";
  searchForm.submit();
});

//검색
searchFilterButton?.addEventListener("click", () => {
  const p = new URLSearchParams(location.search);
  p.set("pageIndex", "1"); // 검색 시 1페이지로 이동
  searchForm.action = p.toString() ? `?${p.toString()}` : "";
  searchForm.submit();
});

document.addEventListener("DOMContentLoaded", async () => {
  const p = new URLSearchParams(location.search);
  const searchCondition = {
    pageIndex: Number(p.get("pageIndex")) || 1,
    pageSize: Number(p.get("pageSize")) || 15,
    orderBy: p.get("orderBy") || "recent",
    searchFilter: p.get("searchFilter") || "all",
    searchInput: p.get("searchInput") || "",
  };
  const booksRes = await getBooks(searchCondition);
  // res 구조 (중요한 것들):
  //  - res.hits      : 현재 페이지의 책 데이터 배열
  //  - res.page      : 0-based 현재 페이지
  //  - res.nbPages   : 전체 페이지 수
  //  - res.nbHits    : 전체 결과 개수
  //  - res.hitsPerPage: 페이지당 개수
  renderBooks(booksRes.hits || []);
  renderPagenavigation(booksRes.nbPages, booksRes.page + 1);

  //초기값 세팅
  if (orderSelect) orderSelect.value = searchCondition.orderBy;
  if (searchInput) searchInput.value = searchCondition.searchInput;
  if (searchFilter) searchFilter.value = searchCondition.searchFilter;
  if (pageSizeSelect) pageSizeSelect.value = searchCondition.pageSize;
});

function renderBooks(books) {
  const tbody = document.getElementById("boardBody");
  if (!tbody) return;

  tbody.textContent = "";

  books.forEach((book) => {
    const tr = document.createElement("tr");

    // rating
    const tdRating = document.createElement("td");
    tdRating.className = "text-center text-truncate";
    tdRating.style.maxWidth = "50px";
    tdRating.textContent = typeof book.ratingAvg === "number" ? book.ratingAvg : "-";

    // title + link
    const tdTitle = document.createElement("td");
    tdTitle.className = "text-truncate";
    tdTitle.style.maxWidth = "516px";

    const link = document.createElement("a");
    link.href = `chat.html?book=${encodeURIComponent(book.objectID)}`;
    link.textContent = book.title || "-";

    tdTitle.appendChild(link);

    // author
    const tdAuthor = document.createElement("td");
    tdAuthor.className = "text-truncate";
    tdAuthor.style.maxWidth = "160px";
    tdAuthor.textContent = book.author || "-";

    // created by
    const tdCreator = document.createElement("td");
    tdCreator.className = "text-truncate";
    tdCreator.style.maxWidth = "120px";
    tdCreator.textContent = book.createdByName || "-";

    // date
    const tdDate = document.createElement("td");
    tdDate.className = "text-center text-truncate";
    tdDate.style.maxWidth = "90px";
    tdDate.textContent = formatDate(book.createdAt);

    // subscribed count
    const tdSubs = document.createElement("td");
    tdSubs.className = "text-center text-truncate";
    tdSubs.style.maxWidth = "60px";
    tdSubs.textContent = book.subscribedMembers ?? 0;

    tr.append(tdRating, tdTitle, tdAuthor, tdCreator, tdDate, tdSubs);

    tbody.appendChild(tr);
  });
}

function goPage(page) {
  // 현재 폼 값 + 페이지 번호로 쿼리 구성
  const p = new URLSearchParams(location.search);
  p.set("pageIndex", page);
  location.href = location.pathname + "?" + p.toString();
}

function renderPagenavigation(nbPages, currentPage) {
  const nav = document.getElementById("page-navigation");
  if (!nav) return;
  const ul = nav.querySelector(".pagination");
  if (!ul) return;

  const page = Math.max(1, Number(currentPage) || 1);
  const last = Math.max(1, Number(nbPages) || 1);

  const addItem = (label, p, disabled = false, active = false) => {
    const li = document.createElement("li");
    li.className = "page-item";
    if (disabled) li.classList.add("disabled");
    if (active) li.classList.add("active");

    const a = document.createElement("a");
    a.className = "page-link";
    a.href = "#";
    a.onclick = (e) => {
      e.preventDefault();
      if (!disabled && p != null) {
        goPage(p);
      }
      return false;
    };
    a.innerHTML = label;
    li.appendChild(a);
    ul.appendChild(li);
  };

  // 초기화
  ul.innerHTML = "";

  // 처음, 이전
  addItem('<i class="bi bi-chevron-double-left"></i>', 1, page === 1);
  addItem('<i class="bi bi-chevron-left"></i>', Math.max(1, page - 1), page === 1);

  // 페이지 번호(현재 기준 앞뒤로 최대 2개 + 양끝)
  const windowSize = 2;
  const start = Math.max(1, page - windowSize);
  const end = Math.min(last, page + windowSize);
  1413;

  if (start > 1) addItem("1", 1, false, page === 1);
  if (start > 2) addItem("…", null, true);

  for (let p = start; p <= end; p++) {
    addItem(String(p), p, false, p === page);
  }

  if (end < last - 1) addItem("…", null, true);
  if (end < last) addItem(String(last), last, false, page === last);

  // 다음, 마지막
  addItem('<i class="bi bi-chevron-right"></i>', Math.min(last, page + 1), page === last);
  addItem('<i class="bi bi-chevron-double-right"></i>', last, page === last);
}

function formatDate(value) {
  if (!value) return "-";

  // Firestore Timestamp 처리
  if (typeof value === "object" && typeof value.toDate === "function") {
    value = value.toDate();
  }

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toISOString().split("T")[0];
}
