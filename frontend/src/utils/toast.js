// toast.js
//
// Small in-page notification used instead of the browser's alert()
// popup ("localhost:5173 says ..."). It slides in at the top-right,
// disappears on its own after a few seconds, and can be clicked to
// close. Works from anywhere (no React provider needed).
//
//   showToast('Item updated successfully!');            // auto: success
//   showToast('Failed to update item.');                // auto: error
//   showToast('Something to note', 'info');             // explicit type
//
// Types: 'success' (teal), 'error' (red), 'info' (navy).

const COLORS = {
  success: '#0B6B8A',
  error: '#E11D48',
  info: '#2D366D',
};

const ICONS = { success: '✓', error: '!', info: 'i' };

const ERROR_WORDS =
  /fail|error|could ?n['o]?t|cannot|can't|invalid|please|already|not allowed|must|required|only|wait|before|future|unable|denied/i;
const SUCCESS_WORDS = /success|updated|added|deleted|archived|restored|marked|saved|approved|created/i;

function guessType(message) {
  if (ERROR_WORDS.test(message) && !/successfully/i.test(message)) return 'error';
  if (SUCCESS_WORDS.test(message)) return 'success';
  return 'info';
}

function getContainer() {
  let container = document.getElementById('app-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'app-toast-container';
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '10000',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: 'min(420px, calc(100vw - 40px))',
      pointerEvents: 'none',
    });
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type) {
  if (typeof document === 'undefined') return;
  const text = String(message ?? '').trim();
  if (!text) return;

  const kind = COLORS[type] ? type : guessType(text);
  const container = getContainer();

  const toast = document.createElement('div');
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  Object.assign(toast.style, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    borderRadius: '12px',
    background: COLORS[kind],
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.4',
    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.18)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    whiteSpace: 'pre-line',
    wordBreak: 'break-word',
    opacity: '0',
    transform: 'translateY(-8px)',
    transition: 'opacity 200ms ease, transform 200ms ease',
  });

  const icon = document.createElement('span');
  icon.textContent = ICONS[kind];
  Object.assign(icon.style, {
    flexShrink: '0',
    width: '20px',
    height: '20px',
    borderRadius: '9999px',
    background: 'rgba(255,255,255,0.22)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '800',
    marginTop: '1px',
  });

  const body = document.createElement('span');
  body.textContent = text;
  body.style.flex = '1';

  const close = document.createElement('span');
  close.textContent = '×';
  Object.assign(close.style, { flexShrink: '0', opacity: '0.75', fontSize: '18px', lineHeight: '1' });

  toast.append(icon, body, close);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 220);
  };

  toast.addEventListener('click', remove);
  // Longer messages stay a little longer.
  setTimeout(remove, Math.min(9000, 3500 + text.length * 25));
}

export default showToast;
