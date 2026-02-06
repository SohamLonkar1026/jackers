/**
 * Vanilla JS vapour text effect - particle vaporize animation for "JACKERS"
 * Same behavior as the React vapour-text-effect component, no dependencies.
 */
(function () {
  'use strict';

  var dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) * 1.5 : 1;

  function parseColor(color) {
    var rgb = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    var rgba = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (rgba) return 'rgba(' + rgba[1] + ', ' + rgba[2] + ', ' + rgba[3] + ', ' + rgba[4] + ')';
    if (rgb) return 'rgba(' + rgb[1] + ', ' + rgb[2] + ', ' + rgb[3] + ', 1)';
    return 'rgba(0, 0, 0, 1)';
  }

  function createParticles(ctx, canvas, text, textX, textY, font, color, alignment) {
    var particles = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = alignment;
    ctx.textBaseline = 'middle';

    var metrics = ctx.measureText(text);
    var textWidth = metrics.width;
    var textLeft = alignment === 'center' ? textX - textWidth / 2 : alignment === 'left' ? textX : textX - textWidth;
    var textBoundaries = { left: textLeft, right: textLeft + textWidth, width: textWidth };

    ctx.fillText(text, textX, textY);
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;
    var sampleRate = Math.max(1, Math.round(dpr / 2));

    for (var y = 0; y < canvas.height; y += sampleRate) {
      for (var x = 0; x < canvas.width; x += sampleRate) {
        var i = (y * canvas.width + x) * 4;
        var alpha = data[i + 3];
        if (alpha > 0) {
          var oa = (alpha / 255) * (sampleRate / dpr);
          particles.push({
            x: x, y: y,
            originalX: x, originalY: y,
            color: 'rgba(' + data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + oa + ')',
            opacity: oa, originalAlpha: oa,
            velocityX: 0, velocityY: 0, angle: 0, speed: 0
          });
        }
      }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return { particles: particles, textBoundaries: textBoundaries };
  }

  function updateParticles(particles, vaporizeX, deltaTime, spread, duration, direction, density) {
    var allDone = true;
    var multSpread = spread * 5;
    particles.forEach(function (p) {
      var shouldVaporize = direction === 'left-to-right' ? p.originalX <= vaporizeX : p.originalX >= vaporizeX;
      if (shouldVaporize) {
        if (p.speed === 0) {
          p.angle = Math.random() * Math.PI * 2;
          p.speed = (Math.random() + 0.5) * multSpread;
          p.velocityX = Math.cos(p.angle) * p.speed;
          p.velocityY = Math.sin(p.angle) * p.speed;
          p.shouldFadeQuickly = Math.random() > density;
        }
        if (p.shouldFadeQuickly) {
          p.opacity = Math.max(0, p.opacity - deltaTime);
        } else {
          var dx = p.originalX - p.x, dy = p.originalY - p.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var damp = Math.max(0.95, 1 - dist / (100 * multSpread));
          p.velocityX = (p.velocityX + (Math.random() - 0.5) * multSpread * 3 + dx * 0.002) * damp;
          p.velocityY = (p.velocityY + (Math.random() - 0.5) * multSpread * 3 + dy * 0.002) * damp;
          var maxV = multSpread * 2;
          var v = Math.sqrt(p.velocityX * p.velocityX + p.velocityY * p.velocityY);
          if (v > maxV) { p.velocityX *= maxV / v; p.velocityY *= maxV / v; }
          p.x += p.velocityX * deltaTime * 20;
          p.y += p.velocityY * deltaTime * 10;
          p.opacity = Math.max(0, p.opacity - deltaTime * 0.25 * (2000 / duration));
        }
        if (p.opacity > 0.01) allDone = false;
      } else {
        allDone = false;
      }
    });
    return allDone;
  }

  function renderParticles(ctx, particles) {
    ctx.save();
    ctx.scale(dpr, dpr);
    particles.forEach(function (p) {
      if (p.opacity > 0) {
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, p.opacity + ')');
        ctx.fillRect(p.x / dpr, p.y / dpr, 1.5, 1.5);
      }
    });
    ctx.restore();
  }

  function resetParticles(particles) {
    particles.forEach(function (p) {
      p.x = p.originalX;
      p.y = p.originalY;
      p.opacity = p.originalAlpha;
      p.speed = 0;
      p.velocityX = 0;
      p.velocityY = 0;
    });
  }

  function initVapourTitle(options) {
    options = options || {};
    var wrapper = options.wrapper;
    var text = options.text !== undefined ? options.text : 'JACKERS';
    var fontFamily = options.fontFamily || "'Righteous', sans-serif";
    var fontSize = options.fontSize || 50;
    var color = options.color || 'rgb(51, 51, 51)';
    var vaporizeDuration = (options.vaporizeDuration || 2) * 1000;
    var fadeInDuration = (options.fadeInDuration || 1) * 1000;
    var waitDuration = (options.waitDuration || 0.5) * 1000;

    if (!wrapper) return;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    wrapper.innerHTML = '';
    wrapper.appendChild(canvas);
    wrapper.style.pointerEvents = 'none';

    var state = { width: 0, height: 0 };
    var particles = [];
    var textBoundaries = null;
    var phase = 'static'; // static | vaporizing | fadingIn | waiting
    var vaporProgress = 0;
    var fadeOpacity = 0;
    var lastTime = 0;
    var rafId = null;
    var font = '600 ' + (fontSize * dpr) + 'px ' + fontFamily;
    var parsedColor = parseColor(color);
    var spread = 5;
    var density = 0.6;

    function resize() {
      var w = wrapper.clientWidth || 300;
      var h = wrapper.clientHeight || 80;
      if (state.width === w && state.height === h) return;
      state.width = w;
      state.height = h;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      renderCanvas();
    }

    function renderCanvas() {
      if (!ctx || !state.width || !state.height) return;
      var cw = canvas.width;
      var ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      var textX = cw / 2;
      var textY = ch / 2;
      var result = createParticles(ctx, canvas, text, textX, textY, font, parsedColor, 'center');
      particles = result.particles;
      canvas.textBoundaries = result.textBoundaries;
      textBoundaries = result.textBoundaries;
    }

    function loop(now) {
      var delta = (now - lastTime) / 1000;
      lastTime = now;

      if (!ctx || !particles.length) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (phase === 'static') {
        renderParticles(ctx, particles);
      } else if (phase === 'vaporizing') {
        vaporProgress += delta * (100 / (vaporizeDuration / 1000));
        if (!textBoundaries) {
          rafId = requestAnimationFrame(loop);
          return;
        }
        var progress = Math.min(100, vaporProgress);
        var vaporizeX = textBoundaries.left + (textBoundaries.width * progress / 100);
        var allDone = updateParticles(particles, vaporizeX, delta, spread, vaporizeDuration, 'left-to-right', density);
        renderParticles(ctx, particles);
        if (vaporProgress >= 100 && allDone) {
          phase = 'fadingIn';
          fadeOpacity = 0;
        }
      } else if (phase === 'fadingIn') {
        fadeOpacity += delta * 1000 / fadeInDuration;
        ctx.save();
        ctx.scale(dpr, dpr);
        particles.forEach(function (p) {
          p.x = p.originalX;
          p.y = p.originalY;
          var op = Math.min(fadeOpacity, 1) * p.originalAlpha;
          ctx.fillStyle = p.color.replace(/[\d.]+\)$/, op + ')');
          ctx.fillRect(p.x / dpr, p.y / dpr, 1.5, 1.5);
        });
        ctx.restore();
        if (fadeOpacity >= 1) {
          phase = 'waiting';
          setTimeout(function () {
            phase = 'vaporizing';
            vaporProgress = 0;
            resetParticles(particles);
          }, waitDuration);
        }
      } else if (phase === 'waiting') {
        renderParticles(ctx, particles);
      }

      rafId = requestAnimationFrame(loop);
    }

    function startAnimation() {
      phase = 'vaporizing';
      vaporProgress = 0;
      lastTime = performance.now();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }

    resize();
    var ro = new ResizeObserver(function () {
      resize();
    });
    ro.observe(wrapper);

    // Start vaporize after a short delay so font is ready
    setTimeout(function () {
      renderCanvas();
      startAnimation();
    }, 100);
  }

  window.initVapourTitle = initVapourTitle;
})();
