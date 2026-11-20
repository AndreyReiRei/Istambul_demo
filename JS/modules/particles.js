/**
 * particles.js
 * ----------------------------------------------------------------------------
 * Canvas-анимация «Стамбул: солнце и звёзды» + тумблер эффектов.
 *
 * Два типа частиц:
 *   • sun (70%) — тёплые круглые блики, всплывают снизу вверх, мерцают;
 *   • star (30%) — холодные звёзды, вспыхивают в верхней части экрана.
 *
 * Тумблер:
 *   • кнопка .effects-toggle в правом верхнем углу;
 *   • состояние сохраняется в localStorage (переживает перезагрузку);
 *   • иконка меняется: ON (✦) / OFF (○);
 *   • при выключении частицы останавливаются И canvas очищается;
 *   • CSS-анимации (блики карточек, .sun-rays) отключаются классом
 *     .effects-off на <html>;
 *   • модалка учитывает состояние через setEnabled — при закрытии
 *     модалки выключенные эффекты не включаются обратно.
 *
 * Порядок секций:
 *   0. prefers-reduced-motion
 *   1. localStorage
 *   2. настройки
 *   3. viewport + canvas
 *   4. класс Particle
 *   5. пул объектов
 *   6. состояние анимации
 *   7. главный цикл
 *   8. управление (start/stop/setEnabled/isEnabled/destroy)
 *   9. события
 *  10. подписка
 *  11. старт
 *  12. публичный API
 *
 * Публичный API:
 *   const fx = initParticleAnimation();
 *   fx.start();            // возобновить (если не выключено пользователем)
 *   fx.stop();             // пауза (модалка, скрытая вкладка)
 *   fx.setEnabled(value);  // принудительно вкл/выкл (тумблер)
 *   fx.isEnabled();        // текущее состояние
 *   fx.isAvailable();      // реально ли работает анимация
 *   fx.destroy();          // полностью удалить canvas и отписаться
 *
 *   initEffectsToggle(fx); // подключить кнопку-тумблер
 * ----------------------------------------------------------------------------
 */

const STORAGE_KEY = 'istanbul-effects-enabled';

/**
 * Пустой API — возвращается, если анимация недоступна
 * (нет контейнера или пользователь просил меньше движения).
 * isAvailable() = false — тумблер не будет управлять localStorage
 * и классом .effects-off.
 */
function createEmptyAPI() {
	return {
		start() { },
		stop() { },
		destroy() { },
		setEnabled() { },
		isEnabled() { return false; },
		isAvailable() { return false; },
	};
}

export function initParticleAnimation() {
	const container = document.getElementById( 'background-animation' );
	if ( !container ) return createEmptyAPI();

	// ------------------------------------------------------------------
	// 0. Уважение prefers-reduced-motion
	// ------------------------------------------------------------------
	const prefersReducedMotion = window.matchMedia( '(prefers-reduced-motion: reduce)' );
	if ( prefersReducedMotion.matches ) {
		return createEmptyAPI();
	}

	// ------------------------------------------------------------------
	// 1. Состояние пользователя (из localStorage)
	// ------------------------------------------------------------------
	let userDisabled = false;
	try {
		userDisabled = localStorage.getItem( STORAGE_KEY ) === 'false';
	} catch ( e ) {
		// localStorage недоступен — считаем, что включено
	}

	// ------------------------------------------------------------------
	// 2. Настройки
	// ------------------------------------------------------------------
	const isMobile = window.innerWidth < 768;
	const isLowPower = isMobile || navigator.hardwareConcurrency <= 4;

	const settings = {
		particleCount: isLowPower ? 35 : 70,

		sun: {
			ratio: 0.7,
			size: { min: 2, max: 5 },
			speed: { min: 0.1, max: 0.4 },
			lifetime: { min: 4000, max: 9000 },
			glowBlur: isLowPower ? 6 : 12,
			colors: ['#FFD700', '#FFC107', '#FFE082', '#FFB300', '#FFF59D'],
			twinkle: true,
		},

		star: {
			ratio: 0.3,
			size: { min: 1, max: 3 },
			lifetime: { min: 2500, max: 6000 },
			glowBlur: isLowPower ? 5 : 10,
			colors: ['#6bdcff', '#a8e6ff', '#e8f4f8', '#ffffff', '#85e3ff'],
			zoneTop: 0.5,
		},

		fadeIn: 800,
		fadeOut: 1200,
	};

	// ------------------------------------------------------------------
	// 3. Viewport + canvas
	// ------------------------------------------------------------------
	const viewport = {
		width: window.innerWidth,
		height: window.innerHeight,
		dpr: Math.min( window.devicePixelRatio || 1, 2 ),
	};

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

	/** Полная очистка canvas (в CSS-координатах). */
	function clearCanvas() {
		ctx.clearRect( 0, 0, viewport.width, viewport.height );
	}

	// ------------------------------------------------------------------
	// 4. Класс Particle
	// ------------------------------------------------------------------
	class Particle {
		constructor() {
			this.reset();
			this.alive = false;
		}

		reset() {
			const isSun = Math.random() < settings.sun.ratio;
			this.type = isSun ? 'sun' : 'star';
			const cfg = settings[this.type];

			this.size = Math.random() * ( cfg.size.max - cfg.size.min ) + cfg.size.min;

			if ( this.type === 'sun' ) {
				this.x = Math.random() * viewport.width;
				this.y = viewport.height * 0.4 + Math.random() * viewport.height * 0.6;
				const speed = Math.random() * ( cfg.speed.max - cfg.speed.min ) + cfg.speed.min;
				this.vy = -speed;
				this.vx = ( Math.random() - 0.5 ) * 0.15;
			} else {
				this.x = Math.random() * viewport.width;
				this.y = Math.random() * viewport.height * cfg.zoneTop;
				this.vx = 0;
				this.vy = 0;
			}

			this.color = cfg.colors[Math.floor( Math.random() * cfg.colors.length )];
			this.lifetime = Math.random() * ( cfg.lifetime.max - cfg.lifetime.min ) + cfg.lifetime.min;
			this.age = 0;
			this.alpha = 0;
			this.prevX = this.x;
			this.prevY = this.y;
		}

		update( dt ) {
			if ( !this.alive ) return;

			const k = dt / 16.67;
			this.age += dt;

			// Движение — только у солнца
			if ( this.type === 'sun' ) {
				this.prevX = this.x;
				this.prevY = this.y;

				this.x += this.vx * k + Math.sin( this.age / 1000 ) * 0.1 * k;
				this.y += this.vy * k;

				if ( this.x < 0 ) { this.x = 0; this.vx *= -1; }
				if ( this.x > viewport.width ) { this.x = viewport.width; this.vx *= -1; }
			}

			// Прозрачность: fade-in / fade-out
			if ( this.age < settings.fadeIn ) {
				this.alpha = this.age / settings.fadeIn;
			} else if ( this.age > this.lifetime - settings.fadeOut ) {
				this.alpha = ( this.lifetime - this.age ) / settings.fadeOut;
			} else {
				this.alpha = 1;
			}

			// Мерцание — только у солнца
			if ( settings[this.type].twinkle ) {
				this.alpha *= 0.7 + 0.3 * Math.sin( this.age / 500 );
			}

			// Вспышка — только у звезды
			if ( this.type === 'star' ) {
				const flash = Math.sin( ( this.age / this.lifetime ) * Math.PI );
				this.alpha *= 0.3 + 0.7 * flash;
			}

			if ( this.alpha < 0 ) this.alpha = 0;

			// Смерть
			if ( this.age >= this.lifetime || this.y < -10 ) {
				this.alive = false;
			}
		}

		draw( ctx ) {
			if ( !this.alive || this.alpha <= 0 ) return;

			const cfg = settings[this.type];

			// Хвост — только у солнца
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

			ctx.globalAlpha = this.alpha;

			if ( !isLowPower ) {
				ctx.shadowBlur = cfg.glowBlur;
				ctx.shadowColor = this.color;
			}

			ctx.fillStyle = this.color;

			if ( this.type === 'sun' ) {
				ctx.beginPath();
				ctx.arc( this.x, this.y, this.size, 0, Math.PI * 2 );
				ctx.fill();
			} else {
				this.drawStar( ctx );
			}

			if ( !isLowPower ) {
				ctx.shadowBlur = 0;
			}
		}

		drawStar( ctx ) {
			ctx.beginPath();
			ctx.arc( this.x, this.y, this.size, 0, Math.PI * 2 );
			ctx.fill();

			const rayLen = this.size * 3.5;
			ctx.strokeStyle = this.color;
			ctx.lineWidth = this.size * 0.4;
			ctx.lineCap = 'round';

			ctx.beginPath();
			ctx.moveTo( this.x, this.y - this.size );
			ctx.lineTo( this.x, this.y - rayLen );
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo( this.x, this.y + this.size );
			ctx.lineTo( this.x, this.y + rayLen );
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo( this.x - this.size, this.y );
			ctx.lineTo( this.x - rayLen, this.y );
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo( this.x + this.size, this.y );
			ctx.lineTo( this.x + rayLen, this.y );
			ctx.stroke();
		}
	}

	// ------------------------------------------------------------------
	// 5. Пул объектов
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

		clearCanvas();
		pool.update( dt );
		pool.draw( ctx );

		rafId = requestAnimationFrame( frame );
	}

	// ------------------------------------------------------------------
	// 8. Управление
	// ------------------------------------------------------------------
	/**
	 * Возобновить анимацию.
	 * Ничего не делает, если:
	 *   • пользователь выключил тумблером (userDisabled);
	 *   • уже запущено (isRunning);
	 *   • уничтожено (isDestroyed).
	 */
	function start() {
		if ( userDisabled || isDestroyed || isRunning ) return;
		isRunning = true;
		lastTime = performance.now();
		rafId = requestAnimationFrame( frame );
	}

	/**
	 * Пауза. Canvas не очищается — последний кадр остаётся.
	 * Используется для модалки и скрытой вкладки: частицы не видно,
	 * а при возврате они мгновенно продолжают с того же места.
	 */
	function stop() {
		isRunning = false;
		if ( rafId !== null ) {
			cancelAnimationFrame( rafId );
			rafId = null;
		}
	}

	/**
	 * Принудительно включить/выключить (тумблер).
	 * Сохраняет состояние в localStorage.
	 * При выключении — останавливает И очищает canvas.
	 */
	function setEnabled( value ) {
		userDisabled = !value;

		try {
			localStorage.setItem( STORAGE_KEY, String( value ) );
		} catch ( e ) {
			// localStorage недоступен — молча игнорируем
		}

		if ( value ) {
			start();
		} else {
			stop();
			clearCanvas();   // ← ключевое: частицы исчезают
		}
	}

	function isEnabled() {
		return !userDisabled;
	}

	function isAvailable() {
		return true;   // реальный контроллер
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
		} else if ( !isDestroyed && !userDisabled ) {
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

	if ( !userDisabled ) {
		start();
	}

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
		setEnabled,
		isEnabled,
		isAvailable,
	};
}

/**
 * initEffectsToggle
 * ----------------------------------------------------------------------------
 * Подключает кнопку-тумблер к контроллеру частиц.
 *
 * Управляет ДВУМЯ вещами:
 *   1. Canvas-частицами (через controller.setEnabled);
 *   2. CSS-анимациями карточек и фона (класс .effects-off на <html>).
 *
 * Если контроллер недоступен (controller.isAvailable() === false),
 * тумблер скрывается — управлять нечем.
 *
 * Состояние сохраняется в localStorage внутри контроллера.
 *
 * @param {{ setEnabled: Function, isEnabled: Function, isAvailable: Function }} controller
 */
export function initEffectsToggle( controller ) {
	const btn = document.getElementById( 'effects-toggle' );
	if ( !btn || !controller ) return;

	// Если анимация недоступна (prefers-reduced-motion, нет контейнера) —
	// скрываем тумблер: управлять нечем.
	if ( !controller.isAvailable() ) {
		btn.style.display = 'none';
		return;
	}

	const iconEl = btn.querySelector( '.effects-toggle__icon' );
	let enabled = controller.isEnabled();

	/**
	 * Применяет состояние к DOM и UI.
	 * @param {boolean} value
	 */
	function apply( value ) {
		document.documentElement.classList.toggle( 'effects-off', !value );

		btn.setAttribute( 'aria-pressed', String( value ) );
		btn.title = value ? 'Выключить фоновые эффекты' : 'Включить фоновые эффекты';
		btn.setAttribute( 'aria-label', value ? 'Выключить фоновые эффекты' : 'Включить фоновые эффекты' );

		if ( iconEl ) {
			iconEl.textContent = value ? '✦' : '○';
		}
	}

	// Начальное состояние
	apply( enabled );

	// Переключение
	btn.addEventListener( 'click', () => {
		enabled = !enabled;
		controller.setEnabled( enabled );
		apply( enabled );
	} );
}