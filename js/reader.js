/* =========================================================
   Режим чтения: открывает книгу целиком и запоминает,
   где читатель остановился
   ========================================================= */
(function () {
  'use strict';

  const BOOKS = window.LIBRARY_BOOKS || [];
  const TEXTS = window.LIBRARY_TEXTS || {};

  const reader = document.getElementById('reader');
  const scrollEl = document.getElementById('readerScroll');
  const pageEl = document.getElementById('readerPage');
  const tocEl = document.getElementById('readerToc');
  const tocBtn = document.getElementById('readerTocBtn');
  const titleEl = document.getElementById('readerTitle');
  const progressBar = document.getElementById('readerProgressBar');
  const prevBtn = document.getElementById('readerPrev');
  const nextBtn = document.getElementById('readerNext');
  const fontUp = document.getElementById('readerFontUp');
  const fontDown = document.getElementById('readerFontDown');
  const themeBtn = document.getElementById('readerTheme');
  const themeLabel = document.getElementById('readerThemeLabel');
  const closeBtn = document.getElementById('readerClose');

  const STORE_FONT = 'umk-reader-font';
  const STORE_THEME = 'umk-reader-theme';
  const STORE_POS = 'umk-reader-pos';

  let currentBook = null;
  let chapters = [];
  let chapterIndex = 0;
  let lastFocused = null;
  let saveTimer = null;

  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* приватный режим — просто не сохраняем */ }
    }
  };

  /* ---------- Отображение ---------- */

  function blockMarkup(block, index) {
    if (block.type === 'verse') {
      const lines = Array.isArray(block.lines) ? block.lines : String(block.lines).split('\n');
      return `<p class="verse">${lines.map(esc).join('\n')}</p>`;
    }
    if (block.type === 'subhead') {
      return `<p class="stanza-num">${esc(block.text)}</p>`;
    }
    return `<p class="${index === 0 ? 'first' : ''}">${esc(block.text)}</p>`;
  }

  function chapterMarkup(chapter, index) {
    const blocks = (chapter.blocks || []).map(blockMarkup).join('');
    const title = chapter.title
      ? `<h2 class="reader__chapter-title" id="chapter-${index}">${esc(chapter.title)}</h2>`
      : '';
    return title + blocks;
  }

  function bookHead(book) {
    return `
      <header class="reader__book-head">
        <h1>${esc(book.title)}</h1>
        <p>${esc(book.author)}${book.year ? ' · ' + book.year : ''}</p>
      </header>
    `;
  }

  function noTextMarkup(book) {
    return `
      <div class="reader__note">
        <h2>Текст этой книги пока не загружен</h2>
        <p>
          Карточка издания есть в каталоге, но полный текст в цифровом виде в фонд
          ещё не добавлен. Книгу можно взять в библиотеке — административный корпус,
          1 этаж.
        </p>
        <p>
          Библиотекарю: чтобы включить чтение, добавьте файл
          <code>texts/${esc(book.id)}.txt</code> (обычный текст, абзацы через пустую
          строку) или опишите текст в <code>js/texts.js</code> под ключом
          <code>${esc(book.id)}</code>.
        </p>
      </div>
    `;
  }

  function renderToc() {
    const many = chapters.length > 1;
    tocBtn.hidden = !many;
    tocEl.hidden = true;
    tocBtn.setAttribute('aria-expanded', 'false');

    if (!many) {
      tocEl.innerHTML = '';
      return;
    }

    tocEl.innerHTML = `
      <h2>Содержание</h2>
      <ol>
        ${chapters.map((ch, i) => `
          <li><button type="button" data-chapter="${i}" class="${i === chapterIndex ? 'is-current' : ''}">
            ${esc(ch.title || 'Глава ' + (i + 1))}
          </button></li>
        `).join('')}
      </ol>
    `;
  }

  function renderChapter({ keepScroll = false } = {}) {
    const chapter = chapters[chapterIndex];
    if (!chapter) return;

    pageEl.innerHTML = chapterIndex === 0
      ? bookHead(currentBook) + chapterMarkup(chapter, 0) + (currentBook.__source ? '' : '')
      : chapterMarkup(chapter, 0);

    if (chapters.length > 1) {
      pageEl.querySelector('.reader__chapter-title')?.setAttribute('tabindex', '-1');
    }

    prevBtn.hidden = chapters.length < 2 || chapterIndex === 0;
    nextBtn.hidden = chapters.length < 2 || chapterIndex === chapters.length - 1;
    nextBtn.textContent = 'Следующая глава →';
    prevBtn.textContent = '← Предыдущая глава';

    if (!keepScroll) scrollEl.scrollTop = 0;
    updateTocState();
    updateProgress();
    savePosition();
  }

  function updateTocState() {
    tocEl.querySelectorAll('[data-chapter]').forEach((btn) => {
      btn.classList.toggle('is-current', Number(btn.dataset.chapter) === chapterIndex);
    });
  }

  function updateProgress() {
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, scrollEl.scrollTop / max)) : 1;
    progressBar.style.width = (ratio * 100).toFixed(2) + '%';
  }

  function savePosition() {
    if (!currentBook) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const all = store.get(STORE_POS, {});
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      all[currentBook.id] = {
        chapter: chapterIndex,
        ratio: max > 0 ? scrollEl.scrollTop / max : 0,
        updated: Date.now()
      };
      store.set(STORE_POS, all);
    }, 250);
  }

  function getSaved(bookId) {
    const all = store.get(STORE_POS, {});
    return all[bookId] || null;
  }

  /* ---------- Загрузка текста ---------- */

  function textToChapters(raw) {
    const blocks = raw.replace(/\r\n/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    const out = [];

    blocks.forEach((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const isVerse = lines.length > 1 && lines.filter((l) => l.length > 0).length > 1 &&
        lines.reduce((sum, l) => sum + l.length, 0) / lines.length < 58;

      if (isVerse) out.push({ type: 'verse', lines });
      else out.push({ type: 'p', text: lines.join(' ') });
    });

    return [{ title: null, blocks: out }];
  }

  async function loadText(book) {
    if (TEXTS[book.id] && Array.isArray(TEXTS[book.id].chapters) && TEXTS[book.id].chapters.length) {
      return { chapters: TEXTS[book.id].chapters, source: TEXTS[book.id].source || '' };
    }

    try {
      const res = await fetch(`texts/${book.id}.txt`, { cache: 'no-store' });
      if (!res.ok) return null;
      const raw = await res.text();
      if (!raw || raw.trim().startsWith('<') || raw.trim().length < 40) return null;
      return { chapters: textToChapters(raw), source: '' };
    } catch (e) {
      return null;
    }
  }

  /* ---------- Открытие / закрытие ---------- */

  async function open(bookId) {
    const book = BOOKS.find((b) => b.id === bookId);
    if (!book) return;

    currentBook = book;
    lastFocused = document.activeElement;

    reader.hidden = false;
    document.body.classList.add('is-reading');
    titleEl.innerHTML = `${esc(book.title)} <span>· ${esc(book.author)}</span>`;
    pageEl.innerHTML = '<p class="reader__loading">Загружаем текст…</p>';
    scrollEl.scrollTop = 0;
    tocEl.hidden = true;
    tocBtn.hidden = true;
    prevBtn.hidden = true;
    nextBtn.hidden = true;

    const loaded = await loadText(book);

    if (!loaded) {
      chapters = [{ title: null, blocks: [] }];
      chapterIndex = 0;
      pageEl.innerHTML = bookHead(book) + noTextMarkup(book);
      progressBar.style.width = '0%';
      closeBtn.focus();
      return;
    }

    chapters = loaded.chapters;
    currentBook.__source = loaded.source;

    const saved = getSaved(book.id);
    chapterIndex = saved ? Math.min(saved.chapter || 0, chapters.length - 1) : 0;

    renderChapter({ keepScroll: true });
    renderToc();

    const body = pageEl.innerHTML;
    if (loaded.source) {
      pageEl.innerHTML = body + `<p class="reader__src">${esc(loaded.source)}</p>`;
    }

    if (saved && (saved.ratio > 0.02 || saved.chapter > 0)) {
      window.setTimeout(() => {
        const max = scrollEl.scrollHeight - scrollEl.clientHeight;
        scrollEl.scrollTop = Math.max(0, (saved.ratio || 0) * max);
        updateProgress();
      }, 60);
    }

    closeBtn.focus();
  }

  function close() {
    if (reader.hidden) return;
    savePosition();
    reader.hidden = true;
    document.body.classList.remove('is-reading');
    pageEl.innerHTML = '';
    currentBook = null;
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }

  function goToChapter(index) {
    if (index < 0 || index >= chapters.length) return;
    chapterIndex = index;
    renderChapter();
    updateTocState();
    scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Настройки ---------- */

  function applyFont(size) {
    const clamped = Math.min(1.6, Math.max(0.95, size));
    pageEl.style.setProperty('--reader-font', clamped + 'rem');
    store.set(STORE_FONT, clamped);
  }

  function applyTheme(theme) {
    reader.dataset.theme = theme;
    const labels = { light: 'Светлая', sepia: 'Сепия', night: 'Ночь' };
    themeLabel.textContent = labels[theme] || 'Тема';
    store.set(STORE_THEME, theme);
  }

  /* ---------- События ---------- */

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => goToChapter(chapterIndex - 1));
  nextBtn.addEventListener('click', () => goToChapter(chapterIndex + 1));

  fontUp.addEventListener('click', () => {
    const current = parseFloat(getComputedStyle(pageEl).fontSize) / 16;
    applyFont(current + 0.075);
  });
  fontDown.addEventListener('click', () => {
    const current = parseFloat(getComputedStyle(pageEl).fontSize) / 16;
    applyFont(current - 0.075);
  });

  themeBtn.addEventListener('click', () => {
    const order = ['light', 'sepia', 'night'];
    const next = order[(order.indexOf(reader.dataset.theme || 'light') + 1) % order.length];
    applyTheme(next);
  });

  tocBtn.addEventListener('click', () => {
    const isOpen = tocEl.hidden;
    tocEl.hidden = !isOpen;
    tocBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) tocEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  tocEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chapter]');
    if (!btn) return;
    goToChapter(Number(btn.dataset.chapter));
    tocEl.hidden = true;
    tocBtn.setAttribute('aria-expanded', 'false');
  });

  scrollEl.addEventListener('scroll', () => {
    window.requestAnimationFrame(updateProgress);
    savePosition();
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (reader.hidden) return;
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowRight' && chapters.length > 1) goToChapter(chapterIndex + 1);
    if (e.key === 'ArrowLeft' && chapters.length > 1) goToChapter(chapterIndex - 1);
    if (e.key === 'Tab') {
      const focusable = Array.from(reader.querySelectorAll('button:not([hidden])'))
        .filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ---------- Инициализация ---------- */
  applyTheme(store.get(STORE_THEME, 'light'));
  applyFont(store.get(STORE_FONT, 1.125));

  window.Reader = { open, close, getSaved };
})();
