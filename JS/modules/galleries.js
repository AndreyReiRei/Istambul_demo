/**
 * galleries.js
 * Галереи: кнопки «назад/вперёд», свайпы, открытие модалки.
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

	if ( !container || !prevButton || !nextButton ) return;

	// --- Кнопки навигации ---
	prevButton.addEventListener( 'click', () => {
		container.scrollBy( { left: -320, behavior: 'smooth' } );
	} );
	nextButton.addEventListener( 'click', () => {
		container.scrollBy( { left: 320, behavior: 'smooth' } );
	} );

	// --- Открытие модалки ---
	mediaItems.forEach( ( item ) => {
		item.addEventListener( 'click', () => openModal( item ) );
	} );

	// --- Свайп для мобильных ---
	let startX = null;
	let scrollLeft = 0;

	container.addEventListener(
		'touchstart',
		( e ) => {
			startX = e.touches[0].pageX - container.offsetLeft;
			scrollLeft = container.scrollLeft;
		},
		{ passive: true }
	);

	container.addEventListener(
		'touchmove',
		( e ) => {
			if ( startX === null ) return;
			const x = e.touches[0].pageX - container.offsetLeft;
			const walk = ( x - startX ) * 2;
			container.scrollLeft = scrollLeft - walk;
		},
		{ passive: true }
	);

	// КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: сбрасываем startX после свайпа
	container.addEventListener( 'touchend', () => {
		startX = null;
	} );

	// --- Показ/скрытие кнопок в зависимости от скролла ---
	updateNavigationState( gallery );

	container.addEventListener( 'scroll', () => updateNavigationState( gallery ), {
		passive: true,
	} );

	// ResizeObserver точнее window.resize (реагирует на смену ширины контейнера)
	if ( 'ResizeObserver' in window ) {
		const ro = new ResizeObserver( () => updateNavigationState( gallery ) );
		ro.observe( container );
	} else {
		window.addEventListener( 'resize', () => updateNavigationState( gallery ) );
	}
}

function updateNavigationState( gallery ) {
	const container = gallery.querySelector( '.gallery-container' );
	const prevButton = gallery.querySelector( '.prev' );
	const nextButton = gallery.querySelector( '.next' );
	if ( !container ) return;

	// Если контент помещается — навигация не нужна
	const needsNav = container.scrollWidth > container.clientWidth + 1;
	prevButton.style.display = needsNav ? 'flex' : 'none';
	nextButton.style.display = needsNav ? 'flex' : 'none';

	if ( !needsNav ) return;

	// Приглушаем кнопки на краях прокрутки
	prevButton.style.opacity = container.scrollLeft <= 1 ? '0.5' : '1';
	nextButton.style.opacity =
		container.scrollLeft + container.clientWidth >= container.scrollWidth - 1
			? '0.5'
			: '1';
}