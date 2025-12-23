import { signInAnonymously } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, db, loginWithEmailPassword, loginWithGoogle, logout, onUser, setNickname, signupWithEmailPassword } from "./app.js";
import { toastShow, toastWarning } from "./myToast.js";
const defaultCovers = [
  "andrei-castanha-6JAUfus77_E-unsplash.jpg",
  "andrei-castanha-zSbiRO6qBDY-unsplash.jpg",
  "fast-ink-GqY_AU1QOaE-unsplash.jpg",
  "morgan-marinoni-QPow-FC0gwQ-unsplash.jpg",
  "muhammad-afandi-_1_dl3yiLLc-unsplash.jpg",
  "ogie-vJG0I2woCmg-unsplash.jpg",
  "pixeliota-N1Rfk1JaoNM-unsplash.jpg",
  "thingsneverchange-icmAVo67uUY-unsplash.jpg",
];
document.addEventListener("DOMContentLoaded", async () => {
  const loginModalMarkup = `
    <!-- 로그인 모달 -->
    <div class="modal fade" id="loginModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content position-relative" id="googleNewQuestionModalContent">
          <div id="googleModalLoadingOverlay" class="modal-loading-overlay d-none">
            <div class="spinner-border" role="status" aria-label="loading"></div>
          </div>
          <div class="modal-header">
            <h5 class="modal-title">로그인</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <!-- <form id="loginForm" class="d-flex flex-column gap-3">
              <div>
                <label class="form-label">이메일</label>
                <input type="email" class="form-control" id="loginEmail" placeholder="you@example.com" required />
              </div>
              <div>
                <label class="form-label">비밀번호</label>
                <input type="password" class="form-control" id="loginPassword" placeholder="••••••••" required />
              </div>
              <button type="submit" class="btn btn-dark w-100">로그인</button>
            </form> -->
            <div class="d-grid gap-2 mt-3">
              <button class="btn btn-outline-dark" id="googleLoginBtn">Google로 로그인</button>
            </div>
            <!-- <div class="d-flex justify-content-between mt-3">
              <button class="btn p-0" id="signupBtn">회원가입</button>
              <button class="btn p-0" id="forgotBtn">비밀번호 찾기</button>
            </div> -->
          </div>
        </div>
      </div>
    </div>
  `;
  const nicknameModalMarkup = `
  <!-- 닉네임 모달 -->
    <div class="modal fade" id="nicknameModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content position-relative" id="nicknameNewQuestionModalContent">
          <div id="nicknameModalLoadingOverlay" class="modal-loading-overlay d-none">
            <div class="spinner-border" role="status" aria-label="loading"></div>
          </div>
          <div class="modal-header">
            <h5 class="modal-title">사용할 별명을 설정해주세요.</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form id="nicknameForm" class="d-flex flex-column gap-3">
              <div>
                <label class="form-label">별명</label>
                <input type="text" class="form-control" id="nickname" placeholder="심술두꺼비" required />
              </div>
              <button name="nicknameBtn" id="nicknameBtn" type="submit" class="btn btn-dark w-100">설정</button>
            </form>
          </div>
        </div>
      </div>
    </div>
    <!-- <div class="position-fixed top-0 start-50 translate-middle-x p-3" style="z-index: 1100">
      <div id="toast-warning" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="2000" data-bs-autohide="true">
        <div class="toast-header bg-secondary-gray">
          <strong class="me-auto">알림</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body bg-gray">로그아웃에 실패하였습니다..</div>
      </div>
    </div>
    <div class="position-fixed top-0 start-50 translate-middle-x p-3" style="z-index: 1100">
      <div id="toast" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="2000" data-bs-autohide="true">
        <div class="toast-header bg-info">
          <strong class="me-auto">알림</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body bg-secondary">성공적으로 로그아웃 되었습니다.</div>
      </div>
    </div> -->
  `;
  document.body.insertAdjacentHTML("beforeend", loginModalMarkup);
  document.body.insertAdjacentHTML("beforeend", nicknameModalMarkup);
  const loginModalEl = document.getElementById("loginModal") ?? null;
  const nicknameModalEl = document.getElementById("nicknameModal") ?? null;
  const loginOpenBtn = document.getElementById("loginOpenBtn") ?? null;
  const googleLoginBtn = document.getElementById("googleLoginBtn") ?? null;
  const nicknameBtn = document.getElementById("nicknameBtn") ?? null;
  const nicknameContainer = document.getElementById("nickname-badge") ?? null;
  const googleOverlay = document.getElementById("googleModalLoadingOverlay");
  const nicknameOverlay = document.getElementById("nicknameModalLoadingOverlay");
  const googleModalContent = document.getElementById("googleNewQuestionModalContent");
  const nicknameModalContent = document.getElementById("nicknameNewQuestionModalContent");

  function setGoogleModalLoading(isLoading) {
    googleOverlay?.classList.toggle("d-none", !isLoading);
    googleModalContent?.classList.toggle("is-loading", isLoading);
  }
  function setNicknameModalLoading(isLoading) {
    nicknameOverlay?.classList.toggle("d-none", !isLoading);
    nicknameModalContent?.classList.toggle("is-loading", isLoading);
  }
  let loginModal;
  if (loginModalEl && window.bootstrap) loginModal = new window.bootstrap.Modal(loginModalEl);
  let nicknameModal;
  if (nicknameModalEl && window.bootstrap) nicknameModal = new window.bootstrap.Modal(nicknameModalEl);
  //todo 이거 왜 submit 이 아니라 button 에 달려잇는지 spinner 추가
  nicknameBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const nicknameInput = document.getElementById("nickname");
    const nickname = nicknameInput?.value?.trim();
    const user = auth.currentUser;
    const isUser = user && !user.isAnonymous;
    if (!isUser) {
      toastShow("로그인이 필요합니다.");
      return;
    }
    if (!nickname) {
      toastShow("별명을 입력해주세요.");
      return;
    }
    // nicknames 에서 별명 중복확인

    if (nickname.length > 50) {
      toastShow("별명은 최대 50자까지 입력할 수 있습니다.");
      return;
    }
    try {
      const nicknameDocRef = doc(db, "nicknames", nickname.trim().toLowerCase());
      const snap = await getDoc(nicknameDocRef);
      if (snap.exists()) {
        toastShow("이미 사용 중인 별명입니다.");
        return;
      }
      setNicknameModalLoading(true);
      const res = await setNickname({ nickname });
      const savedNickname = res?.data?.nickname || nickname;

      nicknameModal?.hide();
      nicknameContainer.textContent = savedNickname;
      toastShow("성공적으로 별명이 설정되었습니다.");
    } catch (err) {
      // callable 에러는 보통 err.code / err.message 로 옴
      switch (err?.code) {
        case "functions/unauthenticated":
          toastShow("로그인이 필요합니다.");
          break;
        case "functions/permission-denied":
          toastShow("닉네임 설정을 위해서는 로그인이 필요합니다.");
          break;
        case "functions/invalid-argument":
          toastShow(err?.message ?? "입력값이 올바르지 않습니다.");
          break;
        case "functions/already-exists":
          toastShow("이미 사용 중인 별명입니다.");
          break;
        default:
          alert("별명 설정에 실패했습니다: " + (err?.message || err));
      }
    } finally {
      setNicknameModalLoading(false);
    }
  });

  loginOpenBtn?.addEventListener("click", async () => {
    //button disable 했다가 처리 끝나면 다시 enable 하는 식으로 변경 고려
    const isUser = auth.currentUser && !auth.currentUser.isAnonymous;
    if (isUser) {
      await logout()
        .then(() => {
          toastShow("성공적으로 로그아웃 되었습니다.");
          location.reload();
        })
        .catch((err) => {
          toastWarning("로그아웃에 실패하였습니다.");
          console.error("로그아웃 실패:", err);
        });
    } else {
      loginModal?.show();
    }
  });
  googleLoginBtn?.addEventListener("click", async () => {
    try {
      setGoogleModalLoading(true);
      await loginWithGoogle();
      location.reload();
      // if (loginModal) {
      //   loginModal.hide();
      // }
    } catch (err) {
      console.error("Google 로그인 실패:", err);
      alert("Google 로그인에 실패했습니다.");
    } finally {
      setGoogleModalLoading(false);
    }
  });

  function showNicknameModal() {
    if (nicknameModal) nicknameModal.show();
  }

  onUser(async (user) => {
    if (loginOpenBtn) {
      loginOpenBtn.innerHTML =
        user && !user.isAnonymous ? `<i class="bi bi-box-arrow-right"></i> 로그아웃` : `<i class="bi bi-box-arrow-in-right"></i> 로그인`;
      if (!user || user.isAnonymous) nicknameContainer.textContent = "";
    }
    if (!user) {
      signInAnonymously(auth).catch((error) => {
        console.error("Anonymous sign-in error", error);
      });
      return;
    } else if (user.isAnonymous) {
      return;
    }
    try {
      const profileRef = doc(db, "users", user.uid);
      const snap = await getDoc(profileRef);
      if (!snap.exists() || !snap.data().nickname) {
        showNicknameModal();
      } else {
        if (nicknameContainer) {
          const nickname = snap.data().nickname;
          nicknameContainer.textContent = `${nickname}`;
        }
      }
    } catch (err) {
      console.error("프로필 로드 실패:", err);
    }
    initializeNotification();
  });
});
const notificationToggle = document.getElementById("notificationToggle") ?? null;
const notificationContainer = document.getElementById("notification-container") ?? null;
const notificationMenu = document.getElementById("notification-menu") ?? null;
const notificationBadge = document.getElementById("notificationBadge") ?? null;
let loginModal;
export function showLoginModal() {
  // 모달 마크업 삽입, 요소 선택
  const el = document.getElementById("loginModal");
  if (el && window.bootstrap) loginModal = new bootstrap.Modal(el);
  loginModal.show();
}

function getTimeDiff(createdAt) {
  const now = new Date();
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);

  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${diffDays}일 전`;
}
async function onNotificationClicked(noti) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    // 이미 읽음이면 굳이 updateDoc 안 해도 됨
    if (!noti.read) {
      await updateDoc(doc(db, "users", user.uid, "notifications", noti.id), { read: true });
    }

    // 채팅 페이지로 이동
    location.href = `http://127.0.0.1:5005/chat.html?book=${noti.bookId}`;
  } catch (err) {
    console.error("알림 클릭 처리 중 오류:", err);
  }
}
async function renderNotifications(notifications) {
  // 알림 0개면 안내
  if (!notifications?.length) {
    if (!notificationContainer) return;

    notificationContainer.textContent = "";
    const empty = document.createElement("div");
    empty.className = "p-3 text-center text-muted small";
    empty.textContent = "알림이 없습니다.";
    notificationContainer.appendChild(empty);
    return;
  } else {
    if (notificationContainer) notificationContainer.classList.add("d-none"); // 미리보기 숨기기
  }

  // (중복 렌더 방지) 기존 메뉴 비우기
  if (notificationMenu) notificationMenu.textContent = "";

  notifications.forEach((noti) => {
    const timeDiff = getTimeDiff(noti.createdAt);

    const item = document.createElement("button");
    item.type = "button";

    const readClass = noti.read ? "read" : "";
    item.className = `dropdown-item d-flex align-items-center gap-2 ${readClass}`;

    const imageSrc = noti.bookImageUrl || getRandomBookCover();

    // img
    const img = document.createElement("img");
    img.src = imageSrc;
    img.alt = "책 이미지";
    img.className = "notification-book-image me-2";
    img.width = 50;
    img.height = 65;

    // text wrapper
    const textWrap = document.createElement("div");
    textWrap.className = "dropdown-text";

    // title line (bookTitle)
    const titleLine = document.createElement("div");
    titleLine.className = "text-muted text-xs notification-text-online-ellipsis";
    titleLine.textContent = noti.bookTitle || "-";

    // preview line (msgPreview)
    const previewLine = document.createElement("div");
    previewLine.className = "notification-text-ellipsis small";
    previewLine.textContent = noti.msgPreview || "";

    // meta line (timeDiff · senderName)
    const metaLine = document.createElement("span");
    metaLine.className = "text-muted text-xs notification-text-online-ellipsis";
    metaLine.textContent = `${timeDiff} · ${noti.senderName ?? "익명"}`;

    textWrap.append(titleLine, previewLine, metaLine);
    item.append(img, textWrap);

    item.addEventListener("click", () => {
      onNotificationClicked(noti);
    });

    notificationMenu.appendChild(item);
  });
}

function getRandomBookCover() {
  const randomIndex = Math.floor(Math.random() * defaultCovers.length);
  return `/assets/images/default_book_covers/${defaultCovers[randomIndex]}`;
}
async function initializeNotification() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    notificationContainer.innerHTML = `<div class="text-center text-secondary">로그인 후 알림 설정이 가능합니다.</div>`;
    notificationToggle.setAttribute("disabled", true);
    return;
  }
  // 토글 초기 상태 설정

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.exists() ? userDoc.data() : null;

  const notificationSetting = userData?.notificationSetting ?? false;
  notificationToggle.checked = notificationSetting;
  // 1. 유저의 notification 목록 가져오기

  const q = query(
    collection(db, "users", user.uid, "notifications"),
    orderBy("createdAt", "desc") // 오래된 → 최신
  );

  const notificationsSnapshot = await getDocs(q);
  const notifications = notificationsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(), // bookId, msgPreview, createdAt, read
  }));

  if (!notifications.every((noti) => noti.read)) {
    notificationBadge.classList.remove("d-none");
    notificationBadge.innerText = notifications.filter((noti) => !noti.read).length;
  }
  // 2. 각 알림에 대해 bookId로 books/{bookId} 조회해서 imageUrl 붙이기

  renderNotifications(notifications);

  let checked = notificationToggle.checked;
  let timeoutId = null;
  const delay = 300;
  notificationToggle.addEventListener("change", () => {
    // 1) 상태 변경
    checked = notificationToggle.checked;

    // 3) 기존 타이머 취소
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 4) 마지막 상태만 서버에 반영
    timeoutId = setTimeout(async () => {
      timeoutId = null;
      try {
        await updateDoc(doc(db, "users", user.uid), {
          notificationSetting: checked,
        });
      } catch (err) {
        // 필요하면 여기서 롤백도 가능 (예: render(element, prevState))
        notificationToggle.setAttribute("disabled", true);
      }
    }, delay);
  });
}

const testUserLoginBtn = document.getElementById("testUserLoginBtn");

testUserLoginBtn?.addEventListener("click", async () => {
  const email = "testuser@example.com";
  const password = "testpassword";

  try {
    // 1) signup 먼저 시도
    let userCredential;

    try {
      userCredential = await signupWithEmailPassword(email, password);
    } catch (err) {
      // 2) 이미 있으면 login으로 폴백
      if (err?.code === "auth/email-already-in-use") {
        userCredential = await loginWithEmailPassword(email, password);
      } else {
        throw err;
      }
    }

    const user = userCredential.user; // firebase user

    // 3) users 문서 upsert (없으면 생성, 있으면 업데이트)
    const userRef = doc(db, "users", user.uid);

    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email ?? email,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        provider: user.providerData?.[0]?.providerId ?? "password",
        autoSubscribe: true,
        notificationSetting: true,

        // Firestore 권장: Date 대신 서버 타임스탬프
        updatedAt: serverTimestamp(),
        // createdAt은 최초 생성 시에만 넣고 싶으면 아래처럼 merge + 필드전략 쓰면 됨(설명 아래)
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    toastShow("테스트 유저로 로그인 및 자동 회원정보 저장 완료!");
  } catch (e) {
    console.error(e);
    toastShow(`로그인 실패: ${e?.message ?? "알 수 없는 오류"}`);
  }
});

// 버튼에 이벤트 추가 : 구독 버튼 누르면 users subscribedBooks 에 book slug 추가 구독버튼 d-none 구독취소 버튼 보이기, 구독 취소 버튼 누르면 반대
