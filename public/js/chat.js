import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, createOrUpdateRating, createQuestion, db, onUser, subscribeToggleCall, sendMessage } from "./app.js";
import { showLoginModal } from "./login.js";
import { toastShow, toastWarning } from "./myToast.js";

const params = new URLSearchParams(location.search);
const slug = params.get("book");
if (!slug) {
  alert("정상적인 접근이 아닙니다.");
  location.href = "index.html";
}
const textarea = document.getElementById("msgInput");
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
const newQuestionOpenBtn = document.getElementById("newQuestionOpenBtn");
const newQuestionModalEl = document.getElementById("newQuestionModal");
const cancelQuestionBtn = document.getElementById("cancelQuestionBtn");
const ratingInput = document.getElementById("newRating");
const ratingValueDisplay = document.getElementById("ratingValueDisplay");
const carouselInner = document.getElementById("carouselInner");
const overlay = document.getElementById("modalLoadingOverlay");
const modalContent = document.getElementById("newQuestionModalContent");
const newRatingOpenBtn = document.getElementById("newRatingOpenBtn");

function setModalLoading(isLoading) {
  overlay?.classList.toggle("d-none", !isLoading);
  modalContent?.classList.toggle("is-loading", isLoading);
}
let newQuestionModal;
if (newQuestionModalEl && window.bootstrap) newQuestionModal = new window.bootstrap.Modal(newQuestionModalEl);

newRatingOpenBtn?.addEventListener("show.bs.dropdown", (e) => {
  const isUser = auth.currentUser && !auth.currentUser.isAnonymous;

  if (!isUser) {
    e.preventDefault(); // ✅ dropdown 열림 차단
    toastShow("로그인이 필요한 서비스입니다.");
    showLoginModal();
  }
});

const syncRating = () => {
  if (!ratingInput || !ratingValueDisplay) return;
  ratingValueDisplay.textContent = ratingInput.value;
};
async function syncRatingChange() {
  if (!ratingInput) return;
  if (!auth.currentUser || auth.currentUser.isAnonymous) return toastShow("로그인이 필요한 서비스입니다.");
  const user = auth.currentUser;
  // 프로필에서 닉네임 다시 읽기

  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  if (!profile.nickname) return toastShow("별명 설정이 필요합니다.");
  const nickname = profile.nickname;
  const ratingValue = Number(ratingInput.value.trim());

  if (!Number.isFinite(ratingValue) || ratingValue < 0 || ratingValue > 5 || !Number.isInteger(ratingValue * 2)) {
    // 잘못된 입력 처리
    return toastShow("올바른 평점을 입력해주세요.");
  }

  const payload = {
    bookId: slug,
    rating: ratingValue,
  };
  try {
    const res = await createOrUpdateRating(payload);

    if (res?.data?.ok) {
      toastShow(`평점 ${ratingValue}점이 저장되었습니다.`);
      return;
    }
    toastShow("평점 등록에 실패했습니다.");
  } catch (e) {
    switch (e?.code) {
      case "unauthenticated":
      case "permission-denied":
        toastShow("로그인이 필요합니다.");
        break;
      case "failed-precondition":
        toastShow(e?.message ?? "별명 설정이 필요합니다.");
        break;
      case "not-found":
        toastShow(e?.message ?? "책을 찾을 수 없습니다.");
        break;
      case "invalid-argument":
        toastShow(e?.message ?? "올바른 평점을 입력해주세요.");
        break;
      default:
        toastShow("서버 오류가 발생했습니다.");
    }
  }
}
ratingInput?.addEventListener("input", syncRating); // 드래그 중
ratingInput?.addEventListener("pointerup", syncRatingChange); // 드래그 완료

syncRating(); // 초기값 표시

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
  bookMetaEl.textContent = `${data.author || "-"} · 평점 ${data.ratingAvg ?? "-"} · 작성일 ${createdAt ? createdAt.toLocaleDateString() : "-"}`;
}

function renderSubscribeToggle(element, state) {
  // state 는 subscribe || unsubscribe
  if (state === "unsubscribe") {
    element.innerHTML = `<i class="bi bi-bookmark-plus m-1"></i>구독`;
  } else if (state === "subscribe") {
    element.innerHTML = `<i class="bi bi-bookmark-check m-1"></i>구독 중`;
  }
}

let subscribeState = "unsubscribe"; // 초기 상태는 구독 안함
async function subscribeToggleClient(nextUiState, prevState = "unsubscribe") {
  // nextUiState 는 "subscribe" || "unsubscribe"
  const bookId = slug || params.get("book");
  if (!bookId) return;
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    return prevState;
  }

  // UI 상태("subscribe"/"unsubscribe") -> 서버 인자("subscribe"/"unsubscribe")
  const subscribe = nextUiState === "subscribe" ? "subscribe" : "unsubscribe";

  const payload = { bookId, subscribe };

  // ---- try/catch ----
  try {
    const res = await subscribeToggleCall(payload);

    if (res?.data?.ok) {
      return res.data.subscribeState;
    }

    // ok가 아닌데도 에러가 안 났으면(드문 케이스) 실패 처리
    toastShow("구독 처리에 실패했습니다.");
    if (subscribeBtn) renderSubscribeToggle(subscribeBtn, prevState);
  } catch (e) {
    // 실패: UI 롤백
    if (subscribeBtn) renderSubscribeToggle(subscribeBtn, prevState);

    switch (e?.code) {
      case "unauthenticated":
      case "permission-denied":
        toastShow("로그인이 필요합니다.");
        break;
      case "not-found":
        toastShow(e?.message ?? "요청 대상을 찾을 수 없습니다.");
        break;
      case "invalid-argument":
        toastShow(e?.message ?? "요청 값이 올바르지 않습니다.");
        break;
      default:
        toastShow("서버 오류가 발생했습니다.");
    }
  }
}

async function initializeSubscription() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    subscribeBtn.addEventListener("click", () => {
      toastWarning("로그인이 필요한 서비스입니다.");
    });
    autoSubscribeToggle.setAttribute("disabled", true);
    return;
  }
  // 토글 초기 상태 설정

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.exists() ? userDoc.data() : null;
  const subscribedBooks = userData?.subscribedBooks || [];
  const autoSubscribe = userData?.autoSubscribe ?? false;
  autoSubscribeToggle.checked = autoSubscribe;
  const previousSubscribe = subscribedBooks.includes(slug);
  let prevState = previousSubscribe ? "subscribe" : "unsubscribe";
  const bookMembersRef = doc(db, "books", slug, "members", user.uid);
  const bookMembersDoc = await getDoc(bookMembersRef);
  let isVisisted = null;
  if (bookMembersDoc.exists()) {
    //books/{slug}/members 에 user.uid 가 있을 때 isVisisted = true
    if (bookMembersDoc.exists()) {
      isVisisted = true;
    } else {
      isVisisted = false;
    }
  }

  if (isVisisted) {
    subscribeState = previousSubscribe ? "subscribe" : "unsubscribe";
    await updateDoc(bookMembersRef, {
      lastAccessAt: serverTimestamp(),
    });
    subscribeState = await subscribeToggleClient(subscribeState, prevState);
  } else {
    if (autoSubscribe) {
      //처음 들어왔으니까 실패시에는 unsub 로 들어가야지
      prevState = "unsubscribe";
      subscribeState = "subscribe";
      console.log("autosubscribe true -> subscribe");
      subscribeState = await subscribeToggleClient(subscribeState, prevState);
    }
  }
  renderSubscribeToggle(subscribeBtn, subscribeState);
}

let timeoutId = null;
subscribeBtn.addEventListener("click", () => {
  const prevState = subscribeState;
  subscribeState = subscribeState === "subscribe" ? "unsubscribe" : "subscribe";
  renderSubscribeToggle(subscribeBtn, subscribeState);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  timeoutId = setTimeout(async () => {
    timeoutId = null;
    subscribeState = await subscribeToggleClient(subscribeState, prevState);
    toastShow(subscribeState === "subscribe" ? "구독되었습니다." : "구독이 취소되었습니다.");
    renderSubscribeToggle(subscribeBtn, subscribeState);
  }, 500);
});

// 버튼에 이벤트 추가 : 구독 버튼 누르면 users subscribedBooks 에 book slug 추가 구독버튼 d-none 구독취소 버튼 보이기, 구독 취소 버튼 누르면 반대

function renderMessages(docSnap) {
  // messagesEl.innerHTML = "";

  const m = docSnap.data();
  const isMe = auth.currentUser && m.senderUid === auth.currentUser.uid;

  const row = document.createElement("div");
  row.className = `d-flex mb-2 ${isMe ? "justify-content-end" : "justify-content-start"}`;

  const bubble = document.createElement("div");
  bubble.className = `msg ${isMe ? "msg-me" : "msg-other"}`;

  const name = document.createElement("div");
  name.className = "small text-muted mb-1";
  name.textContent = m.senderName || "익명";

  const body = document.createElement("div");
  body.className = "w-100";
  body.textContent = m.text || ""; // ✅ 여기서 특수문자 안전 처리 끝

  bubble.appendChild(name);
  bubble.appendChild(body);
  row.appendChild(bubble);
  messagesEl.appendChild(row);

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  const q = query(collection(db, "books", slug, "messages"), orderBy("createdAt"));
  unsubscribeMsgs = onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        // addMessage(change.doc);
        renderMessages(change.doc);
      }
    });
  });
}

textarea.addEventListener("keydown", function (e) {
  // Shift+Enter 는 줄바꿈 허용하고, 그냥 Enter는 submit
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // 기본 줄바꿈 방지
    form.requestSubmit(); // submit 버튼 트리거 (HTML5 권장)
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const isUser = auth.currentUser && !auth.currentUser.isAnonymous;
  if (!isUser) {
    toastWarning("로그인이 필요한 서비스입니다.");
    return;
  }
  let text = input.value;
  if (!text) return;
  if (text.length > 1000) {
    toastWarning("메시지는 최대 1000자까지 입력할 수 있습니다.");
    return;
  }

  const user = auth.currentUser;
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.exists() ? userDoc.data() : null;
  if (!userData.nickname) return toastShow("별명 설정이 필요합니다.");
  const nickname = userData?.nickname;

  const payload = {
    bookId: slug,
    text: text,
  };
  try {
    // callable로 메시지 전송
    const res = await sendMessage(payload);

    if (res?.data?.ok) {
      input.value = "";
    }
  } catch (err) {
    console.error("메시지 전송 실패:", err);

    switch (err?.code) {
      case "unauthenticated":
      case "permission-denied":
        toastShow("로그인이 필요합니다.");
        break;
      case "invalid-argument":
        toastShow(err?.message ?? "메시지 입력값이 올바르지 않습니다.");
        break;
      case "resource-exhausted":
        toastShow("메시지를 너무 빠르게 보냈습니다. 잠시 후 다시 시도하세요.");
        break;
      default:
        toastShow("서버 오류가 발생했습니다.");
    }
  }

  msgInput.style.height = "auto";
  msgInput.style.height = msgInput.scrollHeight + "px";
});

// ===== 질문 캐루셀 =====
async function loadQuestions() {
  try {
    const snap = await getDocs(collection(db, "books", slug, "questions"));
    renderQuestionCard(snap);
  } catch (error) {
    console.error("질문 로드 실패:", error);
  }
}

function renderQuestionCard(snap) {
  if (snap.empty) {
    const noQuestionDiv = document.createElement("div");
    noQuestionDiv.className = "carousel-item active";
    noQuestionDiv.innerHTML = `
      <div class="question-item">
        <div class="question-text">
          등록된 질문이 없습니다. 새로운 질문을 등록해보세요!
        </div>
      </div>
    `;
    carouselInner.appendChild(noQuestionDiv);
  } else {
    snap.docs.forEach((docSnap, index) => {
      const q = docSnap.data();
      const isActive = index === 0 ? "active" : "";
      const questionDiv = document.createElement("div");
      questionDiv.className = `carousel-item ${isActive}`;
      questionDiv.innerHTML = `
        <div class="question-item">
          <div class="question-text">
            "${q.text || ""}"
          </div>
        </div>
      `;
      carouselInner.appendChild(questionDiv);
    });
  }
  return;
}

// loadQuestions();

async function readNotifications(bookId) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  const notiRef = collection(db, "users", user.uid, "notifications");
  const q = query(notiRef, where("bookId", "==", bookId), where("read", "==", false));
  const notiSnap = await getDocs(q);
  const batch = writeBatch(db);

  notiSnap.forEach((docSnap) => {
    batch.update(docSnap.ref, { read: true });
    // doc(notiRef, docSnap.id) 도 되지만, docSnap.ref 가 더 간단
  });

  await batch.commit();
}

newQuestionOpenBtn?.addEventListener("click", () => {
  const isUser = auth.currentUser && !auth.currentUser.isAnonymous;
  if (isUser) {
    renderNewQuestionModal(slug);
    newQuestionModal?.show();
  } else {
    toastShow("로그인이 필요합니다.");
    showLoginModal();
  }
});
const newQuestionForm = document.getElementById("newQuestionForm");
const newQuestionInput = document.getElementById("newQuestion");
let questionsCollection = [];
// 질문 등록 폼 제출 처리
newQuestionForm?.addEventListener("submit", async (e) => {
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
    bookId: slug,
    text: newQuestionInput.value.trim(),
  };
  if (!payload.text) return toastShow("질문 내용을 입력하세요.");
  if (payload.text.length > 300) return toastShow("질문은 최대 300자까지 입력할 수 있습니다.");
  if (questionsCollection.length >= 3) return toastShow("질문은 최대 3개까지 등록할 수 있습니다.");

  const token = await user.getIdToken();
  setModalLoading(true);
  try {
    await createQuestion(payload);
    toastShow("질문이 등록되었습니다.");
  } catch (e) {
    switch (e.code) {
      case "unauthenticated":
        toastShow("로그인이 필요합니다.");
        break;
      case "permission-denied":
        toastShow("익명 사용자는 질문을 등록할 수 없습니다.");
        break;
      case "invalid-argument":
        toastShow(e.message ?? "입력값이 올바르지 않습니다.");
        break;
      case "failed-precondition":
        toastShow(e.message ?? "질문은 최대 3개까지만 가능합니다.");
        break;
      case "already-exists":
        toastShow(e.message ?? "이미 같은 질문이 있습니다.");
        break;
      default:
        toastShow("서버 오류가 발생했습니다.");
    }
  } finally {
    setModalLoading(false);
  }

  toastShow("등록 완료!");
  newQuestionForm.reset();
  newQuestionModal?.hide();
  // 미리보기 초기화가 필요하면 여기서 추가
});
const questionSpinnerContainer = document.getElementById("question-spinner-container");
const questionsContainer = document.getElementById("questions-container");
async function renderNewQuestionModal(bookId) {
  // /books/{bookId}/questions 에서 questions 받아와서 렌더링 및 클릭 이벤트 처리
  questionsCollection = [];
  questionsContainer.innerHTML = "";
  if (questionSpinnerContainer) questionSpinnerContainer.classList.remove("d-none");

  const questionsColRef = collection(db, "books", bookId, "questions");
  const q = query(
    questionsColRef,
    orderBy("createdAt", "asc") // 오래된 순
  );
  const questionsSnap = await getDocs(q);

  questionsSnap.docs.forEach((doc) => {
    questionsCollection.push({
      id: doc.id,
      ...doc.data(),
    });
  });

  questionsCollection.forEach((question) => {
    const questionDiv = document.createElement("div");
    questionDiv.className = "bg-primary rounded d-flex justify-content-between align-items-center p-2 mb-2";
    questionDiv.innerHTML = `
      <p class="p-0 m-0">${question.question || ""}</p>
      <button type="button" class="btn-close text-sm" data-question-id="${question.id}"></button>
    `;
    questionsContainer.appendChild(questionDiv);
    // 삭제 버튼 이벤트 리스너 추가
    const deleteBtn = questionDiv.querySelector(".btn-close");
    deleteBtn.addEventListener("click", async () => {
      const questionId = deleteBtn.getAttribute("data-question-id");
      if (questionId) {
        // 질문 삭제
        // 해당하는 div 및 questionsCollection 에서도 제거
        questionsContainer.removeChild(questionDiv);
        questionsCollection = questionsCollection.filter((q) => q.id !== questionId);

        await deleteDoc(doc(db, "books", bookId, "questions", questionId));
        toastShow("질문이 삭제되었습니다.");
        renderNewQuestionModal(bookId); // 모달 다시 렌더링
      }
    });
  });
  if (questionSpinnerContainer) questionSpinnerContainer.classList.add("d-none");
}

cancelQuestionBtn?.addEventListener("click", () => {
  newQuestionForm?.reset(); // 입력 초기화
  newQuestionModal?.hide(); // 모달 닫기 (이미 만들어둔 newQuestionModal 인스턴스 사용)
});

let autoSubscribeTimeoutId = null;

autoSubscribeToggle?.addEventListener("change", () => {
  if (autoSubscribeTimeoutId) {
    clearTimeout(autoSubscribeTimeoutId);
  }

  const user = auth.currentUser;
  const prevChecked = !autoSubscribeToggle.checked; // 이전 상태 저장

  if (!user || user.isAnonymous) {
    toastWarning("로그인이 필요한 서비스입니다.");
    autoSubscribeToggle.checked = prevChecked;
    return;
  }

  const autoSubscribe = autoSubscribeToggle.checked;

  autoSubscribeTimeoutId = setTimeout(async () => {
    try {
      await updateDoc(doc(db, "users", user.uid), {
        autoSubscribe,
      });
      toastShow(`자동 구독 설정이 ${autoSubscribe ? "활성화" : "비활성화"}되었습니다.`);
    } catch (e) {
      console.error(e);
      toastShow("자동 구독 설정 변경에 실패했습니다.");
      autoSubscribeToggle.checked = prevChecked;
    }
  }, 500);
});

loadBook();
subscribeMessages();
onUser(() => initializeSubscription());
onUser(() => loadQuestions());
onUser(() => readNotifications(slug));
