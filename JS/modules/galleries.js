/**
 * galleries.js
 * ----------------------------------------------------------------------------
 * Галереи: кнопки ‹ ›, свайп, открытие модалки.
 *
 * Особенности:
 *   • на мобильных (< 600px) кнопки скрыты CSS — JS не навешивает
 *     на них обработчики, чтобы не тратить ресурсы;
 *   • свайп работает через нативный overflow-x: auto + scroll-snap,
 *     JS только сбрасывает состояние после касания;
 *   • кнопки получают класс .is-edge, когда листать некуда (край ленты);
 *   • ResizeObserver следит за изменением ширины — пересчитывает
 *     видимость кнопок при повороте экрана.
 * ----------------------------------------------------------------------------
 */

import { openModal } from './modal.js';

// Порог, ниже которого кнопки скрыты CSS и JS их не трогает
const MOBILE_BREAKPOINT = 600;

export function initGalleries() {
	const galleries = document.querySelectorAll( '.media-gallery' );
	galleries.forEach( setupGallery );
}

function setupGallery( gallery ) {
	const container = gallery.querySelector( '.gallery-container' );
	const prevButton = gallery.querySelector( '.prev' );
	const nextButton = gallery.querySelector( '.next' );
	const mediaItems = gallery.querySelectorAll( '.media-item' );

	if ( !container ) return;

	// --- Свайп: touch-action: pan-y разрешает вертикальный скролл страницы,
	//     горизонтальный жест обрабатывает сам контейнер.
	//     touchend сбрасывает состояние, чтобы следующий свайп начался «с нуля».
	let touchStartX = 0;
	let touchStartY = 0;
	let touchMoved = false;

	container.addEventListener( 'touchstart', ( e ) => {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchMoved = false;
	}, { passive: true } );

	container.addEventListener( 'touchmove', ( e ) => {
		const dx = Math.abs( e.touches[0].clientX - touchStartX );
		const dy = Math.abs( e.touches[0].clientY - touchStartY );
		// Если движение больше по горизонтали — это свайп карусели
		if ( dx > dy && dx > 5 ) {
			touchMoved = true;
		}
	}, { passive: true } );

	container.addEventListener( 'touchend', () => {
		// Сбрасываем состояние — следующий свайп начнётся заново
		touchMoved = false;
	}, { passive: true } );

	// --- Кнопки ‹ › (только если они видны)
	if ( prevButton && nextButton ) {
		const isMobile = window.matchMedia( `(max-width: ${MOBILE_BREAKPOINT - 1}px)` ).matches;

		if ( !isMobile ) {
			prevButton.addEventListener( 'click', () => {
				container.scrollBy( { left: -container.clientWidth * 0.9, behavior: 'smooth' } );
			} );

			nextButton.addEventListener( 'click', () => {
				container.scrollBy( { left: container.clientWidth * 0.9, behavior: 'smooth' } );
			} );
		}

		// Обновляем состояние кнопок при скролле
		const updateNavState = () => {
			const isAtStart = container.scrollLeft <= 1;
			const isAtEnd =
				container.scrollLeft + container.clientWidth >= container.scrollWidth - 1;

			prevButton.classList.toggle( 'is-edge', isAtStart );
			nextButton.classList.toggle( 'is-edge', isAtEnd );
		};

		container.addEventListener( 'scroll', updateNavState, { passive: true } );

		// И при изменении размера контейнера (поворот экрана, ресайз окна)
		if ( 'ResizeObserver' in window ) {
			const ro = new ResizeObserver( updateNavState );
			ro.observe( container );
		} else {
			window.addEventListener( 'resize', updateNavState );
		}

		// Первичная инициализация
		updateNavState();
	}

	// --- Клик по миниатюре → открыть модалку
	mediaItems.forEach( ( item ) => {
		item.addEventListener( 'click', () => openModal( item ) );
	} );
}