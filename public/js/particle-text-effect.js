/**
 * particle-text-effect.js
 * Vanilla JS/Canvas port of the ParticleTextEffect React component.
 * Usage: initParticleTextEffect(canvasElement, wordsArray)
 */

class Particle {
  constructor() {
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.acc = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };

    this.closeEnoughTarget = 100;
    this.maxSpeed = 1.0;
    this.maxForce = 0.1;
    this.particleSize = 10;
    this.isKilled = false;

    this.startColor = { r: 0, g: 0, b: 0 };
    this.targetColor = { r: 0, g: 0, b: 0 };
    this.colorWeight = 0;
    this.colorBlendRate = 0.01;
  }

  move() {
    let proximityMult = 1;
    const dx = this.pos.x - this.target.x;
    const dy = this.pos.y - this.target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.closeEnoughTarget) {
      proximityMult = distance / this.closeEnoughTarget;
    }

    const towardsTarget = {
      x: this.target.x - this.pos.x,
      y: this.target.y - this.pos.y,
    };

    const magnitude = Math.sqrt(towardsTarget.x ** 2 + towardsTarget.y ** 2);
    if (magnitude > 0) {
      towardsTarget.x = (towardsTarget.x / magnitude) * this.maxSpeed * proximityMult;
      towardsTarget.y = (towardsTarget.y / magnitude) * this.maxSpeed * proximityMult;
    }

    const steer = {
      x: towardsTarget.x - this.vel.x,
      y: towardsTarget.y - this.vel.y,
    };

    const steerMag = Math.sqrt(steer.x ** 2 + steer.y ** 2);
    if (steerMag > 0) {
      steer.x = (steer.x / steerMag) * this.maxForce;
      steer.y = (steer.y / steerMag) * this.maxForce;
    }

    this.acc.x += steer.x;
    this.acc.y += steer.y;
    this.vel.x += this.acc.x;
    this.vel.y += this.acc.y;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;
    this.acc.x = 0;
    this.acc.y = 0;
  }

  draw(ctx, drawAsPoints) {
    if (this.colorWeight < 1.0) {
      this.colorWeight = Math.min(this.colorWeight + this.colorBlendRate, 1.0);
    }

    const r = Math.round(this.startColor.r + (this.targetColor.r - this.startColor.r) * this.colorWeight);
    const g = Math.round(this.startColor.g + (this.targetColor.g - this.startColor.g) * this.colorWeight);
    const b = Math.round(this.startColor.b + (this.targetColor.b - this.startColor.b) * this.colorWeight);

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    if (drawAsPoints) {
      ctx.fillRect(this.pos.x, this.pos.y, 2, 2);
    } else {
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.particleSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  kill(width, height) {
    if (!this.isKilled) {
      const randomPos = _generateRandomPos(width / 2, height / 2, (width + height) / 2, width, height);
      this.target.x = randomPos.x;
      this.target.y = randomPos.y;

      this.startColor = {
        r: this.startColor.r + (this.targetColor.r - this.startColor.r) * this.colorWeight,
        g: this.startColor.g + (this.targetColor.g - this.startColor.g) * this.colorWeight,
        b: this.startColor.b + (this.targetColor.b - this.startColor.b) * this.colorWeight,
      };
      this.targetColor = { r: 0, g: 0, b: 0 };
      this.colorWeight = 0;
      this.isKilled = true;
    }
  }
}

function _generateRandomPos(cx, cy, mag, w, h) {
  const randomX = Math.random() * (w || 1000);
  const randomY = Math.random() * (h || 500);
  const dir = { x: randomX - cx, y: randomY - cy };
  const m = Math.sqrt(dir.x ** 2 + dir.y ** 2);
  if (m > 0) { dir.x = (dir.x / m) * mag; dir.y = (dir.y / m) * mag; }
  return { x: cx + dir.x, y: cy + dir.y };
}

function initParticleTextEffect(canvas, words) {
  const pixelSteps = 6;
  const drawAsPoints = true;
  const particles = [];
  let frameCount = 0;
  let wordIndex = 0;
  let animId = null;
  const mouse = { x: 0, y: 0, isPressed: false, isRightClick: false };

  // Size canvas to viewport (fixed fullscreen bg)
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function nextWord(word) {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offCtx = offscreen.getContext('2d');

    offCtx.fillStyle = 'white';
    
    // Determine dynamic font size based on screen width
    let fontSize = 100;
    offCtx.font = `bold ${fontSize}px Arial`;
    let textMetrics = offCtx.measureText(word);
    
    if (textMetrics.width > canvas.width * 0.85) {
      fontSize = Math.floor(fontSize * ((canvas.width * 0.85) / textMetrics.width));
      offCtx.font = `bold ${fontSize}px Arial`;
    }

    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.fillText(word, canvas.width / 2, canvas.height / 2);

    const imageData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    const newColor = {
      r: Math.random() * 255,
      g: Math.random() * 255,
      b: Math.random() * 255,
    };

    let particleIndex = 0;
    const coordsIndexes = [];
    for (let i = 0; i < pixels.length; i += pixelSteps * 4) {
      coordsIndexes.push(i);
    }

    // Shuffle for fluid motion
    for (let i = coordsIndexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [coordsIndexes[i], coordsIndexes[j]] = [coordsIndexes[j], coordsIndexes[i]];
    }

    for (const coordIndex of coordsIndexes) {
      const alpha = pixels[coordIndex + 3];
      if (alpha > 0) {
        const x = (coordIndex / 4) % canvas.width;
        const y = Math.floor(coordIndex / 4 / canvas.width);

        let particle;
        if (particleIndex < particles.length) {
          particle = particles[particleIndex];
          particle.isKilled = false;
          particleIndex++;
        } else {
          particle = new Particle();
          const rPos = _generateRandomPos(canvas.width / 2, canvas.height / 2, (canvas.width + canvas.height) / 2, canvas.width, canvas.height);
          particle.pos.x = rPos.x;
          particle.pos.y = rPos.y;
          particle.maxSpeed = Math.random() * 8 + 6; // slightly faster
          particle.maxForce = particle.maxSpeed * 0.05;
          particle.particleSize = Math.random() * 6 + 6;
          particle.colorBlendRate = Math.random() * 0.0275 + 0.0025;
          particles.push(particle);
        }

        particle.startColor = {
          r: particle.startColor.r + (particle.targetColor.r - particle.startColor.r) * particle.colorWeight,
          g: particle.startColor.g + (particle.targetColor.g - particle.startColor.g) * particle.colorWeight,
          b: particle.startColor.b + (particle.targetColor.b - particle.startColor.b) * particle.colorWeight,
        };
        particle.targetColor = newColor;
        particle.colorWeight = 0;
        particle.target.x = x;
        particle.target.y = y;
      }
    }

    for (let i = particleIndex; i < particles.length; i++) {
      particles[i].kill(canvas.width, canvas.height);
    }
  }

  function animate() {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.move();
      p.draw(ctx, drawAsPoints);

      if (p.isKilled) {
        if (p.pos.x < 0 || p.pos.x > canvas.width || p.pos.y < 0 || p.pos.y > canvas.height) {
          particles.splice(i, 1);
        }
      }
    }

    if (mouse.isPressed && mouse.isRightClick) {
      particles.forEach(p => {
        const dx = p.pos.x - mouse.x;
        const dy = p.pos.y - mouse.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50) {
          p.kill(canvas.width, canvas.height);
        }
      });
    }

    frameCount++;
    // Change word roughly every 7 seconds (was 240 frames = 4 seconds)
    if (frameCount % 420 === 0) {
      wordIndex = (wordIndex + 1) % words.length;
      nextWord(words[wordIndex]);
    }

    animId = requestAnimationFrame(animate);
  }

  // Init
  nextWord(words[0]);
  animate();

  // Mouse handlers on canvas
  canvas.addEventListener('mousedown', e => {
    mouse.isPressed = true;
    mouse.isRightClick = e.button === 2;
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mouseup', () => { mouse.isPressed = false; mouse.isRightClick = false; });
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Return cleanup function
  return function destroy() {
    if (animId) cancelAnimationFrame(animId);
  };
}
