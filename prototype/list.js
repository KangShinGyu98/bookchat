import { loginWithGoogle, loginWithEmailPassword, signupWithEmailPassword, sendPasswordReset, logout, onUser, db } from "./app.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const carouselInner = document.getElementById("carouselInner");
const boardBody = document.getElementById("boardBody");
const pagination = document.getElementById("pagination");
const sortSelect = document.getElementById("sortSelect");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");

const notifyBtn = document.getElementById("notifyBtn");
const loginOpenBtn = document.getElementById("loginOpenBtn");
const loginModalEl = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const signupBtn = document.getElementById("signupBtn");
const forgotBtn = document.getElementById("forgotBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const newPostBtn = document.getElementById("newPostBtn");
const newPostModalEl = document.getElementById("newPostModal");
const newPostForm = document.getElementById("newPostForm");
const newTitle = document.getElementById("newTitle");
const newAuthor = document.getElementById("newAuthor");
const newQuestion = document.getElementById("newQuestion");
const newImage = document.getElementById("newImage");

let loginModal;
if (loginModalEl && window.bootstrap) loginModal = new window.bootstrap.Modal(loginModalEl);
let newPostModal;
if (newPostModalEl && window.bootstrap) newPostModal = new window.bootstrap.Modal(newPostModalEl);

let curatedSlides = [];
let boardData = [];
let filtered = [];
let currentPage = 1;

loadCurated();
loadBooks();

sortSelect.addEventListener("change", () => {
  applySort();
  goToPage(1);
});

pageSizeSelect.addEventListener("change", () => {
  goToPage(1);
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const term = searchInput.value.trim().toLowerCase();
  filtered = boardData.filter((item) => {
    return item.title?.toLowerCase().includes(term) || item.author?.toLowerCase().includes(term) || (item.writer || "").toLowerCase().includes(term);
  });
  applySort();
  goToPage(1);
});

notifyBtn?.addEventListener("click", () => alert("알림 설정은 로그인 후 사용 가능합니다."));

loginOpenBtn?.addEventListener("click", () => {
  if (loginModal) loginModal.show();
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value;
  if (!email || !password) return;
  try {
    await loginWithEmailPassword(email, password);
    if (loginModal) loginModal.hide();
  } catch (err) {
    alert(err.message || "로그인에 실패했습니다.");
  }
});

signupBtn?.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value;
  if (!email || !password) {
    alert("이메일과 비밀번호를 입력하세요.");
    return;
  }
  try {
    await signupWithEmailPassword(email, password);
    alert("회원가입 완료! 자동 로그인되었습니다.");
    if (loginModal) loginModal.hide();
  } catch (err) {
    alert(err.message || "회원가입에 실패했습니다.");
  }
});

forgotBtn?.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail")?.value.trim();
  if (!email) {
    alert("비밀번호 찾기를 위해 이메일을 입력하세요.");
    return;
  }
  try {
    await sendPasswordReset(email);
    alert("비밀번호 재설정 메일을 전송했습니다.");
  } catch (err) {
    alert(err.message || "메일 전송에 실패했습니다.");
  }
});

googleLoginBtn?.addEventListener("click", async () => {
  try {
    await loginWithGoogle();
    if (loginModal) loginModal.hide();
  } catch (err) {
    alert(err.message || "Google 로그인에 실패했습니다.");
  }
});

newPostBtn?.addEventListener("click", () => {
  if (newPostModal) newPostModal.show();
});

newPostForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = newTitle?.value.trim();
  const author = newAuthor?.value.trim();
  const question = newQuestion?.value.trim();
  const file = newImage?.files?.[0];
  if (!title || !author || !question) {
    alert("필수 항목을 모두 입력하세요.");
    return;
  }
  if (file && !/\.(jpe?g|png)$/i.test(file.name)) {
    alert("jpg, jpeg, png 파일만 업로드 가능합니다.");
    return;
  }
  const user = window?.firebaseUserCache;
  if (!user) {
    alert("로그인 후 작성 가능합니다.");
    return;
  }

  const slug = slugify(title);
  try {
    await saveBook(slug, {
      title,
      author,
      rating: 0,
      members: 1,
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      writer: user.displayName || user.email || "익명",
      questions: [question],
      imageName: file ? file.name : null,
    });
    if (newPostModal) newPostModal.hide();
    newPostForm.reset();
  } catch (err) {
    alert(err.message || "등록에 실패했습니다.");
  }
});

onUser((user) => {
  window.firebaseUserCache = user;
  if (user && loginOpenBtn) {
    loginOpenBtn.innerHTML = `🚪 <span class="fw-semibold">로그아웃</span>`;
    loginOpenBtn.onclick = () => logout();
  } else if (loginOpenBtn) {
    loginOpenBtn.innerHTML = `🔑 <span class="fw-semibold">로그인</span>`;
    loginOpenBtn.onclick = () => loginModal?.show();
  }
});

function renderCarousel() {
  if (!curatedSlides.length) {
    carouselInner.innerHTML = `<div class="carousel-item active">
      <div class="d-flex flex-column flex-md-row align-items-stretch rounded-4 overflow-hidden shadow-sm bg-dark text-white">
        <div class="col-md-5" style="background:#1f2937"></div>
        <div class="col-md-7 p-4">
          <div class="mb-2 text-warning">Curated Pick</div>
          <h4 class="mb-1">첫 번째 책을 등록해보세요</h4>
          <div class="text-light mb-2">등록된 큐레이션이 없습니다.</div>
        </div>
      </div>
    </div>`;
    return;
  }

  carouselInner.innerHTML = curatedSlides
    .map(
      (slide, idx) => `
      <div class="carousel-item ${idx === 0 ? "active" : ""}">
        <div class="d-flex flex-column flex-md-row align-items-stretch rounded-4 overflow-hidden shadow-sm bg-dark text-white">
          <div class="col-md-5" style="background: center/cover url('${slide.image || ""}')"></div>
          <div class="col-md-7 p-4">
            <div class="mb-2 text-warning">Curated Pick</div>
            <h4 class="mb-1">${slide.title}</h4>
            <div class="text-light mb-2">${slide.author} · ${slide.publisher || ""}</div>
            <div class="mb-3 small text-secondary">${slide.tagline || `큐레이터 ${slide.curator || ""}`}</div>
            <div class="rating-badge d-inline-block">★ ${slide.rating?.toFixed ? slide.rating.toFixed(1) : slide.rating || "-"}</div>
          </div>
        </div>
      </div>`
    )
    .join("");
}

function renderBoard() {
  boardBody.innerHTML = "";
  const pageSize = parseInt(pageSizeSelect.value, 10);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  pageItems.forEach((item) => {
    boardBody.insertAdjacentHTML(
      "beforeend",
      `<tr data-slug="${item.slug || slugify(item.title)}" class="clickable-row">
        <td><span class="rating-badge">★ ${item.rating?.toFixed ? item.rating.toFixed(1) : item.rating || "-"}</span></td>
        <td class="fw-semibold">${item.title}</td>
        <td>${item.author}</td>
        <td>${item.writer || "-"}</td>
        <td class="text-muted">${formatDate(item.createdAt)}</td>
        <td>${item.membersCount || 0}명</td>
      </tr>`
    );
  });
  document.querySelectorAll(".clickable-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const slug = tr.getAttribute("data-slug");
      if (slug) location.href = `chat.html?book=${slug}`;
    });
  });
}

function renderPagination() {
  pagination.innerHTML = "";
  const pageSize = parseInt(pageSizeSelect.value, 10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const createPageItem = (label, page, disabled = false, active = false) => {
    const li = document.createElement("li");
    li.className = `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}`;
    const a = document.createElement("a");
    a.className = "page-link";
    a.href = "#";
    a.textContent = label;
    a.onclick = (e) => {
      e.preventDefault();
      if (!disabled) goToPage(page);
    };
    li.appendChild(a);
    pagination.appendChild(li);
  };

  createPageItem("«", currentPage - 1, currentPage === 1);
  for (let p = 1; p <= totalPages; p += 1) {
    createPageItem(String(p), p, false, p === currentPage);
  }
  createPageItem("»", currentPage + 1, currentPage === totalPages);
}

function goToPage(page) {
  const pageSize = parseInt(pageSizeSelect.value, 10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(Math.max(1, page), totalPages);
  renderBoard();
  renderPagination();
}

function applySort() {
  const key = sortSelect.value;
  filtered.sort((a, b) => {
    if (key === "rating") return (b.rating || 0) - (a.rating || 0);
    if (key === "members") return (b.members || 0) - (a.members || 0);
    return (
      new Date(b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt || 0) -
      new Date(a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt || 0)
    );
  });
}

function slugify(text) {
  return (
    text
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "") || "book"
  );
}

function formatDate(val) {
  if (!val) return "-";
  if (val.toDate) return val.toDate().toLocaleDateString();
  if (val.seconds) return new Date(val.seconds * 1000).toLocaleDateString();
  return new Date(val).toLocaleDateString();
}

function loadCurated() {
  const q = query(collection(db, "curated"), orderBy("priority", "asc"));
  onSnapshot(q, async (snap) => {
    const arr = [];
    for (const docSnap of snap.docs) {
      const { bookId, tagline, image, priority } = docSnap.data();
      if (!bookId) continue;
      const bookDoc = await getDoc(doc(db, "books", bookId));
      if (!bookDoc.exists()) continue;
      arr.push({
        slug: bookId,
        ...bookDoc.data(),
        tagline,
        image,
        priority,
      });
    }
    curatedSlides = arr;
    renderCarousel();
  });
}

function loadBooks() {
  const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    boardData = snap.docs.map((d) => ({ slug: d.id, ...d.data() }));
    filtered = [...boardData];
    applySort();
    goToPage(1);
  });
}

async function saveBook(slug, data) {
  const ref = doc(db, "books", slug);
  const exists = await getDoc(ref);
  if (exists.exists()) {
    alert("이미 존재하는 책입니다. 해당 채팅방으로 이동합니다.");
    location.href = `chat.html?book=${slug}`;
    return;
  }
  await setDoc(ref, data);
}
