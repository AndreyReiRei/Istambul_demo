/**
 * particles.js
 * ----------------------------------------------------------------------------
 * Canvas-анимация «Стамбул: солнце и звёзды».
 *
 * Два типа частиц:
 *   • sun (70%) — тёплые круглые блики, всплывают снизу вверх, мерцают;
 *   • star (30%) — холодные звёзды, вспыхивают в верхней части экрана,
 *     гаснут и появляются в новом месте.
 *
 * Каждая частица оставляет полупрозрачный «хвост» — эффект движения.
 *
 * Публичный API:
 *   const fx = initParticleAnimation();
 *   fx.stop();     // пауза (например, при открытии модалки)
 *   fx.start();    // возобновить
 *   fx.destroy();  // полностью удалить canvas и отписаться от событий
 * ----------------------------------------------------------------------------
 */

export function initParticleAnimation() {
	const container = document.getElementById( 'background-animation' );
	if ( !container ) {
		return { stop() { }, start() { }, destroy() { } };
	}

	// ------------------------------------------------------------------
	// 0. Уважение prefers-reduced-motion
	// ------------------------------------------------------------------
	const prefersReducedMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' );
	if ( prefersReducedMotion.matches ) {
		return { stop() { }, start() { }, destroy() { } };
	}

	// ------------------------------------------------------------------
	// 1. Настройки
	// ------------------------------------------------------------------
	const isMobile = window.innerWidth < 768;
	const isLowPower = isMobile || navigator.hardwareConcurrency <= 4;

	const settings = {
		particleCount: isLowPower ? 35 : 70,

		// Солнечные блики (70% частиц)
		sun: {
			ratio: 0.7,
			size: { min: 2, max: 5 },
			speed: { min: 0.1, max: 0.4 },     // медленно вверх
			lifetime: { min: 4000, max: 9000 },
			glowBlur: isLowPower ? 6 : 12,
			colors: ['#FFD700', '#FFC107', '#FFE082', '#FFB300', '#FFF59D'],
			twinkle: true,
		},

		// Звёзды (30% частиц) — вспыхивают сверху
		star: {
			ratio: 0.3,
			size: { min: 1, max: 3 },
			lifetime: { min: 2500, max: 6000 }, // живут меньше — чаще вспыхивают
			glowBlur: isLowPower ? 5 : 10,
			colors: ['#6bdcff', '#a8e6ff', '#e8f4f8', '#ffffff', '#85e3ff'],
			// Верхняя часть экрана, где появляются звёзды (доля высоты)
			zoneTop: 0.5,
		},

		// Плавное появление/угасание (мс)
		fadeIn: 800,
		fadeOut: 1200,

		// След: длина хвоста (для солнца)
		trailLength: isLowPower ? 2 : 4,
	};

	// ------------------------------------------------------------------
	// 2. Кэш размеров окна + DPR
	// ------------------------------------------------------------------
	const viewport = {
		width: window.innerWidth,
		height: window.innerHeight,
		dpr: Math.min( window.devicePixelRatio || 1, 2 ),
	};

	// ------------------------------------------------------------------
	// 3. Canvas
	// ------------------------------------------------------------------
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'particles-canvas';
	container.appendChild( canvas );

	const ctx = canvas.getContext( '2d', {
		alpha: true,
		desynchronized: true,
	} );

	function resizeCanvas() {
		viewport.width = window.innerWidth;
		viewport.height = window.innerHeight;
		viewport.dpr = Math.min( window.devicePixelRatio || 1, 2 );

		canvas.width = viewport.width * viewport.dpr;
		canvas.height = viewport.height * viewport.dpr;
		canvas.style.width = `${viewport.width}px`;
		canvas.style.height = `${viewport.height}px`;

		ctx.setTransform( viewport.dpr, 0, 0, viewport.dpr, 0, 0 );
	}
	resizeCanvas();

	// ------------------------------------------------------------------
	// 4. Класс Particle — с жизненным циклом
	// ------------------------------------------------------------------
	class Particle {
		constructor() {
			this.reset();
			this.alive = false;
		}

		/**
		 * Сброс параметров: случайный тип (sun/star) и все поля под него.
		 */
		reset() {
			const isSun = Math.random() < settings.sun.ratio;
			this.type = isSun ? 'sun' : 'star';
			const cfg = settings[this.type];

			this.size = Math.random() * ( cfg.size.max - cfg.size.min ) + cfg.size.min;

			if ( this.type === 'sun' ) {
				// Солнце: стартует в нижней части и всплывает вверх
				this.x = Math.random() * viewport.width;
				this.y = viewport.height * 0.4 + Math.random() * viewport.height * 0.6;

				const speed = Math.random() * ( cfg.speed.max - cfg.speed.min ) + cfg.speed.min;
				this.vy = -speed;                     // вверх
				this.vx = ( Math.random() - 0.5 ) * 0.15; // лёгкое покачивание
			} else {
				// Звезда: появляется в верхней зоне, стоит на месте,
				// вспыхивает и гаснет (без движения)
				this.x = Math.random() * viewport.width;
				this.y = Math.random() * viewport.height * cfg.zoneTop;

				this.vx = 0;
				this.vy = 0;
			}

			this.color = cfg.colors[Math.floor( Math.random() * cfg.colors.length )];
			this.lifetime = Math.random() * ( cfg.lifetime.max - cfg.lifetime.min ) + cfg.lifetime.min;
			this.age = 0;
			this.alpha = 0;

			// Для хвоста
			this.prevX = this.x;
			this.prevY = this.y;
		}

		/**
		 * Обновление за кадр. dt — миллисекунды с прошлого кадра.
		 */
		update( dt ) {
			if ( !this.alive ) return;

			const k = dt / 16.67;
			this.age += dt;

			// --- Движение (только солнце) ---
			if ( this.type === 'sun' ) {
				this.prevX = this.x;
				this.prevY = this.y;

				this.x += this.vx * k + Math.sin( this.age / 1000 ) * 0.1 * k;
				this.y += this.vy * k;

				// Отскок от боковых границ
				if ( this.x < 0 ) { this.x = 0; this.vx *= -1; }
				if ( this.x > viewport.width ) { this.x = viewport.width; this.vx *= -1; }
			}

			// --- Прозрачность ---
			// fade-in: появление. fade-out: угасание.
			// Для звезды добавляем «вспышку» в середине жизни:
			// alpha быстро растёт, потом медленно гаснет — как пульс.
			const fadeIn = settings.fadeIn;
			const fadeOut = settings.fadeOut;

			if ( this.age < fadeIn ) {
				this.alpha = this.age / fadeIn;
			} else if ( this.age > this.lifetime - fadeOut ) {
				this.alpha = ( this.lifetime - this.age ) / fadeOut;
			} else {
				this.alpha = 1;
			}

			// Мерцание — только для солнца
			if ( settings[this.type].twinkle ) {
				this.alpha *= 0.7 + 0.3 * Math.sin( this.age / 500 );
			}

			// Для звезды — короткая яркая вспышка в середине жизни
			if ( this.type === 'star' ) {
				const flash = Math.sin( ( this.age / this.lifetime ) * Math.PI ); // 0 → 1 → 0
				this.alpha *= 0.3 + 0.7 * flash;
			}

			if ( this.alpha < 0 ) this.alpha = 0;

			// Смерть
			if ( this.age >= this.lifetime || this.y < -10 ) {
				this.alive = false;
			}
		}

		/**
		 * Отрисовка.
		 */
		draw( ctx ) {
			if ( !this.alive || this.alpha <= 0 ) return;

			const cfg = settings[this.type];

			// --- Хвост (только солнце) ---
			if ( this.type === 'sun' && this.age > settings.fadeIn ) {
				ctx.globalAlpha = this.alpha * 0.4;
				ctx.strokeStyle = this.color;
				ctx.lineWidth = this.size * 0.6;
				ctx.lineCap = 'round';
				ctx.beginPath();
				ctx.moveTo( this.prevX, this.prevY );
				ctx.lineTo( this.x, this.y );
				ctx.stroke();
			}

			// --- Тело частицы ---
			ctx.globalAlpha = this.alpha;

			if ( !isLowPower ) {
				ctx.shadowBlur = cfg.glowBlur;
				ctx.shadowColor = this.color;
			}

			ctx.fillStyle = this.color;

			if ( this.type === 'sun' ) {
				// Солнце — круг
				ctx.beginPath();
				ctx.arc( this.x, this.y, this.size, 0, Math.PI * 2 );
				ctx.fill();
			} else {
				// Звезда — четырёхлучевая: маленький круг + 4 луча
				this.drawStar( ctx );
			}

			if ( !isLowPower ) {
				ctx.shadowBlur = 0;
			}
		}

		/**
		 * Рисует звезду: маленький круг в центре + 4 расходящихся луча.
		 * Лучи тонкие и полупрозрачные — создают «вспышку».
		 */
		drawStar( ctx ) {
			// Центральный круг
			ctx.beginPath();
			ctx.arc( this.x, this.y, this.size, 0, Math.PI * 2 );
			ctx.fill();

			// 4 луча (крест) — тонкие линии от центра
			const rayLen = this.size * 3.5;
			ctx.strokeStyle = this.color;
			ctx.lineWidth = this.size * 0.4;
			ctx.lineCap = 'round';

			// Верхний луч
			ctx.beginPath();
			ctx.moveTo( this.x, this.y - this.size );
			ctx.lineTo( this.x, this.y - rayLen );
			ctx.stroke();

			// Нижний луч
			ctx.beginPath();
			ctx.moveTo( this.x, this.y + this.size );
			ctx.lineTo( this.x, this.y + rayLen );
			ctx.stroke();

			// Левый луч
			ctx.beginPath();
			ctx.moveTo( this.x - this.size, this.y );
			ctx.lineTo( this.x - rayLen, this.y );
			ctx.stroke();

			// Правый луч
			ctx.beginPath();
			ctx.moveTo( this.x + this.size, this.y );
			ctx.lineTo( this.x + rayLen, this.y );
			ctx.stroke();
		}
	}

	// ------------------------------------------------------------------
	// 5. ParticlePool — пул объектов
	// ------------------------------------------------------------------
	const pool = {
		items: [],
		size: settings.particleCount,

		init() {
			for ( let i = 0; i < this.size; i++ ) {
				const p = new Particle();
				p.alive = false;
				this.items.push( p );
			}
		},

		spawnDead() {
			for ( const p of this.items ) {
				if ( !p.alive ) {
					p.reset();
					p.alive = true;
				}
			}
		},

		update( dt ) {
			for ( const p of this.items ) {
				p.update( dt );
			}
			this.spawnDead();
		},

		draw( ctx ) {
			for ( const p of this.items ) {
				p.draw( ctx );
			}
		},
	};

	pool.init();

	// ------------------------------------------------------------------
	// 6. Состояние анимации
	// ------------------------------------------------------------------
	let rafId = null;
	let isRunning = false;
	let isDestroyed = false;
	let lastTime = 0;

	// ------------------------------------------------------------------
	// 7. Главный цикл
	// ------------------------------------------------------------------
	function frame( now ) {
		if ( !isRunning ) return;

		const dt = Math.min( now - lastTime, 50 );
		lastTime = now;

		ctx.clearRect( 0, 0, viewport.width, viewport.height );

		pool.update( dt );
		pool.draw( ctx );

		rafId = requestAnimationFrame( frame );
	}

	// ------------------------------------------------------------------
	// 8. Управление
	// ------------------------------------------------------------------
	function start() {
		if ( isDestroyed || isRunning ) return;
		isRunning = true;
		lastTime = performance.now();
		rafId = requestAnimationFrame( frame );
	}

	function stop() {
		isRunning = false;
		if ( rafId !== null ) {
			cancelAnimationFrame( rafId );
			rafId = null;
		}
	}

	function destroy() {
		isDestroyed = true;
		stop();
		canvas.remove();
	}

	// ------------------------------------------------------------------
	// 9. События
	// ------------------------------------------------------------------
	function onVisibilityChange() {
		if ( document.hidden ) {
			stop();
		} else if ( !isDestroyed ) {
			start();
		}
	}

	let resizeTimer = null;
	function onResize() {
		clearTimeout( resizeTimer );
		resizeTimer = setTimeout( () => {
			resizeCanvas();
		}, 250 );
	}

	function onReducedMotionChange( e ) {
		if ( e.matches ) destroy();
	}

	// ------------------------------------------------------------------
	// 10. Подписка
	// ------------------------------------------------------------------
	window.addEventListener( 'resize', onResize, { passive: true } );
	document.addEventListener( 'visibilitychange', onVisibilityChange );
	window.addEventListener( 'orientationchange', onResize, { passive: true } );

	if ( typeof prefersReducedMotion.addEventListener === 'function' ) {
		prefersReducedMotion.addEventListener( 'change', onReducedMotionChange );
	}

	// ------------------------------------------------------------------
	// 11. Старт
	// ------------------------------------------------------------------
	pool.spawnDead();
	start();

	// ------------------------------------------------------------------
	// 12. Публичный API
	// ------------------------------------------------------------------
	return {
		start,
		stop,
		destroy() {
			window.removeEventListener( 'resize', onResize );
			window.removeEventListener( 'orientationchange', onResize );
			document.removeEventListener( 'visibilitychange', onVisibilityChange );
			if ( typeof prefersReducedMotion.removeEventListener === 'function' ) {
				prefersReducedMotion.removeEventListener( 'change', onReducedMotionChange );
			}
			clearTimeout( resizeTimer );
			destroy();
		},
	};
}