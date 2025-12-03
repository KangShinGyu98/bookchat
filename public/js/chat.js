import { auth, db, onUser } from "./app.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { toastShow } from "./myToast.js";

const params = new URLSearchParams(location.search);
const slug = params.get("book");
if (!slug) {
  alert("정상적인 접근이 아닙니다.");
  location.href = "index.html";
}
const bookTitleEl = document.getElementById("bookTitle");
const bookMetaEl = document.getElementById("bookMeta");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("msgForm");
const input = document.getElementById("msgInput");
const unSubscribeBtn = document.getElementById("unSubscribeBtn");
const userArea = document.getElementById("userArea");
const loginBtn = document.getElementById("loginBtn");
const msgInput = document.getElementById("msgInput");

msgInput.addEventListener("input", () => {
  msgInput.style.height = "auto"; // 높이 초기화
  msgInput.style.height = msgInput.scrollHeight + "px"; // 내용에 맞춰 증가
});

let unsubscribeMsgs = null;

async function loadBook() {
  const snap = await getDoc(doc(db, "books", slug));
  if (!snap.exists()) {
    alert("존재하지 않는 책입니다.");
    location.href = "index.html";
    return;
  }
  const data = snap.data();
  bookTitleEl.textContent = data.title;
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000) : null;
  bookMetaEl.textContent = `${data.author || "-"} · 평점 ${data.rating ?? "-"} · 작성일 ${createdAt ? createdAt.toLocaleDateString() : "-"}`;
}
function renderMessages(snapshot) {
  messagesEl.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const m = docSnap.data();
    const isMe = auth.currentUser && m.senderUid === auth.currentUser.uid;
    const div = document.createElement("div");
    div.className = `d-flex mb-2 ${isMe ? "justify-content-end" : "justify-content-start"}`;
    div.innerHTML = `
      <div class="msg ${isMe ? "msg-me" : "msg-other"}">
        <div class="small text-muted mb-1">${m.senderName || "익명"}</div>
        <div>${m.text || ""}</div>
      </div>`;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  const q = query(collection(db, "books", slug, "messages"), orderBy("createdAt"));
  console.log("Subscribing to messages with query:", q);
  unsubscribeMsgs = onSnapshot(q, (snap) => renderMessages(snap));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const isUser = auth.currentUser && !auth.currentUser.isAnonymous;
  if (!isUser) {
    alert("로그인 후 작성 가능합니다.");
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  const user = auth.currentUser;
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.exists() ? userDoc.data() : null;
  const nickname = userData?.nickname || user.displayName || user.email || "사용자";

  await addDoc(collection(db, "books", slug, "messages"), {
    text: text,
    senderUid: user.uid,
    senderName: nickname,
    createdAt: serverTimestamp(),
  });
  input.value = "";
  msgInput.style.height = "auto";
  msgInput.style.height = msgInput.scrollHeight + "px";
});

unSubscribeBtn.addEventListener("click", async () => {
  const user = auth.currentUser && !auth.currentUser.isAnonymous;
  if (!user) {
    alert("로그인 필요");
    return;
  }
  await deleteDoc(doc(db, "books", slug, "members", user.uid));
  location.href = "index.html";
});

onUser((user) => {
  if (user) {
    // --todo 구독 or 구독 아닌지에 따라서 설정
  } else {
  }
});

loadBook();
subscribeMessages();

// ===== 질문 캐루셀 =====
let questions = [];
let currentQuestionIndex = 0;

async function loadQuestions() {
  try {
    const snap = await getDocs(collection(db, "books", slug, "questions"));
    questions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (questions.length > 0) {
      currentQuestionIndex = 0;
      renderQuestionCard();
    } else {
      document.getElementById("questions").innerHTML = "";
    }
  } catch (error) {
    console.error("질문 로드 실패:", error);
  }
}

function renderQuestionCard() {
  const container = document.getElementById("questions");
  if (questions.length === 0) {
    container.innerHTML = "";
    return;
  }

  const current = questions[currentQuestionIndex];
  const createdAt = current.createdAt?.toDate
    ? current.createdAt.toDate()
    : current.createdAt?.seconds
    ? new Date(current.createdAt.seconds * 1000)
    : null;

  // 드롭다운 옵션 생성
  const dropdownOptions = questions
    .map((q, idx) => `<option value="${idx}" ${idx === currentQuestionIndex ? "selected" : ""}>${q.question || "제목 없음"}</option>`)
    .join("");

  container.innerHTML = `
    <div class="question-card">
      <div class="d-flex align-items-center justify-content-between gap-2">
        <!-- 이전 버튼 -->
        <button class="btn btn-sm btn-outline-secondary" id="prevQuestionBtn" ${questions.length <= 1 ? "disabled" : ""}>
          <i class="bi bi-chevron-left"></i>
        </button>

        <!-- 질문 내용 + 드롭다운 -->
        <div class="flex-grow-1 d-flex flex-column gap-2">
          <div class="question-content p-3 rounded bg-light border">
            <div class="question-text">${current.question || "질문이 없습니다"}</div>
            ${createdAt ? `<div class="text-muted text-2xs mt-2">작성일: ${createdAt.toLocaleDateString()}</div>` : ""}
            ${current.createdBy ? `<div class="text-muted text-2xs">작성자: ${current.createdBy}</div>` : ""}
          </div>
          <!-- 질문 선택 드롭다운 -->
          <select class="form-select form-select-sm" id="questionSelect">
            ${dropdownOptions}
          </select>
          <div class="text-muted text-2xs text-center">${currentQuestionIndex + 1} / ${questions.length}</div>
        </div>

        <!-- 다음 버튼 -->
        <button class="btn btn-sm btn-outline-secondary" id="nextQuestionBtn" ${questions.length <= 1 ? "disabled" : ""}>
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  `;

  // 이벤트 리스너 추가
  document.getElementById("prevQuestionBtn").addEventListener("click", () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      renderQuestionCard();
    }
  });

  document.getElementById("nextQuestionBtn").addEventListener("click", () => {
    if (currentQuestionIndex < questions.length - 1) {
      currentQuestionIndex++;
      renderQuestionCard();
    }
  });

  document.getElementById("questionSelect").addEventListener("change", (e) => {
    currentQuestionIndex = parseInt(e.target.value);
    renderQuestionCard();
  });
}

// loadQuestions();
