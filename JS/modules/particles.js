/**
 * particles.js
 * ----------------------------------------------------------------------------
 * Canvas-анимация «созвездия»: частицы со свечением, плавным рождением
 * и смертью, связями между близкими соседями и отталкиванием от курсора.
 *
 * Почему canvas, а не DOM:
 *   • одна операция рисования на кадр вместо N записей в style.transform;
 *   • shadowBlur даёт красивое свечение бесплатно;
 *   • связи между частицами (линии) невозможны в DOM без тысяч элементов.
 *
 * Почему пул объектов:
 *   • частицы рождаются и умирают постоянно; без пула это сотни new/GC в секунду;
 *   • пул фиксированного размера, new только при инициализации;
 *   • «смерть» = сброс параметров и возврат в пул, «рождение» = acquire().
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
		// Количество частиц
		particleCount: isLowPower ? 40 : 80,

		// Размер
		size: { min: 1.5, max: 4 },

		// Скорость
		speed: { min: 0.15, max: 0.6 },

		// Время жизни (мс)
		lifetime: { min: 6000, max: 14000 },

		// Плавное появление/угасание (мс)
		fadeIn: 800,
		fadeOut: 1200,

		// Связи между частицами
		linkDistance: isLowPower ? 100 : 140,  // макс. расстояние для линии
		linkMaxWidth: 1,                       // толщина линии
		linkMaxAlpha: 0.35,                    // прозрачность линии

		// Свечение
		glowBlur: isLowPower ? 8 : 15,

		// Взаимодействие с мышью
		mouseDist: 150,
		mouseForce: 0.15,

		// Цвета (тёплая палитра)
		colors: [
			'#FFD700', '#FFA500', '#FF8C00', '#FF6347', '#FF4500',
			'#FFEC8B', '#FFFACD', '#FFFFE0', '#FAFAD2', '#EEE8AA',
		],
	};

	// ------------------------------------------------------------------
	// 2. Кэш размеров окна + DPR
	// ------------------------------------------------------------------
	const viewport = {
		width: window.innerWidth,
		height: window.innerHeight,
		dpr: Math.min( window.devicePixelRatio || 1, 2 ), // выше 2 — оверкилл
	};

	// ------------------------------------------------------------------
	// 3. Canvas
	// ------------------------------------------------------------------
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'particles-canvas';
	container.appendChild( canvas );

	const ctx = canvas.getContext( '2d', {
		// alpha: true — фон прозрачный, сквозь canvas видно градиенты sun-rays
		alpha: true,
		// desynchronized — подсказка браузеру рисовать без синхронизации с композитором,
		// может снизить задержку (работает в Chrome/Edge)
		desynchronized: true,
	} );

	/**
	 * Подгонка canvas под размер окна с учётом DPR.
	 * CSS-размер = viewport, реальный буфер = viewport × dpr.
	 * ctx.scale(dpr, dpr) — дальше рисуем в CSS-координатах.
	 */
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
			// Поля инициализируются в reset(), чтобы pool мог переиспользовать
			// объект без new.
			this.reset();
			// Жива ли сейчас (участвует ли в отрисовке)
			this.alive = false;
		}

		/**
		 * Сброс параметров к новым случайным значениям.
		 * Вызывается при создании и при каждом «возрождении».
		 */
		reset() {
			this.size =
				Math.random() * ( settings.size.max - settings.size.min ) + settings.size.min;

			// Стартовая позиция — в пределах экрана
			this.x = Math.random() * viewport.width;
			this.y = Math.random() * viewport.height;

			// Скорость
			const speed =
				Math.random() * ( settings.speed.max - settings.speed.min ) + settings.speed.min;
			const angle = Math.random() * Math.PI * 2;
			this.vx = Math.cos( angle ) * speed;
			this.vy = Math.sin( angle ) * speed;

			// Цвет
			this.color = settings.colors[Math.floor( Math.random() * settings.colors.length )];

			// Время жизни
			this.lifetime =
				Math.random() * ( settings.lifetime.max - settings.lifetime.min ) +
				settings.lifetime.min;
			this.age = 0;

			// Текущая прозрачность (плавно меняется в update)
			this.alpha = 0;

			// Смещение от отталкивания мышью (влияет на отрисовку, не на x/y)
			this.offsetX = 0;
			this.offsetY = 0;
		}

		/**
		 * Обновление за кадр. dt — миллисекунды с прошлого кадра
		 * (нормализует скорость на разных мониторах — 60 Гц vs 120 Гц).
		 */
		update( dt ) {
			if ( !this.alive ) return;

			// Нормализованный множитель: 1.0 при 60 fps
			const k = dt / 16.67;

			this.age += dt;

			// --- Позиция ---
			this.x += this.vx * k;
			this.y += this.vy * k;

			// --- Отскок от границ ---
			if ( this.x < 0 ) { this.x = 0; this.vx *= -1; }
			if ( this.x > viewport.width ) { this.x = viewport.width; this.vx *= -1; }
			if ( this.y < 0 ) { this.y = 0; this.vy *= -1; }
			if ( this.y > viewport.height ) { this.y = viewport.height; this.vy *= -1; }

			// --- Отталкивание от курсора ---
			// Плавно тянем offset к целевой точке, не меняя x/y.
			// Так частица «убегает» визуально, но продолжает жить по своим законам.
			let targetOffsetX = 0;
			let targetOffsetY = 0;
			if ( mouse.x !== undefined ) {
				const dx = this.x - mouse.x;
				const dy = this.y - mouse.y;
				const distSq = dx * dx + dy * dy;
				const maxSq = settings.mouseDist * settings.mouseDist;
				if ( distSq < maxSq ) {
					const dist = Math.sqrt( distSq ) || 1;
					const force = ( settings.mouseDist - dist ) / settings.mouseDist;
					targetOffsetX = ( dx / dist ) * force * 60;
					targetOffsetY = ( dy / dist ) * force * 60;
				}
			}
			// Лерп (линейная интерполяция) — плавное смещение
			this.offsetX += ( targetOffsetX - this.offsetX ) * 0.15 * k;
			this.offsetY += ( targetOffsetY - this.offsetY ) * 0.15 * k;

			// --- Прозрачность: fade-in / fade-out ---
			if ( this.age < settings.fadeIn ) {
				// Появление
				this.alpha = this.age / settings.fadeIn;
			} else if ( this.age > this.lifetime - settings.fadeOut ) {
				// Угасание
				this.alpha = ( this.lifetime - this.age ) / settings.fadeOut;
			} else {
				// Полная яркость
				this.alpha = 1;
			}

			// Защита от отрицательной альфы из-за погрешностей
			if ( this.alpha < 0 ) this.alpha = 0;

			// --- Проверка смерти ---
			if ( this.age >= this.lifetime ) {
				this.alive = false;
			}
		}

		/**
		 * Отрисовка. Вызывается из renderer после обновления всех частиц.
		 * Координаты — CSS-пиксели (ctx уже отмасштабирован на DPR).
		 */
		draw( ctx ) {
			if ( !this.alive || this.alpha <= 0 ) return;

			const x = this.x + this.offsetX;
			const y = this.y + this.offsetY;

			ctx.globalAlpha = this.alpha;

			// Свечение: shadowBlur + shadowColor (дорого, но красиво).
			// На слабых устройствах отключаем — визуально всё равно сойдёт.
			if ( !isLowPower ) {
				ctx.shadowBlur = settings.glowBlur;
				ctx.shadowColor = this.color;
			}

			ctx.fillStyle = this.color;
			ctx.beginPath();
			ctx.arc( x, y, this.size, 0, Math.PI * 2 );
			ctx.fill();

			// Сбрасываем shadow после отрисовки, чтобы не влиять на следующую частицу
			if ( !isLowPower ) {
				ctx.shadowBlur = 0;
			}
		}
	}

	// ------------------------------------------------------------------
	// 5. ParticlePool — пул объектов
	// ------------------------------------------------------------------
	const pool = {
		items: [],
		size: settings.particleCount,

		/**
		 * Инициализация пула: создаём сразу N мёртвых частиц.
		 * Дальше — только переиспользование.
		 */
		init() {
			for ( let i = 0; i < this.size; i++ ) {
				const p = new Particle();
				// Частицы стартуют мёртвыми; их разбудит spawnDead()
				p.alive = false;
				this.items.push( p );
			}
		},

		/**
		 * «Разбудить» мёртвые частицы: сбрасываем параметры и делаем живыми.
		 * Возвращает количество разбуженных (для отладки/статистики).
		 */
		spawnDead() {
			let spawned = 0;
			for ( const p of this.items ) {
				if ( !p.alive ) {
					p.reset();
					p.alive = true;
					spawned++;
				}
			}
			return spawned;
		},

		/**
		 * Обновить все живые частицы.
		 */
		update( dt ) {
			for ( const p of this.items ) {
				p.update( dt );
			}
			// После обновления некоторые могли умереть — сразу заполняем пустоту,
			// чтобы количество живых частиц оставалось стабильным.
			this.spawnDead();
		},

		/**
		 * Отрисовать все живые частицы.
		 */
		draw( ctx ) {
			for ( const p of this.items ) {
				p.draw( ctx );
			}
		},

		/**
		 * Живые частицы (для отрисовки связей).
		 */
		getAlive() {
			return this.items.filter( ( p ) => p.alive && p.alpha > 0 );
		},
	};

	pool.init();

	// ------------------------------------------------------------------
	// 6. Состояние анимации и курсор
	// ------------------------------------------------------------------
	let rafId = null;
	let isRunning = false;
	let isDestroyed = false;
	let lastTime = 0;

	const mouse = { x: undefined, y: undefined };

	// ------------------------------------------------------------------
	// 7. Отрисовка связей
	// ------------------------------------------------------------------
	/**
	 * Рисует линии между близкими частицами.
	 * O(n²) — для 80 частиц это 3160 проверок/кадр, приемлемо.
	 * Для 200+ частиц нужен spatial hash, но нам не нужно.
	 */
	function drawLinks( aliveParticles ) {
		const maxDist = settings.linkDistance;
		const maxDistSq = maxDist * maxDist;
		const len = aliveParticles.length;

		ctx.shadowBlur = 0; // связи — без свечения, чтобы не тормозило

		for ( let i = 0; i < len; i++ ) {
			const a = aliveParticles[i];
			const ax = a.x + a.offsetX;
			const ay = a.y + a.offsetY;

			for ( let j = i + 1; j < len; j++ ) {
				const b = aliveParticles[j];
				const dx = ( b.x + b.offsetX ) - ax;
				const dy = ( b.y + b.offsetY ) - ay;
				const distSq = dx * dx + dy * dy;
				if ( distSq > maxDistSq ) continue;

				const dist = Math.sqrt( distSq );
				// Прозрачность линии: ближе — ярче
				const alpha = ( 1 - dist / maxDist ) * settings.linkMaxAlpha;
				// Учитываем прозрачность частиц — связь «проявляется» вместе с ними
				const finalAlpha = alpha * Math.min( a.alpha, b.alpha );

				ctx.globalAlpha = finalAlpha;
				ctx.strokeStyle = a.color;
				ctx.lineWidth = ( 1 - dist / maxDist ) * settings.linkMaxWidth;
				ctx.beginPath();
				ctx.moveTo( ax, ay );
				ctx.lineTo( b.x + b.offsetX, b.y + b.offsetY );
				ctx.stroke();
			}
		}
		ctx.globalAlpha = 1;
	}

	// ------------------------------------------------------------------
	// 8. Главный цикл
	// ------------------------------------------------------------------
	function frame( now ) {
		if ( !isRunning ) return;

		// dt — миллисекунды с прошлого кадра. Ограничиваем 50 мс, чтобы после
		// паузы (вкладка была скрыта) частицы не «телепортировались».
		const dt = Math.min( now - lastTime, 50 );
		lastTime = now;

		// 1. Очистка canvas (полная, с учётом DPR)
		ctx.clearRect( 0, 0, viewport.width, viewport.height );

		// 2. Обновление физики
		pool.update( dt );

		// 3. Связи (рисуем ДО частиц, чтобы частицы были поверх)
		const alive = pool.getAlive();
		drawLinks( alive );

		// 4. Частицы
		pool.draw( ctx );

		rafId = requestAnimationFrame( frame );
	}

	// ------------------------------------------------------------------
	// 9. Управление
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
	// 10. События
	// ------------------------------------------------------------------
	function onMouseMove( e ) {
		mouse.x = e.clientX;
		mouse.y = e.clientY;
	}

	function onMouseLeave( e ) {
		if ( !e.relatedTarget && !e.toElement ) {
			mouse.x = undefined;
			mouse.y = undefined;
		}
	}

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
			// Частицы, вышедшие за новые границы, сами «отскокнутся» в update
			// благодаря проверке границ. Пересоздавать пул не нужно.
		}, 250 );
	}

	function onReducedMotionChange( e ) {
		if ( e.matches ) destroy();
	}

	// ------------------------------------------------------------------
	// 11. Подписка
	// ------------------------------------------------------------------
	document.addEventListener( 'mousemove', onMouseMove, { passive: true } );
	document.addEventListener( 'mouseleave', onMouseLeave );
	window.addEventListener( 'resize', onResize, { passive: true } );
	document.addEventListener( 'visibilitychange', onVisibilityChange );
	window.addEventListener( 'orientationchange', onResize, { passive: true } );

	if ( typeof prefersReducedMotion.addEventListener === 'function' ) {
		prefersReducedMotion.addEventListener( 'change', onReducedMotionChange );
	}

	// ------------------------------------------------------------------
	// 12. Старт
	// ------------------------------------------------------------------
	pool.spawnDead();
	start();

	// ------------------------------------------------------------------
	// 13. Публичный API
	// ------------------------------------------------------------------
	return {
		start,
		stop,
		destroy() {
			document.removeEventListener( 'mousemove', onMouseMove );
			document.removeEventListener( 'mouseleave', onMouseLeave );
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