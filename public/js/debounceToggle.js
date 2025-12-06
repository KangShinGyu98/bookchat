// debounceToggle.js
export function attachDebouncedToggle({ element, initialState, getNextState, render, commit, delay = 500 }) {
  let state = initialState;
  let timeoutId = null;

  element.addEventListener("click", () => {
    // 1) 상태 변경
    state = getNextState(state);

    // 2) UI 렌더링 (옵티미스틱)
    render(element, state);

    // 3) 기존 타이머 취소
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 4) 마지막 상태만 서버에 반영
    timeoutId = setTimeout(async () => {
      timeoutId = null;
      try {
        await commit(state);
      } catch (err) {
        // 필요하면 여기서 롤백도 가능 (예: render(element, prevState))
      }
    }, delay);
  });
}
