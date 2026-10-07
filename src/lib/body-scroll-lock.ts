// Confirm dialogs set overflow:hidden, which drops the classic scrollbar
// and shifts the page by its width. Reserve that gap as padding before
// hiding overflow so the layout stays put. Callers restore via the
// returned unlock (sheets keep their own lock).

export function lockBodyScroll(): () => void {
  const body = document.body;
  const prevOverflow = body.style.overflow;
  const prevPaddingRight = body.style.paddingRight;
  const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  if (gap > 0) {
    const current = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + gap}px`;
  }
  body.style.overflow = "hidden";
  return () => {
    body.style.overflow = prevOverflow;
    body.style.paddingRight = prevPaddingRight;
  };
}
