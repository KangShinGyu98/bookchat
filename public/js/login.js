import { loginWithGoogle, onUser, logout, db, auth } from "./app.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { toastShow, toastWarning } from "./myToast.js";

document.addEventListener("DOMContentLoaded", async () => {
  const loginModalMarkup = `
    <!-- 로그인 모달 -->
    <div class="modal fade" id="loginModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
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
        <div class="modal-content">
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

  let loginModal;
  if (loginModalEl && window.bootstrap) loginModal = new window.bootstrap.Modal(loginModalEl);
  let nicknameModal;
  if (nicknameModalEl && window.bootstrap) nicknameModal = new window.bootstrap.Modal(nicknameModalEl);
  nicknameBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    const nicknameInput = document.getElementById("nickname");
    const nickname = nicknameInput?.value?.trim();
    const user = auth.user;
    if (!user) {
      toastShow("로그인이 필요합니다.");
      return;
    }
    if (!nickname) {
      toastShow("별명을 입력해주세요.");
      return;
    }
    const profileRef = doc(db, "users", user.uid);
    setDoc(profileRef, { nickname }, { merge: true })
      .then(() => {
        nicknameModal?.hide();
        toastShow("성공적으로 별명이 설정되었습니다.");
      })
      .catch((err) => {
        alert("별명 설정에 실패했습니다: " + (err.message || err));
      });
  });
  loginOpenBtn?.addEventListener("click", async () => {
    const user = auth.user;
    if (user) {
      await logout();
      toastShow("성공적으로 로그아웃 되었습니다.");
    } else {
      loginModal?.show();
    }
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

  onUser((user) => {
    if (loginOpenBtn) {
      loginOpenBtn.innerHTML = user ? `<i class="bi bi-box-arrow-right"></i> 로그아웃` : `<i class="bi bi-box-arrow-in-right"></i> 로그인`;
    }
  });

  onUser(async (user) => {
    if (!user) return;
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
  });
});
