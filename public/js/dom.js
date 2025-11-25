import { loginWithGoogle } from "./app.js";
import { getBooks } from "./data.js";
// dom 조작, event 리스너 등록, rendering, format 과 같은 Util 함수들
function getPageIndexFromURL() {
  const params = new URLSearchParams(window.location.search);
  const pageIndex = parseInt(params.get("pageIndex"), 1);
  return isNaN(pageIndex) || pageIndex < 0 ? 1 : pageIndex;
}
function getPageSizeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const pageSize = parseInt(params.get("pageSize"), 15);
  return isNaN(pageSize) || pageSize <= 0 ? 15 : pageSize;
}
function getOrderByFromURL() {
  const params = new URLSearchParams(window.location.search);
  const orderBy = params.get("orderBy");
  const validOrderBys = ["recent", "rank", "memberCount", "old", "lowRank", "lessMemberCount"];
  if (validOrderBys.includes(orderBy)) {
    const orderDirection = orderBy === "recent" || orderBy === "rank" || orderBy === "memberCount" ? "desc" : "asc";
    return [orderBy, orderDirection];
  }
}

const loginOpenBtn = document.getElementById("loginOpenBtn");
const loginModalEl = document.getElementById("loginModal");
const nicknameModalEl = document.getElementById("nicknameModal");
const googleLoginBtn = document.getElementById("googleLoginBtn");

let loginModal;
if (loginModalEl && window.bootstrap) loginModal = new window.bootstrap.Modal(loginModalEl);
let nicknameModal;
if (nicknameModalEl && window.bootstrap) nicknameModal = new window.bootstrap.Modal(nicknameModalEl);

loginOpenBtn?.addEventListener("click", () => {
  if (loginModal) loginModal.show();
});

googleLoginBtn?.addEventListener("click", async () => {
  try {
    await loginWithGoogle();
    if (loginModal) loginModal.hide();
  } catch (err) {
    alert(err.message || "Google 로그인에 실패했습니다.");
  }
});

function showNicknameModal() {
  if (nicknameModal) nicknameModal.show();
}

document.addEventListener("DOMContentLoaded", async () => {
  const pageIndex = getPageIndexFromURL();
  const pageSize = getPageSizeFromURL();
  const [orderBy, orderDirection] = getOrderByFromURL() || [];
  const books = await getBooks(pageIndex, pageSize, orderBy, orderDirection);
  renderBooks(books);
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
      <td class="text-center">${ratingText}</td>
      <td><a href=chat.html?book=\${encodeURIComponent(book.slug)}>${book.title || "-"}</a></td>
      <td>${book.author || "-"}</td>
      <td>${book.createdByUid || "-"}</td>
      <td class="text-center">${formatDate(book.createdAt)}</td>
      <td class="text-center">${book.membersCount ?? 0}</td>
    `;
    // tr.addEventListener("click", () => {
    //   if (book.slug) {
    //     location.href = `chat.html?book=\${encodeURIComponent(book.slug)}`;
    //   }
    // });
    tbody.appendChild(tr);
  });
}

function formatDate(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? "-" : d.toISOString().split("T")[0];
}
