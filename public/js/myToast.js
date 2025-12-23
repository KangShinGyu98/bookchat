// myToast.js
let containerEl = null;

function ensureContainer() {
  if (containerEl) return containerEl;

  containerEl = document.createElement("div");
  containerEl.className = "toast-container position-fixed top-0 start-50 translate-middle-x p-3 d-flex flex-column align-items-center";

  containerEl.style.zIndex = "1100";
  containerEl.style.gap = "0.25rem"; // ← 토스트 간 간격 (원하면 0도 가능)

  document.body.appendChild(containerEl);
  return containerEl;
}
function buildToast({ msg, headerClass, bodyClass, delay }) {
  const toastEl = document.createElement("div");
  toastEl.className = "toast mb-0";
  toastEl.setAttribute("role", "alert");
  toastEl.setAttribute("aria-live", "assertive");
  toastEl.setAttribute("aria-atomic", "true");

  const header = document.createElement("div");
  header.className = `toast-header ${headerClass || ""}`.trim();

  const strong = document.createElement("strong");
  strong.className = "me-auto";
  strong.textContent = "알림";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-close";
  closeBtn.setAttribute("data-bs-dismiss", "toast");
  closeBtn.setAttribute("aria-label", "Close");

  header.appendChild(strong);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = `toast-body ${bodyClass || ""}`.trim();
  body.textContent = msg ?? "";

  toastEl.appendChild(header);
  toastEl.appendChild(body);

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
    autohide: true,
    delay: delay ?? 2500,
  });

  // 사라지면 DOM에서 제거(쌓였던 것도 정리)
  toastEl.addEventListener("hidden.bs.toast", () => {
    toast.dispose();
    toastEl.remove();
  });

  return { toastEl, toast };
}

export function toastShow(msg, delay = 2500) {
  const container = ensureContainer();
  const { toastEl, toast } = buildToast({
    msg,
    headerClass: "bg-info",
    bodyClass: "bg-secondary",
    delay,
  });

  container.appendChild(toastEl);
  toast.show();
}

export function toastWarning(msg, delay = 2500) {
  const container = ensureContainer();
  const { toastEl, toast } = buildToast({
    msg,
    headerClass: "bg-secondary-gray",
    bodyClass: "bg-gray",
    delay,
  });

  container.appendChild(toastEl);
  toast.show();
}
