import { loginWithGoogle, onUser, logout, db, auth } from "./app.js";
import { getBooks, searchNaverBooks } from "./data.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { toastShow, toastWarning } from "./myToast.js";
import { showLoginModal } from "./login.js";
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

//등록 버튼
newPostForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
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
  };
  if (!payload.title || !payload.author) return toastShow("제목/저자를 입력하세요.");

  const token = await user.getIdToken();
  const res = await fetch("/createBook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return toastShow("등록에 실패했습니다.");
  toastShow("등록 완료!");
  newPostForm.reset();
  newPostModal?.hide();
  // 미리보기 초기화가 필요하면 여기서 추가
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
  naverBtn.disabled = true;
  naverBtn.textContent = "검색 중...";
  naverResultList.innerHTML = `<div class="col-12 text-muted small">불러오는 중...</div>`;

  try {
    const data = await searchNaverBooks(keyword);
    data.items.forEach((item) => {
      item.author = item.author.replaceAll("^", ",");
    });
    renderNaverCards(data.items || []);
  } catch (err) {
    console.error(err);
    toastShow("네이버 검색에 실패했습니다.");
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
    const card = document.createElement("div");
    card.className = "col-12 col-md-6 col-lg-4";
    card.innerHTML = `
      <div class="card h-100 hover-shadow" style="cursor:pointer;">
        ${img ? `<img src="${img}" class="card-img-top" alt="${title}" style="object-fit:cover;height:200px;">` : ""}
        <div class="card-body">
          <h6 class="card-title text-truncate">${title || "-"}</h6>
          <p class="card-text text-muted text-truncate mb-1">${author || "-"}</p>
          <small class="text-muted">${item.publisher || ""}</small>
        </div>
      </div>`;
    card.onclick = () => {
      if (titleInput) titleInput.value = title;
      if (authorInput) authorInput.value = author;
      if (imgInput) imgInput.value = item.image || "";
      if (imgPreview) {
        imgPreview.src = item.image || "";
        imgPreview.classList.toggle("d-none", !item.image);
      }
      toastShow("입력이 성공적으로 완료되었습니다.");
      naverSearchModal?.hide();
    };
    naverResultList.appendChild(card);
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
  // if (!tbody) {
  //   console.table(books);
  //   return;
  // }

  tbody.innerHTML = "";
  books.forEach((book) => {
    const ratingText = typeof book.rating === "number" ? book.rating.toFixed(1) : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center text-truncate" style="max-width: 50px;">${ratingText}</td>
      <td class="text-truncate" style="max-width: 516px;"><a href=chat.html?book=${encodeURIComponent(book.objectID)}>${book.title || "-"}</a></td>
      <td class="text-truncate" style="max-width: 160px;">${book.author || "-"}</td>
      <td class="text-truncate" style="max-width: 120px;">${book.createdByName || "-"}</td>
      <td class="text-center text-truncate" style="max-width: 90px;">${formatDate(book.createdAt)}</td>
      <td class="text-center text-truncate" style="max-width: 60px;">${book.membersCount ?? 0}</td>
    `;
    // tr.addEventListener("click", () => {
    //   if (book.slug) {
    //     location.href = `chat.html?book=\${encodeURIComponent(book.slug)}`;
    //   }
    // });
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
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? "-" : d.toISOString().split("T")[0];
}
