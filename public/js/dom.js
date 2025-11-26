import { loginWithGoogle, onUser, logout } from "./app.js";
import { getBooks } from "./data.js";

// dom 조작, event 리스너 등록, rendering, format 과 같은 Util 함수들

const orderSelect = document.getElementById("orderBy");
const searchInput = document.getElementById("searchInput");
const searchFilter = document.getElementById("searchFilter");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const loginOpenBtn = document.getElementById("loginOpenBtn");
const loginModalEl = document.getElementById("loginModal");
const nicknameModalEl = document.getElementById("nicknameModal");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const searchForm = document.getElementById("searchForm");
const orderByButton = document.getElementById("orderByButton");
const searchFilterButton = document.getElementById("searchFilterButton");

let loginModal;
if (loginModalEl && window.bootstrap) loginModal = new window.bootstrap.Modal(loginModalEl);
let nicknameModal;
if (nicknameModalEl && window.bootstrap) nicknameModal = new window.bootstrap.Modal(nicknameModalEl);

loginOpenBtn?.addEventListener("click", async () => {
  const user = window.firebaseUserCache;
  if (user) {
    await logout();
    toastShow("성공적으로 로그아웃 되었습니다.");
  } else {
    loginModal?.show();
  }
});
//조회
orderByButton?.addEventListener("click", () => {
  const p = new URLSearchParams(location.search);
  p.set("orderBy", orderBy);
  p.set("pageIndex", "1"); // 정렬 변경 시 1페이지로 이동
  location.href = location.pathname + "?" + p.toString();
});

//검색
searchFilterButton?.addEventListener("click", () => {
  const p = new URLSearchParams(location.search);
  p.set("pageIndex", "1"); // 검색 시 1페이지로 이동
  location.href = location.pathname + "?" + p.toString();
});

googleLoginBtn?.addEventListener("click", async () => {
  try {
    await loginWithGoogle();
    if (loginModal) {
      loginModal.hide();
      toastShow("성공적으로 로그인 되었습니다.");
    }
  } catch (err) {
    alert(err.message || "Google 로그인에 실패했습니다.");
  }
});

function showNicknameModal() {
  if (nicknameModal) nicknameModal.show();
}

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
      <td class="text-truncate" style="max-width: 516px;"><a href=chat.html?book=\${encodeURIComponent(book.slug)}>${book.title || "-"}</a></td>
      <td class="text-truncate" style="max-width: 160px;">${book.author || "-"}</td>
      <td class="text-truncate" style="max-width: 120px;">${book.createdByUid || "-"}</td>
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

onUser((user) => {
  window.firebaseUserCache = user;
  if (loginOpenBtn) {
    loginOpenBtn.innerHTML = user ? `<i class="bi bi-box-arrow-right"></i> 로그아웃` : `<i class="bi bi-box-arrow-in-right"></i> 로그인`;
  }
});
const toastShow = (msg) => {
  const toastEl = document.querySelector(".toast");
  const toast = new bootstrap.Toast(toastEl);
  toastEl.querySelector(".toast-body").textContent = msg;
  toast.show();
};
