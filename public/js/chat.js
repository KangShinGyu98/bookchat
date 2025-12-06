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
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { toastShow, toastWarning } from "./myToast.js";
import { attachDebouncedToggle } from "./debounceToggle.js";

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
const userArea = document.getElementById("userArea");
const loginBtn = document.getElementById("loginBtn");
const msgInput = document.getElementById("msgInput");
const autoSubscribeToggle = document.getElementById("autoSubscribeChecked");
const subscribeBtn = document.getElementById("subscribeBtn");

let subscribeState = "unsubscribed"; // 초기 상태는 구독 안함
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

function renderSubscribeToggle(element, state) {
  // state 는 subscribe || unsubscribe
  if (state === "unsubscribed") {
    element.innerHTML = `<i class="bi bi-bookmark-plus m-1"></i>구독`;
  } else if (state === "subscribed") {
    element.innerHTML = `<i class="bi bi-bookmark-check m-1"></i>구독 중`;
  }
}

async function initializeSubscription() {
  //할일 :
  // 1. firestore 에서 users 가져와서 autoSubscribe 설정 따라서 autosubscribe 토글 html 랜더링
  // 1.5. 무조건 books/{slug}/members 에 uid 추가
  // 3. users subscribedBooks 안에 book slug 가 있으면 구독 취소 버튼 보이기, 없으면 구독 버튼 보이기
  //    3-2. book slug 가 없을 때 autoSubscribe 가 true 면 구독 설정(users subscribedBooks 에 book slug 추가)
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    subscribeBtn.addEventListener("click", () => {
      toastWarning("로그인이 필요한 서비스입니다.");
    });
    autoSubscribeToggle.setAttribute("disabled", true);
    return;
  }
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.exists() ? userDoc.data() : null;

  const autoSubscribe = userData?.autoSubscribe ?? false;
  const subscribedBooks = userData?.subscribedBooks || [];
  // books/{slug}/members 에 uid 가 있는지 확인
  const ref = doc(db, "books", slug, "members", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // 문서가 없으면(book 내 userId 가 없으면) 새로 생성
    await setDoc(ref, {
      joinedAt: serverTimestamp(),
      lastAccessAt: serverTimestamp(),
      memberUid: user.uid,
      subscribe: autoSubscribe === true, // autoSubscribe면 true, 아니면 false
    });

    if (autoSubscribe) {
      subscribeState = "subscribed";
      // --todo : users subscribedBooks 에 book slug 추가
    } else {
      subscribeState = "unsubscribed";
    }
  } else {
    //문서가 있을 때
    // 문서가 있을 때 기존 값 유지하면서 필요한 값만 업데이트
    await updateDoc(ref, {
      lastAccessAt: serverTimestamp(),
      // 기존에 값이 있으면 autoSubscribe 가 true 더라도 유지
    });
    // 구독 상태 설정
    subscribeState = snap.data().subscribe === true ? "subscribed" : "unsubscribed";
  }
  console.log("Initial subscribeState:", subscribeState);
  renderSubscribeToggle(subscribeBtn, subscribeState);

  // 토글 초기 상태 설정
  autoSubscribeToggle.checked = autoSubscribe;

  //users subscribedBooks 안에 book slug 가 있으면 구독 취소 버튼 보이기, 없으면 구독 버튼 보이기

  attachDebouncedToggle({
    element: subscribeBtn,
    initialState: subscribeState,
    getNextState: (state) => (state === "subscribed" ? "unsubscribed" : "subscribed"),
    render: (_element, state) => {
      subscribeState = state; // 외부 변수도 같이 업데이트 (필요 시)
      renderSubscribeToggle(subscribeBtn, state);
    },
    commit: async (state) => {
      await subscribeToggleCall(state, slug);
    },
    delay: 500,
  });
}
// 버튼에 이벤트 추가 : 구독 버튼 누르면 users subscribedBooks 에 book slug 추가 구독버튼 d-none 구독취소 버튼 보이기, 구독 취소 버튼 누르면 반대








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
  unsubscribeMsgs = onSnapshot(q, (snap) => renderMessages(snap));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const isUser = auth.currentUser && !auth.currentUser.isAnonymous;
  if (!isUser) {
    toastWarning("로그인이 필요한 서비스입니다.");
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

async function subscribeToggleCall(state, slug) {
  "subscribeToggleCall called with state:", state, "slug:", slug;
  const user = auth.currentUser;
  if (!user) {
    toastShow("로그인 후 이용해주세요.");
    return;
  }
  const userDocRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userDocRef);
  const userData = userDoc.exists() ? userDoc.data() : null;
  const subscribedBooks = userData?.subscribedBooks || [];
  const bookMemberRef = doc(db, "books", slug, "members", user.uid);
  // books/{slug}/members 에도 subscribe 필드 업데이트
  "subscribeToggleCall state:", state;

  if (state === "unsubscribed") {
    // subscribedBooks 에서 현재 책 slug 제거
    await updateDoc(userDocRef, {
      subscribedBooks: arrayRemove(slug),
    });
    await setDoc(bookMemberRef, { subscribe: false }, { merge: true });
    toastShow("구독이 취소되었습니다.");
  } else if (state === "subscribed") {
    // subscribedBooks 에서 현재 책 slug 추가
    if (subscribedBooks.includes(slug)) {
      // 이미 구독 중인 경우 아무 작업도 수행하지 않음
      toastShow("이미 구독 중입니다.");
    } else {
      subscribedBooks.push(slug);

      await setDoc(bookMemberRef, { subscribe: true }, { merge: true });
      await updateDoc(userDocRef, { subscribedBooks: arrayUnion(slug) });

      toastShow("구독이 설정되었습니다.");
    }
  }
  // UI 업데이트
  renderSubscribeToggle(subscribeBtn, state);
}
loadBook();
subscribeMessages();
onUser(() => initializeSubscription());
