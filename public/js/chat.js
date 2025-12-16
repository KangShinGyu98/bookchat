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
  where,
  writeBatch,
  increment,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { toastShow, toastWarning } from "./myToast.js";
import { attachDebouncedToggle } from "./debounceToggle.js";
import { showLoginModal } from "./login.js";

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

function setModalLoading(isLoading) {
  overlay?.classList.toggle("d-none", !isLoading);
  modalContent?.classList.toggle("is-loading", isLoading);
}
let newQuestionModal;
if (newQuestionModalEl && window.bootstrap) newQuestionModal = new window.bootstrap.Modal(newQuestionModalEl);
const syncRating = () => {
  if (!ratingInput || !ratingValueDisplay) return;
  ratingValueDisplay.textContent = ratingInput.value;
};
async function syncRatingChange() {
  if (!ratingInput) return;
  if (!auth.currentUser || auth.currentUser.isAnonymous) return toastShow("로그인이 필요합니다.");
  const user = auth.currentUser;
  // 프로필에서 닉네임 다시 읽기

  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const nickname = profile.nickname || "익명";
  if (!profile.nickname) return toastShow("별명 설정이 필요합니다.");
  const ratingValue = Number(ratingInput.value.trim());
  console.log("ratingValue:", ratingValue);

  if (!Number.isFinite(ratingValue)) {
    // 잘못된 입력 처리
    return toastShow("올바른 평점을 입력해주세요.");
  }

  const payload = {
    bookId: slug,
    rating: ratingValue,
    createdBy: nickname,
    createdByUid: user.uid,
  };
  if (ratingValue) return toastShow("슬라이더를 클릭해주세요.");

  const token = await user.getIdToken();
  const res = await fetch("/createOrUpdateRating", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return toastShow("평점 등록에 실패했습니다.");
  toastShow(`평점 ${ratingInput.value}점이 저장되었습니다.`);
}
ratingInput?.addEventListener("input", syncRating); // 드래그 중
ratingInput?.addEventListener("pointerup", syncRatingChange); // 드래그 완료

syncRating(); // 초기값 표시

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
  bookMetaEl.textContent = `${data.author || "-"} · 평점 ${data.ratingAvg ?? "-"} · 작성일 ${createdAt ? createdAt.toLocaleDateString() : "-"}`;
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

  const autoSubscribe = userData?.autoSubscribe ?? false;
  const subscribedBooks = userData?.subscribedBooks || [];
  autoSubscribeToggle.checked = autoSubscribe;

  // books/{slug}/members 에 uid 가 있는지 확인
  const membersRef = doc(db, "books", slug, "members", user.uid);
  const snap = await getDoc(membersRef);
  const newMember = !snap.exists();
  if (!snap.exists()) {
    // 문서가 없으면(book 내 userId 가 없으면) 새로 생성
    await setDoc(membersRef, {
      joinedAt: serverTimestamp(),
      lastAccessAt: serverTimestamp(),
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
    await updateDoc(membersRef, {
      lastAccessAt: serverTimestamp(),
      // 기존에 값이 있으면 autoSubscribe 가 true 더라도 유지
    });
    // 구독 상태 설정
    subscribeState = snap.data().subscribe === true ? "subscribed" : "unsubscribed";
  }
  // 만약 subscribeState 가 subscribed 면 users subscribedBooks 에 book slug 가 있는지 확인, 없으면 추가
  if (subscribeState === "subscribed" && !subscribedBooks.includes(slug)) {
    subscribedBooks.push(slug);
    await updateDoc(doc(db, "users", user.uid), {
      subscribedBooks: arrayUnion(slug),
    });
    const bookRef = doc(db, "books", slug);
    console.log("새 구독자 추가, +1 증가");
    await updateDoc(bookRef, {
      subscribedMembers: increment(1),
      ...(newMember && { membersCount: increment(1) }),
    });
  }

  renderSubscribeToggle(subscribeBtn, subscribeState);

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
            "${q.question || ""}"
          </div>
        </div>
      `;
      carouselInner.appendChild(questionDiv);
    });
  }
  return;
}

// loadQuestions();

async function subscribeToggleCall(state, slug) {
  console.log("구독 토글 호출:", state, slug);
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
  const bookRef = doc(db, "books", slug);

  if (state === "unsubscribed") {
    // subscribedBooks 에서 현재 책 slug 제거
    await updateDoc(userDocRef, {
      subscribedBooks: arrayRemove(slug),
    });
    await setDoc(bookMemberRef, { subscribe: false }, { merge: true });
    console.log("구독자 감소, -1 감소");
    try {
      await updateDoc(bookRef, {
        subscribedMembers: increment(-1),
      });
      toastShow("구독이 취소되었습니다.");
    } catch (error) {
      console.error("구독자 수 감소 실패:", error);
    }
  } else if (state === "subscribed") {
    // subscribedBooks 에서 현재 책 slug 추가
    if (subscribedBooks.includes(slug)) {
      // 이미 구독 중인 경우 아무 작업도 수행하지 않음
      toastShow("이미 구독 중입니다.");
    } else {
      subscribedBooks.push(slug);

      await setDoc(bookMemberRef, { subscribe: true }, { merge: true });
      await updateDoc(userDocRef, { subscribedBooks: arrayUnion(slug) });
      console.log("새 구독자 추가, +1 증가");
      try {
        await updateDoc(bookRef, {
          subscribedMembers: increment(1),
        });
      } catch (error) {
        console.error("구독자 수 증가 실패:", error);
      }
      toastShow("구독이 설정되었습니다.");
    }
  }
  // UI 업데이트
  renderSubscribeToggle(subscribeBtn, state);
}

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
    question: newQuestionInput.value.trim(),
    createdBy: nickname,
    createdAt: serverTimestamp(),
    createdByUid: user.uid,
  };
  if (!payload.question) return toastShow("질문 내용을 입력하세요.");
  if (questionsCollection.length >= 3) return toastShow("질문은 최대 3개까지 등록할 수 있습니다.");

  const token = await user.getIdToken();
  setModalLoading(true);
  const res = await fetch("/createQuestion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return toastShow("등록에 실패했습니다.");
  toastShow("등록 완료!");
  newQuestionForm.reset();
  newQuestionModal?.hide();
  setModalLoading(false);
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

loadBook();
subscribeMessages();
onUser(() => initializeSubscription());
onUser(() => loadQuestions());
onUser(() => readNotifications(slug));
