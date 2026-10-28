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
  let fontSize = 1.125;
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
    const availability = book.free > 0
      ? `сейчас свободно ${book.free} из ${book.total} экз.`
      : `все ${book.total} экз. выданы`;
    return `
      <div class="reader__note">
        <h2>Полный текст этой книги ещё не оцифрован</h2>
        <p>${esc(book.annotation || '')}</p>
        <p>
          Издание есть в бумажном фонде: шифр <code>${esc(book.shelf)}</code>,
          ${esc(availability)}. Забрать можно в библиотеке — административный корпус,
          1 этаж, пн–пт с 9:00 до 17:00.
        </p>
        <p>
          Библиотекарю: чтобы включить чтение онлайн, положите файл
          <code>texts/${esc(book.id)}.txt</code> (обычный текст, абзацы через пустую
          строку) или опишите текст в <code>js/texts.js</code> под ключом
          <code>${esc(book.id)}</code>.
        </p>
      </div>
    `;
  }

  function renderToc() {
    const many = chapters.length > 1 && chapters.some((ch) => ch.title);
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
      ? bookHead(currentBook) + chapterMarkup(chapter, 0)
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

  function savePosition(immediate) {
    if (!currentBook) return;
    window.clearTimeout(saveTimer);
    const bookId = currentBook.id;
    const write = () => {
      const all = store.get(STORE_POS, {});
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      all[bookId] = {
        chapter: chapterIndex,
        ratio: max > 0 ? scrollEl.scrollTop / max : 0,
        updated: Date.now()
      };
      store.set(STORE_POS, all);
    };
    if (immediate) { write(); return; }
    saveTimer = window.setTimeout(() => {
      write();
    }, 250);
  }

  function getSaved(bookId) {
    const all = store.get(STORE_POS, {});
    return all[bookId] || null;
  }

  /* ---------- Загрузка текста ---------- */

  function textToChapters(raw) {
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const chapters = [];
    let title = null;
    let buffer = [];

    const push = () => {
      const blocks = [];
      buffer.join('\n').split(/\n{2,}/).forEach((paragraph) => {
        const clean = paragraph.trim();
        if (!clean) return;

        const rows = clean.split('\n').map((l) => l.trim()).filter(Boolean);
        const avg = rows.reduce((sum, l) => sum + l.length, 0) / rows.length;
        const isVerse = rows.length > 1 && avg < 58 && !/[.!?…]\s/.test(rows.join(' ').slice(0, 40));

        if (isVerse) blocks.push({ type: 'verse', lines: rows });
        else blocks.push({ type: 'p', text: rows.join(' ') });
      });
      chapters.push({ title, blocks });
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        if (buffer.join('').trim() || title !== null) push();
        buffer = [];
        title = trimmed.slice(2).trim();
        return;
      }
      buffer.push(line);
    });
    push();

    const filled = chapters.filter((ch) => ch.blocks.length > 0);

    // «ЧАСТЬ ПЕРВАЯ» и подобные разделы приклеиваем к следующей главе как подзаголовок
    const merged = [];
    let pendingPart = null;
    filled.forEach((ch) => {
      if (ch.title && /^(ЧАСТЬ|Часть)(\s|$)/.test(ch.title) && ch.blocks.length <= 6) {
        pendingPart = ch.title;
        return;
      }
      if (pendingPart) {
        ch.blocks = [{ type: 'subhead', text: pendingPart }].concat(ch.blocks);
        pendingPart = null;
      }
      merged.push(ch);
    });
    if (pendingPart) merged.push({ title: pendingPart, blocks: [] });

    return merged.length ? merged : [{ title: null, blocks: [] }];
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
    savePosition(true);
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
    fontSize = Math.min(1.6, Math.max(0.95, Math.round(size * 1000) / 1000));
    pageEl.style.setProperty('--reader-font', fontSize + 'rem');
    reader.style.setProperty('--reader-font', fontSize + 'rem');
    store.set(STORE_FONT, fontSize);
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

  fontUp.addEventListener('click', () => applyFont(fontSize + 0.075));
  fontDown.addEventListener('click', () => applyFont(fontSize - 0.075));

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
