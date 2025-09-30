const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const healthBar = document.getElementById('health-bar');
const gameUI = document.getElementById('game-ui');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const powerupScreen = document.getElementById('powerup-screen');
const powerupOptions = document.getElementById('powerup-options');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
const winScreen = document.getElementById('win-screen');
const continueButton = document.getElementById('continue-button');
const restartWinButton = document.getElementById('restart-win-button');
const inventorySlots = document.querySelectorAll('.inventory-slot');
const waveWarningEl = document.getElementById('wave-warning');

canvas.width = 800;
canvas.height = 600;

// Game State Variables
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };
let score, lives, gameState, player, bullets, enemies, particles, pickups, obstacles, grenades, meteors;
let scoreIntervalForPowerup, powerupsAwarded;
let endlessMode;
let waveInfo;
let stars = [];
let lastTime = 0;
let enemySpawnTimer = 0;
let obstacleSpawnTimer = 0;

const powerupList = [
    { name: '雙倍射速', duration: 10000, effect: () => { player.fireRate /= 2; }, reverse: () => { player.fireRate *= 2; } },
    { name: '強力護盾', duration: 15000, effect: () => { player.shielded = true; }, reverse: () => { player.shielded = false; } },
    { name: '子彈穿透', duration: 12000, effect: () => { player.piercing = true; }, reverse: () => { player.piercing = false; } },
    { name: '移動速度加快', duration: 20000, effect: () => { player.speed *= 1.5; }, reverse: () => { player.speed /= 1.5; } },
    { name: '三向射擊', duration: 15000, effect: () => { player.tripleShot = true; }, reverse: () => { player.tripleShot = false; } }
];

// --- CLASSES (Full definitions as before) ---
class Player {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.size = 15;
        this.angle = 0;
        this.speed = 4;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.fireRate = 250;
        this.lastShot = 0;
        this.shielded = false;
        this.piercing = false;
        this.tripleShot = false;
        this.activePowerups = [];
        this.inventory = [];
    }
    update(deltaTime) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        this.angle = Math.atan2(dy, dx);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > this.size) {
            let nextX = this.x + (dx / distance) * this.speed;
            let nextY = this.y + (dy / distance) * this.speed;
            let collision = false;
            for (const obstacle of obstacles) {
                if (nextX + this.size > obstacle.x && nextX - this.size < obstacle.x + obstacle.width &&
                    nextY + this.size > obstacle.y && nextY - this.size < obstacle.y + obstacle.height) {
                    collision = true;
                    break;
                }
            }
            if (!collision) { this.x = nextX; this.y = nextY; }
        }
        this.updatePowerups(deltaTime);
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#0af';
        ctx.beginPath();
        ctx.moveTo(this.size, 0);
        ctx.lineTo(-this.size / 2, this.size / 2);
        ctx.lineTo(-this.size / 2, -this.size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (this.shielded) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size + 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
    shoot() {
        const now = Date.now();
        if (now - this.lastShot > this.fireRate) {
            this.lastShot = now;
            bullets.push(new Bullet(this.x, this.y, this.angle));
            if (this.tripleShot) {
                bullets.push(new Bullet(this.x, this.y, this.angle - 0.25));
                bullets.push(new Bullet(this.x, this.y, this.angle + 0.25));
            }
        }
    }
    takeDamage(amount) {
        if (this.shielded) return;
        this.health -= amount;
        if (this.health <= 0) {
            lives--;
            if (lives > 0) { this.health = this.maxHealth; } else { setGameState('gameover'); }
        }
    }
    addPowerup(powerup) {
        powerup.effect();
        const active = { ...powerup, timeLeft: powerup.duration };
        this.activePowerups.push(active);
    }
    updatePowerups(deltaTime) {
        for (let i = this.activePowerups.length - 1; i >= 0; i--) {
            const p = this.activePowerups[i];
            p.timeLeft -= deltaTime;
            if (p.timeLeft <= 0) {
                p.reverse();
                this.activePowerups.splice(i, 1);
            }
        }
    }
}
class Bullet { constructor(x, y, angle) { this.x = x; this.y = y; this.angle = angle; this.speed = 10; this.size = 5; } update() { this.x += Math.cos(this.angle) * this.speed; this.y += Math.sin(this.angle) * this.speed; } draw() { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); } }
class Enemy { constructor(x, y) { this.x = x; this.y = y; let difficultyMultiplier = 1 + score / 20000 + (endlessMode ? 0.5 : 0); this.speed = (Math.random() * 0.8 + 0.5) * difficultyMultiplier; } update() { if (!player) return; const dx = player.x - this.x; const dy = player.y - this.y; const angle = Math.atan2(dy, dx); this.x += Math.cos(angle) * this.speed; this.y += Math.sin(angle) * this.speed; } }
class RedEnemy extends Enemy { constructor(x, y) { super(x, y); this.size = 20; this.color = '#f44'; this.scoreValue = 100; } draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); } }
class YellowEnemy extends Enemy { constructor(x, y) { super(x, y); this.size = 25; this.color = '#ff0'; this.scoreValue = 100; } draw() { ctx.fillStyle = this.color; ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size); ctx.restore(); } explode() { for (let i = 0; i < 50; i++) { particles.push(new Particle(this.x, this.y, this.color, Math.random() * 5 + 2)); } const explosionRadius = 100; enemies.forEach(enemy => { if (enemy !== this) { const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y); if (dist < explosionRadius) { enemy.isHit = true; addScore(enemy.scoreValue); for (let i = 0; i < 20; i++) { particles.push(new Particle(enemy.x, enemy.y, enemy.color, Math.random() * 3 + 1)); } } } }); } }
class Particle { constructor(x, y, color, size) { this.x = x; this.y = y; this.color = color; this.size = size; this.velocity = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 }; this.alpha = 1; } update() { this.x += this.velocity.x; this.y += this.velocity.y; this.alpha -= 0.02; } draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } }
class Pickup { constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.size = 10; } draw() { if (this.type === 'grenade') { ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = '12px Arial'; ctx.fillText('G', this.x - 4, this.y + 4); } else { ctx.fillStyle = this.type === 'health' ? '#0f0' : '#f00'; ctx.fillRect(this.x - this.size, this.y - this.size / 4, this.size * 2, this.size / 2); ctx.fillRect(this.x - this.size / 4, this.y - this.size, this.size / 2, this.size * 2); } } applyEffect() { if (this.type === 'health') { player.health = Math.min(player.maxHealth, player.health + 25); } else if (this.type === 'poison') { player.takeDamage(25); } else if (this.type === 'grenade') { if (player.inventory.length < 3) { player.inventory.push('grenade'); return true; } return false; } return true; } }
class Grenade { constructor(x, y) { this.x = x; this.y = y; this.timer = 2000; this.radius = 10; } update(deltaTime) { this.timer -= deltaTime; if (this.timer <= 0) { this.explode(); } } draw() { ctx.fillStyle = `rgba(255, 152, 0, ${this.timer / 2000})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); } explode() { const explosionRadius = 150; for (let i = 0; i < 100; i++) { particles.push(new Particle(this.x, this.y, '#ff9800', Math.random() * 6 + 2)); } for (let i = enemies.length - 1; i >= 0; i--) { const enemy = enemies[i]; const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y); if (dist < explosionRadius) { addScore(enemy.scoreValue); enemies.splice(i, 1); } } } }
class Obstacle { constructor(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; } update(deltaTime) {} }
class PurpleWall extends Obstacle { constructor(x, y, width, height) { super(x, y, width, height); this.health = 100; this.color = '#9400D3'; } takeDamage(amount) { this.health -= amount; } draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); } }
class WhiteWall extends Obstacle { constructor(x, y, width, height) { super(x, y, width, height); this.lifetime = 10000; this.color = 'rgba(255, 255, 255, 0.8)'; } update(deltaTime) { this.lifetime -= deltaTime; } draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); } }
class Meteor { constructor() { this.x = Math.random() * canvas.width; this.y = -50; this.size = Math.random() * 30 + 10; this.speed = Math.random() * 3 + 2; } update() { this.y += this.speed; } draw() { ctx.fillStyle = '#a52a2a'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); } }

// --- FUNCTIONS ---

function init() {
    score = 0;
    lives = 3;
    endlessMode = false;
    scoreIntervalForPowerup = 1000;
    powerupsAwarded = 0; // BUGFIX: Initialize counter
    player = new Player();
    bullets = []; enemies = []; particles = []; pickups = []; obstacles = []; grenades = []; meteors = [];
    waveInfo = { w5ktriggered: false, w6ktriggered: false, lastWaveTime: 0, warningActive: false, warningText: '', warningTimer: 0 };
    if (stars.length === 0) createStars();
    setGameState('start');
}

function setGameState(newState) {
    gameState = newState;
    gameUI.style.display = 'none';
    startScreen.style.display = 'none';
    pauseScreen.style.display = 'none';
    powerupScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    winScreen.style.display = 'none';
    waveWarningEl.style.display = 'none';

    switch (newState) {
        case 'playing': gameUI.style.display = 'flex'; break;
        case 'start': startScreen.style.display = 'flex'; break;
        case 'paused': pauseScreen.style.display = 'flex'; break;
        case 'powerup': displayPowerupChoices(); powerupScreen.style.display = 'flex'; break;
        case 'gameover': finalScoreEl.textContent = score; gameOverScreen.style.display = 'flex'; break;
        case 'won': winScreen.style.display = 'flex'; break;
    }
}

// BUGFIX: Corrected powerup trigger logic
function addScore(value) {
    if (gameState !== 'playing') return;
    score += value;
    if (score >= 20000 && !endlessMode) {
        setGameState('won');
        return;
    }
    
    const nextPowerupScore = (powerupsAwarded + 1) * scoreIntervalForPowerup;
    if (score >= nextPowerupScore) {
        powerupsAwarded++;
        setGameState('powerup');
    }
}

function createStars() {
    for (let i = 0; i < 200; i++) {
        stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 2, alpha: Math.random() });
    }
}

function drawStars() {
    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        ctx.globalAlpha = star.alpha;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = 0; y = Math.random() * canvas.height; }
    else if (side === 1) { x = canvas.width; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = 0; }
    else { x = Math.random() * canvas.width; y = canvas.height; }

    if (Math.random() < 0.2) {
        enemies.push(new YellowEnemy(x, y));
    } else {
        enemies.push(new RedEnemy(x, y));
    }
}

function spawnWave(count) {
    for (let i = 0; i < count; i++) {
        setTimeout(spawnEnemy, i * 100);
    }
}

function triggerWave(text, count) {
    waveInfo.warningText = text;
    waveInfo.warningActive = true;
    waveInfo.warningTimer = 3000;
    setTimeout(() => spawnWave(count), 3000);
}

function checkWaveSpawns(timestamp) {
    const waveCooldown = endlessMode ? 10000 : 20000;
    if (score >= 5000 && !waveInfo.w5ktriggered) {
        waveInfo.w5ktriggered = true;
        triggerWave('警告！大量敵人來襲！', 20);
        waveInfo.lastWaveTime = timestamp;
    }
    if (score >= 6000 && !waveInfo.w6ktriggered) {
        waveInfo.w6ktriggered = true;
        triggerWave('警告！', 15);
        waveInfo.lastWaveTime = timestamp;
    }
    if (score > 6000 && timestamp - waveInfo.lastWaveTime > waveCooldown) {
        if (Math.random() < (endlessMode ? 0.5 : 0.3)) {
            triggerWave('警告！', Math.floor(Math.random() * 10) + (endlessMode ? 20 : 15));
            waveInfo.lastWaveTime = timestamp;
        }
    }
}

function spawnPickup() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const rand = Math.random();
    let type;
    const poisonChance = endlessMode ? 0.4 : 0.2;
    if (rand < 0.1) { type = 'grenade'; }
    else if (rand < 0.1 + poisonChance) { type = 'poison'; }
    else { type = 'health'; }
    pickups.push(new Pickup(x, y, type));
}

function spawnObstacle() {
    const x = Math.random() * (canvas.width - 100);
    const y = Math.random() * (canvas.height - 100);
    const width = Math.random() * 80 + 20;
    const height = Math.random() * 80 + 20;

    if (Math.random() < 0.5) {
        obstacles.push(new PurpleWall(x, y, width, height));
    } else {
        obstacles.push(new WhiteWall(x, y, width, height));
    }
}

function spawnMeteor() {
    if (score > 10000 && Math.random() < (endlessMode ? 0.03 : 0.01)) {
        meteors.push(new Meteor());
    }
}

function updateUI() {
    scoreEl.textContent = `分數: ${score}`;
    livesEl.textContent = `生命: ${lives}`;
    healthBar.style.width = `${(player.health / player.maxHealth) * 100}%`;
    healthBar.style.backgroundColor = player.health > 50 ? '#0f0' : player.health > 25 ? '#ff0' : '#f00';
    updateInventoryUI();
}

function updateInventoryUI() {
    inventorySlots.forEach((slot, index) => {
        slot.textContent = player.inventory[index] === 'grenade' ? 'G' : '';
    });
}

function drawWaveWarning(deltaTime) {
    if (waveInfo.warningActive) {
        waveWarningEl.style.display = 'block';
        waveWarningEl.textContent = waveInfo.warningText;
        waveWarningEl.style.opacity = waveInfo.warningTimer / 3000;
        waveInfo.warningTimer -= deltaTime;
        if (waveInfo.warningTimer <= 0) {
            waveInfo.warningActive = false;
            waveWarningEl.style.display = 'none';
        }
    }
}

function handleCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const bullet = bullets[i];
            const enemy = enemies[j];
            if (!bullet || !enemy) continue;
            if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < bullet.size + enemy.size / 2) {
                if (!player.piercing) bullets.splice(i, 1);
                addScore(enemy.scoreValue);
                if (enemy instanceof YellowEnemy) enemy.explode();
                else for (let k = 0; k < 10; k++) particles.push(new Particle(enemy.x, enemy.y, enemy.color, Math.random() * 2 + 1));
                enemies.splice(j, 1);
                if (Math.random() < 0.1) spawnPickup();
                break;
            }
        }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = obstacles.length - 1; j >= 0; j--) {
            const bullet = bullets[i];
            const obstacle = obstacles[j];
            if (!bullet || !obstacle) continue;
            if (bullet.x > obstacle.x && bullet.x < obstacle.x + obstacle.width && bullet.y > obstacle.y && bullet.y < obstacle.y + obstacle.height) {
                if (obstacle instanceof PurpleWall) {
                    obstacle.takeDamage(20);
                    if (obstacle.health <= 0) obstacles.splice(j, 1);
                }
                bullets.splice(i, 1);
                break;
            }
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (enemy.isHit) { enemies.splice(i, 1); continue; }
        if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < player.size + enemy.size / 2) {
            player.takeDamage(20);
            enemies.splice(i, 1);
            for (let k = 0; k < 10; k++) particles.push(new Particle(enemy.x, enemy.y, enemy.color, Math.random() * 2 + 1));
        }
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i];
        if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < player.size + pickup.size) {
            if (pickup.applyEffect()) pickups.splice(i, 1);
        }
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
        const meteor = meteors[i];
        if (Math.hypot(player.x - meteor.x, player.y - meteor.y) < player.size + meteor.size) {
            player.takeDamage(40);
            meteors.splice(i, 1);
            continue;
        }
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (Math.hypot(enemies[j].x - meteor.x, enemies[j].y - meteor.y) < enemies[j].size / 2 + meteor.size) {
                enemies.splice(j, 1);
                break;
            }
        }
    }
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    if (gameState === 'playing') {
        const enemyInterval = endlessMode ? 500 : 1000;
        const obstacleInterval = endlessMode ? 4000 : 8000;

        player.update(deltaTime);
        bullets.forEach(b => b.update());
        enemies.forEach(e => e.update());
        particles.forEach(p => p.update());
        obstacles.forEach(o => o.update(deltaTime));
        grenades.forEach(g => g.update(deltaTime));
        meteors.forEach(m => m.update());

        enemySpawnTimer += deltaTime;
        if (enemySpawnTimer > enemyInterval && !waveInfo.warningActive) {
            enemySpawnTimer = 0;
            spawnEnemy();
        }
        obstacleSpawnTimer += deltaTime;
        if (obstacleSpawnTimer > obstacleInterval) {
            obstacleSpawnTimer = 0;
            spawnObstacle();
        }
        checkWaveSpawns(timestamp);
        spawnMeteor();

        handleCollisions();

        bullets = bullets.filter(b => b.x > 0 && b.x < canvas.width && b.y > 0 && b.y < canvas.height);
        particles = particles.filter(p => p.alpha > 0);
        obstacles = obstacles.filter(o => !(o.lifetime && o.lifetime <= 0) && !(o.health && o.health <= 0));
        grenades = grenades.filter(g => g.timer > 0);
        meteors = meteors.filter(m => m.y < canvas.height + 50);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStars();
    obstacles.forEach(o => o.draw());
    pickups.forEach(p => p.draw());
    if (gameState !== 'gameover' && gameState !== 'start') player.draw();
    bullets.forEach(b => b.draw());
    enemies.forEach(e => e.draw());
    particles.forEach(p => p.draw());
    grenades.forEach(g => g.draw());
    meteors.forEach(m => m.draw());

    if (gameState === 'playing') updateUI();
    drawWaveWarning(deltaTime);

    requestAnimationFrame(gameLoop);
}

function useGrenade() {
    if (player.inventory.length > 0 && gameState === 'playing') {
        player.inventory.pop();
        grenades.push(new Grenade(player.x, player.y));
    }
}

function displayPowerupChoices() {
    powerupOptions.innerHTML = '';
    const available = [...powerupList];
    for (let i = 0; i < 2; i++) {
        if (available.length === 0) break;
        const randIndex = Math.floor(Math.random() * available.length);
        const choice = available.splice(randIndex, 1)[0];
        const button = document.createElement('button');
        button.textContent = `${choice.name} (${choice.duration / 1000}秒)`;
        button.onclick = () => {
            player.addPowerup(choice);
            setGameState('playing');
        };
        powerupOptions.appendChild(button);
    }
}

// --- EVENT LISTENERS ---
window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

window.addEventListener('mousedown', e => {
    if (gameState === 'playing' && e.button === 0) {
        player.shoot();
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'Enter') {
        if (gameState === 'start') {
            setGameState('playing');
        } else if (gameState === 'gameover') {
            init();
        }
    }
    if (e.code === 'Space' && (gameState === 'playing' || gameState === 'paused')) {
        e.preventDefault();
        setGameState(gameState === 'playing' ? 'paused' : 'playing');
    }
    if (e.code === 'KeyQ' && gameState === 'playing') {
        useGrenade();
    }
});

continueButton.addEventListener('click', () => {
    endlessMode = true;
    scoreIntervalForPowerup = 1500;
    powerupsAwarded = Math.floor(score / scoreIntervalForPowerup); // Adjust for new interval
    setGameState('playing');
});

restartButton.addEventListener('click', init);
restartWinButton.addEventListener('click', init);

// --- START GAME ---
init();
requestAnimationFrame(gameLoop);