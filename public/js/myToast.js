document.addEventListener("DOMContentLoaded", async () => {
  const toastTemtoastMarkup = `
  <div class="position-fixed top-0 start-50 translate-middle-x p-3" style="z-index: 1100">
      <div id="toast" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="2000" data-bs-autohide="true">
        <div class="toast-header bg-info">
          <strong class="me-auto">알림</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body bg-secondary">성공적으로 로그아웃 되었습니다.</div>
      </div>
    </div>
  `;
  const toastWarningMarkup = `
  <div class="position-fixed top-0 start-50 translate-middle-x p-3" style="z-index: 1100">
      <div id="toast-warning" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="2000" data-bs-autohide="true">
        <div class="toast-header bg-secondary-gray">
          <strong class="me-auto">알림</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body bg-gray">로그아웃에 실패하였습니다..</div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", toastTemtoastMarkup);
  document.body.insertAdjacentHTML("beforeend", toastWarningMarkup);
});

export const toastShow = (msg) => {
  const toastEl = document.getElementById("toast");
  const toast = new bootstrap.Toast(toastEl);
  toastEl.querySelector(".toast-body").textContent = msg;
  toast.show();
};
export const toastWarning = (msg) => {
  const toastEl = document.getElementById("toast-warning");
  const toast = new bootstrap.Toast(toastEl);
  toastEl.querySelector(".toast-body").textContent = msg;
  toast.show();
};
