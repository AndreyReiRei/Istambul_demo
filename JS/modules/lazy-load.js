/**
 * lazy-load.js
 * Ленивая загрузка изображений через IntersectionObserver.
 */

export class LazyLoadManager {
	constructor() {
		// Все изображения, у которых есть data-src (реальный источник)
		this.images = document.querySelectorAll( '.lazy-image[data-src]' );
		this.observer = null;
		this.init();
	}

	init() {
		if ( this.images.length === 0 ) return;

		if ( 'IntersectionObserver' in window ) {
			this.setupIntersectionObserver();
		} else {
			// Fallback для очень старых браузеров — грузим всё сразу
			this.loadAllImages();
		}
	}

	setupIntersectionObserver() {
		this.observer = new IntersectionObserver(
			( entries ) => {
				entries.forEach( ( entry ) => {
					if ( entry.isIntersecting ) {
						this.loadImage( entry.target );
						// Загрузили — больше не наблюдаем
						this.observer.unobserve( entry.target );
					}
				} );
			},
			{
				// Начинаем грузить за 200px до появления в вьюпорте
				rootMargin: '200px 0px',
				threshold: 0.01,
			}
		);

		this.images.forEach( ( img ) => this.observer.observe( img ) );
	}

	loadImage( img ) {
		const src = img.getAttribute( 'data-src' );
		if ( !src ) return;

		// Предзагрузка через временный Image — чтобы не было «мигания»
		const tempImage = new Image();

		tempImage.onload = () => {
			img.src = src;
			img.classList.add( 'loaded' );
			img.removeAttribute( 'data-src' );
		};

		tempImage.onerror = () => {
			console.error( 'Ошибка загрузки изображения:', src );
			img.classList.add( 'error' );
			// Оставляем data-src, чтобы можно было повторить попытку
		};

		tempImage.src = src;
	}

	loadAllImages() {
		this.images.forEach( ( img ) => this.loadImage( img ) );
	}
}

/**
 * Предзагрузка «критических» изображений (первый блок) сразу после
 * полной загрузки страницы. Ускоряет появление первого экрана.
 */
export function preloadCriticalImages() {
	const critical = document.querySelectorAll( '.image-content .lazy-image[data-src]' );
	critical.forEach( ( img ) => {
		const src = img.getAttribute( 'data-src' );
		if ( src ) new Image().src = src; // просто прогреваем кэш
	} );
}

// Вызываем предзагрузку, когда всё остальное уже загрузилось
window.addEventListener( 'load', preloadCriticalImages );