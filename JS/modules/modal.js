/**
 * modal.js
 * ----------------------------------------------------------------------------
 * Модальное окно для фото, видео и YouTube.
 *
 * Свайп:
 *   • влево  → следующее медиа;
 *   • вправо → предыдущее;
 *   • порог 50px, чтобы случайный тап не листал;
 *   • жесты по iframe YouTube игнорируются (плеер сам обрабатывает касания);
 *   • вертикальный свайп не мешает листанию (определяем направление).
 *
 * Публичный API:
 *   initModal()                        — навесить слушатели (один раз)
 *   openModal(mediaItem)               — открыть для конкретного .media-item
 *   setParticlesController(controller) — передать { start, stop } для паузы
 * ----------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Состояние
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

	// Свайп — навешиваем ОДИН раз на modalContentEl
	setupSwipe();
}

// ---------------------------------------------------------------------------
// Свайп в модалке
// ---------------------------------------------------------------------------
/**
 * Ручной свайп для модалки.
 *
 * Почему не нативный scroll:
 *   • в модалке один элемент, скроллить нечего;
 *   • нужен порог, чтобы тап не листал;
 *   • нужно игнорировать жесты по iframe YouTube (там свой обработчик).
 *
 * Логика:
 *   1. touchstart — запоминаем точку и цель касания.
 *   2. touchmove — определяем направление (горизонтальный/вертикальный).
 *   3. touchend — если горизонтальный и > 50px — листаем.
 */
function setupSwipe() {
	let startX = 0;
	let startY = 0;
	let isHorizontal = false;
	let isSwiping = false;

	const SWIPE_THRESHOLD = 50;      // минимальная длина свайпа в px
	const DIRECTION_THRESHOLD = 10;  // минимальное движение для определения направления

	modalContentEl.addEventListener( 'touchstart', ( e ) => {
		// Если коснулись iframe YouTube — не вмешиваемся,
		// плеер сам обрабатывает жесты
		if ( e.target.closest( 'iframe' ) ) return;

		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		isHorizontal = false;
		isSwiping = false;
	}, { passive: true } );

	modalContentEl.addEventListener( 'touchmove', ( e ) => {
		if ( e.target.closest( 'iframe' ) ) return;
		if ( !startX && !startY ) return;

		const touch = e.touches[0];
		const dx = Math.abs( touch.clientX - startX );
		const dy = Math.abs( touch.clientY - startY );

		// Один раз определяем направление
		if ( !isSwiping && ( dx > DIRECTION_THRESHOLD || dy > DIRECTION_THRESHOLD ) ) {
			isSwiping = true;
			isHorizontal = dx > dy;
		}
	}, { passive: true } );

	modalContentEl.addEventListener( 'touchend', ( e ) => {
		if ( e.target.closest( 'iframe' ) ) return;
		if ( !isSwiping || !isHorizontal ) {
			// Сброс — следующий жест начнётся «с нуля»
			startX = 0;
			startY = 0;
			isSwiping = false;
			isHorizontal = false;
			return;
		}

		const touch = e.changedTouches[0];
		const dx = touch.clientX - startX;

		if ( dx > SWIPE_THRESHOLD ) {
			navigate( -1 );  // свайп вправо → предыдущий
		} else if ( dx < -SWIPE_THRESHOLD ) {
			navigate( 1 );   // свайп влево → следующий
		}

		// Сброс
		startX = 0;
		startY = 0;
		isSwiping = false;
		isHorizontal = false;
	}, { passive: true } );
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

	modalContentEl.innerHTML = '';

	const youtubePoster = item.querySelector( '.youtube-poster' );
	if ( youtubePoster ) {
		const youtubeId = youtubePoster.getAttribute( 'data-youtube-id' );
		if ( youtubeId ) {
			modalContentEl.appendChild( createYouTube( youtubeId ) );
			return;
		}
	}

	const mediaEl = item.querySelector( 'img, video' );
	if ( !mediaEl ) return;

	if ( mediaEl.tagName === 'IMG' ) {
		modalContentEl.appendChild( createImage( mediaEl ) );
	} else if ( mediaEl.tagName === 'VIDEO' ) {
		modalContentEl.appendChild( createVideo( mediaEl ) );
	}
}

function createImage( sourceImg ) {
	const img = document.createElement( 'img' );
	img.className = 'modal-media';
	img.src = sourceImg.getAttribute( 'data-src' ) || sourceImg.src;
	img.alt = sourceImg.alt || '';
	// Отключаем перетаскивание — иначе свайп по фото «схватит» картинку
	img.draggable = false;
	return img;
}

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
 * YouTube-плеер с оверлеем «Нажмите для воспроизведения».
 * referrerPolicy обязателен — без него YouTube отдаёт Error 153.
 */
function createYouTube( youtubeId ) {
	const wrap = document.createElement( 'div' );
	wrap.className = 'youtube-container';

	const iframe = document.createElement( 'iframe' );
	iframe.className = 'youtube-iframe';

	const params = new URLSearchParams( {
		rel: '0',
		enablejsapi: '1',
		origin: window.location.origin,
	} );

	iframe.src = `https://www.youtube.com/embed/${youtubeId}?${params.toString()}`;
	iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
	iframe.allowFullscreen = true;
	iframe.referrerPolicy = 'strict-origin-when-cross-origin';

	wrap.appendChild( iframe );

	const overlay = document.createElement( 'div' );
	overlay.className = 'youtube-play-overlay';
	overlay.innerHTML = `
		<div class="youtube-play-button">
			<div class="play-icon">▶</div>
			<div class="play-text">Нажмите для воспроизведения</div>
		</div>`;

	overlay.addEventListener( 'click', () => {
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
function closeModal() {
	if ( !modalEl || !modalContentEl ) return;

	modalContentEl.querySelectorAll( 'video' ).forEach( ( v ) => {
		v.pause();
		v.currentTime = 0;
	} );

	const iframe = modalContentEl.querySelector( 'iframe' );
	if ( iframe ) iframe.src = '';

	modalContentEl.innerHTML = '';

	currentGallery = null;
	currentMediaIndex = 0;

	modalEl.style.display = 'none';
	modalEl.setAttribute( 'aria-hidden', 'true' );
	document.body.style.overflow = '';

	particlesController?.start();
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------
function isOpen() {
	return modalEl && modalEl.style.display === 'flex';
}