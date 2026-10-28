/* =========================================================
   Логика страницы: каталог, фильтры, модальные окна, анимации
   ========================================================= */
(function () {
  'use strict';

  const BOOKS = window.LIBRARY_BOOKS || [];
  const PAGE = 9;

  const state = {
    query: '',
    category: 'all',
    sort: 'default',
    limit: PAGE
  };

  /* ---------- Утилиты ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));

  const plural = (n, one, few, many) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  };

  const normalize = (str) => String(str).toLowerCase().replace(/ё/g, 'е').trim();

  /* ---------- Разметка карточки ---------- */
  function coverMarkup(book, interactive) {
    const tag = interactive ? 'button' : 'div';
    const attrs = interactive
      ? `type="button" class="book__cover" data-open="${book.id}" aria-label="Подробнее: ${esc(book.title)}"`
      : `class="book__cover" aria-hidden="true"`;
    return `
      <${tag} ${attrs} style="--from:${book.cover[0]};--to:${book.cover[1]}">
        <span class="book__cat">${esc(book.category)}</span>
        <span class="book__ctitle">${esc(book.title)}</span>
        <span class="book__cauthor">${esc(book.author)}</span>
        <span class="book__year">${book.year}</span>
        ${book.isNew ? '<span class="book__new">новинка</span>' : ''}
      </${tag}>
    `;
  }

  function availability(book) {
    const inFund = `В фонде: ${book.total} ${plural(book.total, 'экз.', 'экз.', 'экз.')}`;
    const free = book.free > 0
      ? `свободно <b>${book.free}</b>`
      : '<b>все выданы</b>';
    return `<p class="book__avail">${inFund} · ${free}</p>`;
  }

  const readIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10.5 5.2 8.6 4.6 6 4.6c-.8 0-1.5.1-2 .2v14c.5-.1 1.2-.2 2-.2 2.6 0 4.5.6 6 1.9 1.5-1.3 3.4-1.9 6-1.9.8 0 1.5.1 2 .2v-14c-.5-.1-1.2-.2-2-.2-2.6 0-4.5.6-6 1.9z"/><path d="M12 6.5v14"/></svg>`;

  function readButton(book, extraClass) {
    return `<button class="btn--read ${extraClass || ''}" type="button" data-read="${book.id}">
      ${readIcon} Читать
    </button>`;
  }

  function cardMarkup(book, index) {
    return `
      <article class="book" style="animation-delay:${Math.min(index, 8) * 28}ms">
        ${coverMarkup(book, true)}
        <div class="book__body">
          <p class="book__meta">${esc(book.category)} · ${book.year}</p>
          <h3 class="book__title">${esc(book.title)}</h3>
          <p class="book__author">${esc(book.author)}</p>
          ${availability(book)}
          <div class="book__foot">
            ${readButton(book)}
            <button class="book__more" type="button" data-open="${book.id}">Подробнее</button>
          </div>
        </div>
      </article>
    `;
  }

  /* ---------- Фильтрация и рендер ---------- */
  const booksEl = $('#books');
  const emptyEl = $('#empty');
  const resultsEl = $('#results');
  const showMoreBtn = $('#showMore');
  const searchInput = $('#catalogSearch');
  const clearBtn = $('#clearSearch');
  const sortSelect = $('#sortSelect');

  function getFiltered() {
    const q = normalize(state.query);
    const list = BOOKS.filter((book) => {
      const inCategory = state.category === 'all' || book.category === state.category;
      if (!inCategory) return false;
      if (!q) return true;
      const haystack = normalize([
        book.title, book.author, book.category, book.annotation, book.publisher, book.shelf
      ].join(' '));
      return q.split(/\s+/).every((word) => haystack.includes(word));
    });

    const sorted = list.slice();
    switch (state.sort) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
        break;
      case 'author':
        sorted.sort((a, b) => a.author.localeCompare(b.author, 'ru'));
        break;
      case 'year':
        sorted.sort((a, b) => b.year - a.year);
        break;
      default:
        break;
    }
    return sorted;
  }

  function render() {
    const filtered = getFiltered();
    const visible = filtered.slice(0, state.limit);

    booksEl.innerHTML = visible.map(cardMarkup).join('');
    booksEl.hidden = filtered.length === 0;
    emptyEl.hidden = filtered.length !== 0;

    // Текст о количестве результатов
    if (filtered.length === 0) {
      resultsEl.textContent = state.query
        ? `По запросу «${state.query}» ничего не найдено`
        : 'В этом разделе пока нет изданий';
    } else if (filtered.length > visible.length) {
      resultsEl.textContent = `Показано ${visible.length} из ${filtered.length} ${plural(filtered.length, 'издания', 'изданий', 'изданий')}`;
    } else {
      resultsEl.textContent = `Найдено ${filtered.length} ${plural(filtered.length, 'издание', 'издания', 'изданий')}`;
    }

    showMoreBtn.hidden = filtered.length <= visible.length;
    clearBtn.hidden = state.query.length === 0;
  }

  function setQuery(value, { scroll = false } = {}) {
    state.query = value;
    state.limit = PAGE;
    if (searchInput.value !== value) searchInput.value = value;
    render();
    if (scroll) {
      $('#catalog').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => searchInput.focus({ preventScroll: true }), 480);
    }
  }

  /* ---------- События каталога ---------- */
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    const value = e.target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = value;
      state.limit = PAGE;
      render();
    }, 140);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      setQuery('');
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    setQuery('');
    searchInput.focus();
  });

  sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.limit = PAGE;
    render();
  });

  $$('#chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('#chips .chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.category = chip.dataset.cat;
      state.limit = PAGE;
      render();
    });
  });

  showMoreBtn.addEventListener('click', () => {
    state.limit += PAGE;
    render();
  });

  $('#resetSearch').addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    state.category = 'all';
    state.limit = PAGE;
    $$('#chips .chip').forEach((c) => c.classList.toggle('is-active', c.dataset.cat === 'all'));
    render();
    searchInput.focus();
  });

  /* ---------- Поиск из первого экрана ---------- */
  const heroForm = $('#heroSearch');
  const heroInput = $('#heroSearchInput');

  heroForm.addEventListener('submit', (e) => {
    e.preventDefault();
    setQuery(heroInput.value.trim(), { scroll: true });
  });

  $$('.hero__quick button').forEach((btn) => {
    btn.addEventListener('click', () => {
      heroInput.value = btn.textContent.trim();
      setQuery(btn.dataset.quick, { scroll: true });
    });
  });

  /* ---------- Модальное окно ---------- */
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  const modalDialog = $('.modal__dialog', modal);
  const toast = $('#toast');
  let lastFocused = null;
  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }

  function buildModal(book) {
    return `
      <div class="modal__cover">${coverMarkup(book, false)}</div>
      <div class="modal__info">
        <p class="modal__cat">${esc(book.category)}</p>
        <h2 class="modal__title" id="modalTitle">${esc(book.title)}</h2>
        <p class="modal__author">${esc(book.author)}</p>
        <p class="modal__desc">${esc(book.annotation)}</p>
        <dl class="specs">
          <div><dt>Год издания</dt><dd>${book.year}</dd></div>
          <div><dt>Издательство</dt><dd>${esc(book.publisher)}</dd></div>
          <div><dt>Страниц</dt><dd>${book.pages}</dd></div>
          <div><dt>Шифр / полка</dt><dd>${esc(book.shelf)}</dd></div>
          <div><dt>В фонде</dt><dd>${book.total} ${plural(book.total, 'экземпляр', 'экземпляра', 'экземпляров')}</dd></div>
          <div><dt>Свободно</dt><dd>${book.free > 0 ? book.free + ' ' + plural(book.free, 'экземпляр', 'экземпляра', 'экземпляров') : 'нет'}</dd></div>
        </dl>
        <div class="modal__actions">
          ${readButton(book, 'btn--read--lg')}
          <button class="btn btn--ghost" type="button" data-close>Закрыть</button>
        </div>
      </div>
    `;
  }

  function openModal(id) {
    const book = BOOKS.find((b) => b.id === id);
    if (!book) return;

    lastFocused = document.activeElement;
    modalBody.innerHTML = buildModal(book);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modalDialog.scrollTop = 0;
    modalDialog.focus();

  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    modalBody.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }

  function trapFocus(e) {
    if (e.key !== 'Tab' || modal.hidden) return;
    const focusable = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modalDialog)
      .filter((el) => !el.disabled && el.offsetParent !== null);
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

  document.addEventListener('click', (e) => {
    const readTarget = e.target.closest('[data-read]');
    if (readTarget) {
      e.preventDefault();
      closeModal();
      if (window.Reader && typeof window.Reader.open === 'function') {
        window.Reader.open(readTarget.dataset.read);
      }
      return;
    }

    const opener = e.target.closest('[data-open]');
    if (opener) {
      openModal(opener.dataset.open);
      return;
    }
    if (e.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeNav();
    }
    trapFocus(e);
  });

  /* ---------- Мобильное меню ---------- */
  const burger = $('.burger');
  const nav = $('#nav');

  function closeNav() {
    if (!nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  burger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
  });

  $$('#nav a').forEach((link) => link.addEventListener('click', closeNav));

  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('is-open')) return;
    if (e.target.closest('#nav') || e.target.closest('.burger')) return;
    closeNav();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 820) closeNav();
  });

  /* ---------- Тень у шапки ---------- */
  const header = $('.site-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Счётчики ---------- */
  const formatNum = new Intl.NumberFormat('ru-RU');

  function animateCount(el) {
    const target = Number(el.dataset.count);
    const duration = 1500;
    const start = performance.now();
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      el.textContent = formatNum.format(Math.round(target * easeOut(progress)));
      if (progress < 1) requestAnimationFrame(frame);
      else el.textContent = formatNum.format(target);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Появление блоков при прокрутке ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if ('IntersectionObserver' in window) {
    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        $$('.stat__num', entry.target).forEach(animateCount);
        statObserver.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    const statsGrid = $('.stats__grid');
    if (statsGrid) {
      if (reduceMotion) {
        $$('.stat__num').forEach((el) => {
          el.textContent = formatNum.format(Number(el.dataset.count));
        });
      } else {
        statObserver.observe(statsGrid);
      }
    }

    const barsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        barsObserver.unobserve(entry.target);
      });
    }, { threshold: 0.25 });

    const fundCard = $('#fund');
    if (fundCard) barsObserver.observe(fundCard);
  } else {
    $$('.stat__num').forEach((el) => {
      el.textContent = formatNum.format(Number(el.dataset.count));
    });
    const fundCard = $('#fund');
    if (fundCard) fundCard.classList.add('is-visible');
  }

  /* ---------- Старт ---------- */
  const initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) {
    heroInput.value = initialQuery;
    state.query = initialQuery;
    searchInput.value = initialQuery;
  }
  render();
})();
