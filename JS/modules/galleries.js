/**
 * galleries.js
 * ----------------------------------------------------------------------------
 * Галереи: кнопки ‹ ›, свайп, открытие модалки.
 *
 * Особенности:
 *   • обработчики на стрелки навешиваются ВСЕГДА — на мобильных
 *     стрелки скрыты CSS (display: none), кликнуть нельзя, обработчики «спят»;
 *   • свайп работает через нативный overflow-x: auto + scroll-snap;
 *   • кнопки получают класс .is-edge, когда листать некуда;
 *   • ResizeObserver следит за изменением ширины — пересчитывает
 *     состояние кнопок при повороте экрана.
 * ----------------------------------------------------------------------------
 */

import { openModal } from './modal.js';

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

	// --- Кнопки ‹ › ---
	// Обработчики навешиваем всегда. На мобильных стрелки скрыты через CSS,
	// кликнуть по ним нельзя — обработчики просто не сработают.
	if ( prevButton && nextButton ) {
		prevButton.addEventListener( 'click', () => {
			container.scrollBy( { left: -container.clientWidth * 0.9, behavior: 'smooth' } );
		} );

		nextButton.addEventListener( 'click', () => {
			container.scrollBy( { left: container.clientWidth * 0.9, behavior: 'smooth' } );
		} );

		// Обновляем состояние кнопок при скролле
		const updateNavState = () => {
			const isAtStart = container.scrollLeft <= 1;
			const isAtEnd =
				container.scrollLeft + container.clientWidth >= container.scrollWidth - 1;

			prevButton.classList.toggle( 'is-edge', isAtStart );
			nextButton.classList.toggle( 'is-edge', isAtEnd );
		};

		container.addEventListener( 'scroll', updateNavState, { passive: true } );

		if ( 'ResizeObserver' in window ) {
			const ro = new ResizeObserver( updateNavState );
			ro.observe( container );
		} else {
			window.addEventListener( 'resize', updateNavState );
		}

		updateNavState();
	}

	// --- Свайп: сбрасываем состояние после касания ---
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
		if ( dx > dy && dx > 5 ) {
			touchMoved = true;
		}
	}, { passive: true } );

	container.addEventListener( 'touchend', () => {
		touchMoved = false;
	}, { passive: true } );

	// --- Клик по миниатюре → открыть модалку ---
	mediaItems.forEach( ( item ) => {
		item.addEventListener( 'click', () => openModal( item ) );
	} );
}