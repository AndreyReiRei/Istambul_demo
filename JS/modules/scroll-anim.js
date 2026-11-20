/**
 * scroll-anim.js
 * Появление блоков .content-block при скролле (fade-in + сдвиг вверх).
 */

export function initScrollAnimations() {
	const blocks = document.querySelectorAll( '.content-block' );
	if ( blocks.length === 0 ) return;

	// Fallback для старых браузеров
	if ( !( 'IntersectionObserver' in window ) ) {
		blocks.forEach( ( b ) => b.classList.add( 'visible' ) );
		return;
	}

	const observer = new IntersectionObserver(
		( entries ) => {
			entries.forEach( ( entry ) => {
				if ( entry.isIntersecting ) {
					entry.target.classList.add( 'visible' );
					observer.unobserve( entry.target ); // анимируем один раз
				}
			} );
		},
		{
			threshold: 0.1,
			rootMargin: '0px 0px -50px 0px',
		}
	);

	blocks.forEach( ( b ) => observer.observe( b ) );
}