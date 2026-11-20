/**
 * modal.js
 * ----------------------------------------------------------------------------
 * Модальное окно для фото, видео и YouTube.
 *
 * Восстановлено рабочее поведение YouTube-плеера:
 *   • iframe создаётся с параметрами, которые гарантированно работают;
 *   • добавлен referrerPolicy — без него YouTube часто возвращает Error 153;
 *   • сохранена кнопка «Нажмите для воспроизведения» (autoplay по клику);
 *   • closeModal корректно останавливает YouTube (iframe.src = '').
 *
 * Публичный API:
 *   initModal()                        — навесить слушатели (один раз)
 *   openModal(mediaItem)               — открыть для конкретного .media-item
 *   setParticlesController(controller) — передать { start, stop } для паузы
 * ----------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Состояние (модульное, не глобальное)
// ---------------------------------------------------------------------------
let currentGallery = null;
let currentMediaIndex = 0;
let modalEl = null;
let modalContentEl = null;
let particlesController = null;

// ---------------------------------------------------------------------------
// Публичный API: контроллер частиц
// ---------------------------------------------------------------------------
export function setParticlesController( controller ) {
	particlesController = controller;
}

// ---------------------------------------------------------------------------
// Инициализация
// ---------------------------------------------------------------------------
export function initModal() {
	modalEl = document.querySelector( '.modal' );
	if ( !modalEl ) return;

	modalContentEl = modalEl.querySelector( '.modal-content' );
	if ( !modalContentEl ) return;

	// Закрытие по ×
	modalEl.querySelector( '.close' )?.addEventListener( 'click', closeModal );

	// Закрытие по клику на фон
	modalEl.addEventListener( 'click', ( e ) => {
		if ( e.target === modalEl ) closeModal();
	} );

	// Навигация кнопками ‹ ›
	modalEl.querySelector( '.modal-prev' )?.addEventListener( 'click', () => navigate( -1 ) );
	modalEl.querySelector( '.modal-next' )?.addEventListener( 'click', () => navigate( 1 ) );

	// Клавиатура
	document.addEventListener( 'keydown', ( e ) => {
		if ( !isOpen() ) return;

		if ( e.key === 'Escape' ) {
			closeModal();
		} else if ( e.key === 'ArrowLeft' ) {
			e.preventDefault();
			navigate( -1 );
		} else if ( e.key === 'ArrowRight' ) {
			e.preventDefault();
			navigate( 1 );
		}
	} );
}

// ---------------------------------------------------------------------------
// Открытие
// ---------------------------------------------------------------------------
export function openModal( mediaItem ) {
	if ( !modalEl || !modalContentEl ) return;

	const gallery = mediaItem.closest( '.media-gallery' );
	if ( !gallery ) return;

	const items = gallery.querySelectorAll( '.media-item' );
	currentGallery = gallery;
	currentMediaIndex = Array.from( items ).indexOf( mediaItem );

	if ( currentMediaIndex < 0 ) return;

	renderCurrentMedia();

	modalEl.style.display = 'flex';
	modalEl.setAttribute( 'aria-hidden', 'false' );
	document.body.style.overflow = 'hidden';

	updateNavButtons( items.length );

	particlesController?.stop();
}

// ---------------------------------------------------------------------------
// Отрисовка текущего медиа
// ---------------------------------------------------------------------------
function renderCurrentMedia() {
	if ( !currentGallery || !modalContentEl ) return;

	const items = currentGallery.querySelectorAll( '.media-item' );
	const item = items[currentMediaIndex];
	if ( !item ) return;

	// Очищаем предыдущий контент (и старый YouTube-iframe вместе с ним)
	modalContentEl.innerHTML = '';

	// --- YouTube ---
	const youtubePoster = item.querySelector( '.youtube-poster' );
	if ( youtubePoster ) {
		const youtubeId = youtubePoster.getAttribute( 'data-youtube-id' );
		if ( youtubeId ) {
			modalContentEl.appendChild( createYouTube( youtubeId ) );
			return;
		}
	}

	// --- Изображение или видео ---
	const mediaEl = item.querySelector( 'img, video' );
	if ( !mediaEl ) return;

	if ( mediaEl.tagName === 'IMG' ) {
		modalContentEl.appendChild( createImage( mediaEl ) );
	} else if ( mediaEl.tagName === 'VIDEO' ) {
		modalContentEl.appendChild( createVideo( mediaEl ) );
	}
}

/**
 * Создать <img> для модалки.
 * Берём data-src (если картинка ещё не загружена лениво) или src.
 */
function createImage( sourceImg ) {
	const img = document.createElement( 'img' );
	img.className = 'modal-media';
	img.src = sourceImg.getAttribute( 'data-src' ) || sourceImg.src;
	img.alt = sourceImg.alt || '';
	return img;
}

/**
 * Создать <video> для модалки.
 */
function createVideo( sourceVideo ) {
	const video = document.createElement( 'video' );
	video.className = 'modal-media';
	video.controls = true;

	const source = sourceVideo.querySelector( 'source' );
	if ( source ) {
		const s = document.createElement( 'source' );
		s.src = source.src;
		s.type = source.type;
		video.appendChild( s );
	}

	return video;
}

/**
 * Создать блок с YouTube-плеером и оверлеем «Нажмите для воспроизведения».
 *
 * ВАЖНО: параметры iframe восстановлены до рабочего состояния:
 *   • rel=0               — не показывать «похожие видео» в конце;
 *   • enablejsapi=1       — разрешить управление через API;
 *   • origin              — обязательно для корректной работы API;
 *   • referrerPolicy      — без него YouTube часто возвращает Error 153;
 *   • allow               — разрешения для автоплея и фуллскрина.
 *
 * Autoplay не включаем сразу — сначала показываем оверлей,
 * по клику перезагружаем iframe с autoplay=1.
 */
function createYouTube( youtubeId ) {
	const wrap = document.createElement( 'div' );
	wrap.className = 'youtube-container';

	const iframe = document.createElement( 'iframe' );
	iframe.className = 'youtube-iframe';

	// Параметры, которые работали в исходной версии
	const params = new URLSearchParams( {
		rel: '0',
		enablejsapi: '1',
		origin: window.location.origin,
	} );

	iframe.src = `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
	iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
	iframe.allowFullscreen = true;

	// Ключевое: без этого YouTube может отдавать Error 153
	iframe.referrerPolicy = 'strict-origin-when-cross-origin';

	wrap.appendChild( iframe );

	// Оверлей с кнопкой ▶
	const overlay = document.createElement( 'div' );
	overlay.className = 'youtube-play-overlay';
	overlay.innerHTML = `
		<div class="youtube-play-button">
			<div class="play-icon">▶</div>
			<div class="play-text">Нажмите для воспроизведения</div>
		</div>`;

	overlay.addEventListener( 'click', () => {
		// Перезагружаем iframe с autoplay=1
		const autoplayParams = new URLSearchParams( {
			autoplay: '1',
			rel: '0',
			enablejsapi: '1',
			origin: window.location.origin,
		} );
		iframe.src = `https://www.youtube.com/embed/${youtubeId}?${autoplayParams.toString()}`;
		overlay.style.display = 'none';
	} );

	wrap.appendChild( overlay );
	return wrap;
}

// ---------------------------------------------------------------------------
// Навигация
// ---------------------------------------------------------------------------
function navigate( direction ) {
	if ( !currentGallery ) return;

	const items = currentGallery.querySelectorAll( '.media-item' );
	const total = items.length;
	if ( total === 0 ) return;

	currentMediaIndex = ( currentMediaIndex + direction + total ) % total;

	renderCurrentMedia();
	updateNavButtons( total );
}

function updateNavButtons( total ) {
	const prev = modalEl?.querySelector( '.modal-prev' );
	const next = modalEl?.querySelector( '.modal-next' );
	if ( !prev || !next ) return;

	const show = total > 1;
	prev.style.display = show ? 'flex' : 'none';
	next.style.display = show ? 'flex' : 'none';
}

// ---------------------------------------------------------------------------
// Закрытие
// ---------------------------------------------------------------------------
/**
 * Закрыть модалку: остановить всё воспроизведение, очистить DOM,
 * вернуть скролл странице, снять паузу с частиц.
 */
function closeModal() {
	if ( !modalEl || !modalContentEl ) return;

	// 1. Останавливаем <video>
	modalContentEl.querySelectorAll( 'video' ).forEach( ( v ) => {
		v.pause();
		v.currentTime = 0;
	} );

	// 2. Останавливаем YouTube — очистка src гарантированно убивает плеер
	const iframe = modalContentEl.querySelector( 'iframe' );
	if ( iframe ) iframe.src = '';

	// 3. Полная очистка контента
	modalContentEl.innerHTML = '';

	// 4. Сброс состояния
	currentGallery = null;
	currentMediaIndex = 0;

	// 5. Скрыть и вернуть скролл
	modalEl.style.display = 'none';
	modalEl.setAttribute( 'aria-hidden', 'true' );
	document.body.style.overflow = '';

	// 6. Возобновляем частицы
	particlesController?.start();
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------
function isOpen() {
	return modalEl && modalEl.style.display === 'flex';
}