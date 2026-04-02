(() => {
  const GRID_SIZE = 50;
  const CANVAS_SIZE = 700;
  const CELL = CANVAS_SIZE / GRID_SIZE;

  const MATCH_MS = 2 * 60 * 1000;
  const NORMAL_FRUIT_INTERVAL = 1000;
  const NORMAL_FRUIT_CAP = 10;
  const BIG_FRUIT_INTERVAL = 3000;
  const BIG_FRUIT_CAP = 5;
  const BIG_FRUIT_SCORE = 5;

  const DIFFICULTY = {
    easy:   { label: "Easy", baseMs: 120, aiAttackWeight: 0.45, aiShiftChance: 0.18, predictSteps: 1, name: "Basic attack" },
    normal: { label: "Normal", baseMs: 105, aiAttackWeight: 0.70, aiShiftChance: 0.35, predictSteps: 2, name: "Aggressive intercept" },
    hard:   { label: "Hard", baseMs: 92,  aiAttackWeight: 0.90, aiShiftChance: 0.60, predictSteps: 3, name: "Maximum pressure" }
  };

  const STORAGE_KEYS = {
    skin: "snake_duel_skin",
    sfx: "snake_duel_sfx",
    bgm: "snake_duel_bgm",
    volume: "snake_duel_volume"
  };

  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
  const DIRS = ["up", "down", "left", "right"];

  const screens = {
    home: document.getElementById("homeScreen"),
    game: document.getElementById("gameScreen")
  };

  const btnGoDifficulty = document.getElementById("btnGoDifficulty");
  const btnPause = document.getElementById("btnPause");
  const btnGoHomeFromGame = document.getElementById("btnGoHomeFromGame");

  const difficultyText = document.getElementById("difficultyText");
  const timerEl = document.getElementById("timer");
  const playerScoreEl = document.getElementById("playerScore");
  const aiScoreEl = document.getElementById("aiScore");
  const shiftStateEl = document.getElementById("shiftState");
  const multiplierTextEl = document.getElementById("multiplierText");
  const aiStateEl = document.getElementById("aiState");
  const aiStrategyEl = document.getElementById("aiStrategy");

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const touchControls = document.getElementById("touchControls");

  const difficultyDialog = document.getElementById("difficultyDialog");
  const modalDifficultyButtons = document.querySelectorAll(".modal-difficulty");
  const btnCloseDifficultyDialog = document.getElementById("btnCloseDifficultyDialog");

  const settingsDialog = document.getElementById("settingsDialog");
  const btnOpenSettingsFromHome = document.getElementById("btnOpenSettingsFromHome");
  const btnOpenSettingsFromGame = document.getElementById("btnOpenSettingsFromGame");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const skinSelect = document.getElementById("skinSelect");
  const sfxToggle = document.getElementById("sfxToggle");
  const bgmToggle = document.getElementById("bgmToggle");
  const volumeRange = document.getElementById("volumeRange");

  const resultDialog = document.getElementById("resultDialog");
  const finalPlayerScore = document.getElementById("finalPlayerScore");
  const finalAiScore = document.getElementById("finalAiScore");
  const winnerText = document.getElementById("winnerText");
  const btnRetry = document.getElementById("btnRetry");
  const btnGoHome = document.getElementById("btnGoHome");

  let currentScreen = "home";

  const settings = {
    skin: localStorage.getItem(STORAGE_KEYS.skin) || "classic",
    sfxEnabled: (localStorage.getItem(STORAGE_KEYS.sfx) ?? "true") === "true",
    bgmEnabled: (localStorage.getItem(STORAGE_KEYS.bgm) ?? "false") === "true",
    volume: Number(localStorage.getItem(STORAGE_KEYS.volume) || 60)
  };

  const game = {
    status: "idle",
    difficulty: "easy",
    playerSnake: [],
    aiSnake: [],
    normalFruits: [],
    bigFruits: [],
    playerDir: "right",
    playerNextDir: "right",
    aiDir: "left",
    aiNextDir: "left",
    playerScore: 0,
    aiScore: 0,
    playerShift: false,
    aiShift: false,
    startAt: 0,
    pausedAt: 0,
    pausedAccum: 0,
    lastPlayerStepTs: 0,
    lastAiStepTs: 0,
    rafId: 0,
    lastNormalFruitTs: 0,
    lastBigFruitTs: 0
  };

  const audioFiles = {
    click: new Audio("./assets/audio/click.mp3"),
    eat: new Audio("./assets/audio/eat.mp3"),
    collision: new Audio("./assets/audio/collision.mp3"),
    win: new Audio("./assets/audio/win.mp3"),
    lose: new Audio("./assets/audio/lose.mp3"),
    speedBoostOn: new Audio("./assets/audio/speed_boost_on.mp3"),
    bgm: new Audio("./assets/audio/bgm_loop.mp3")
  };
  audioFiles.bgm.loop = true;

  function setAudioVolume(v) {
    const vol = Math.max(0, Math.min(1, v / 100));
    Object.values(audioFiles).forEach(a => { a.volume = vol; });
  }

  function playSfx(name) {
    if (!settings.sfxEnabled) return;
    const src = audioFiles[name];
    if (!src) return;
    const a = src.cloneNode();
    a.volume = src.volume;
    a.play().catch(() => {});
  }

  function playBgm() {
    if (!settings.bgmEnabled) return;
    audioFiles.bgm.play().catch(() => {});
  }

  function stopBgm() {
    audioFiles.bgm.pause();
    audioFiles.bgm.currentTime = 0;
  }

  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const posKey = (p) => `${p.x},${p.y}`;
  const occupies = (snake, cell) => snake.some(s => same(s, cell));
  const round1 = (n) => Math.round(n * 10) / 10;

  function setScreen(name) {
    currentScreen = name;
    Object.values(screens).forEach(el => el.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function wrapPos(p) {
    return { x: (p.x + GRID_SIZE) % GRID_SIZE, y: (p.y + GRID_SIZE) % GRID_SIZE };
  }

  function nextPos(head, dir) {
    let x = head.x, y = head.y;
    if (dir === "up") y -= 1;
    if (dir === "down") y += 1;
    if (dir === "left") x -= 1;
    if (dir === "right") x += 1;
    return wrapPos({ x, y });
  }

  function dist(a, b) {
    const dxRaw = Math.abs(a.x - b.x);
    const dyRaw = Math.abs(a.y - b.y);
    const dx = Math.min(dxRaw, GRID_SIZE - dxRaw);
    const dy = Math.min(dyRaw, GRID_SIZE - dyRaw);
    return dx + dy;
  }

  function fmtTime(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.skin, String(settings.skin));
    localStorage.setItem(STORAGE_KEYS.sfx, String(settings.sfxEnabled));
    localStorage.setItem(STORAGE_KEYS.bgm, String(settings.bgmEnabled));
    localStorage.setItem(STORAGE_KEYS.volume, String(settings.volume));
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.skin);
  }

  function respawnSnake(which) {
    const y = Math.floor(GRID_SIZE / 2);
    if (which === "player") {
      game.playerSnake = [{ x: 6, y }, { x: 7, y }, { x: 8, y }];
      game.playerDir = "right";
      game.playerNextDir = "right";
    } else {
      game.aiSnake = [{ x: GRID_SIZE - 7, y }, { x: GRID_SIZE - 8, y }, { x: GRID_SIZE - 9, y }];
      game.aiDir = "left";
      game.aiNextDir = "left";
    }
  }

  function applyKillTransfer(victim, killer) {
    if (!killer || victim === killer) return;
    if (victim === "player") {
      const steal = round1(game.playerScore * 0.1);
      game.playerScore = round1(game.playerScore - steal);
      game.aiScore = round1(game.aiScore + steal);
    } else {
      const steal = round1(game.aiScore * 0.1);
      game.aiScore = round1(game.aiScore - steal);
      game.playerScore = round1(game.playerScore + steal);
    }
  }

  function cellOccupiedByAnySnake(cell) {
    return occupies(game.playerSnake, cell) || occupies(game.aiSnake, cell);
  }

  function randomEmptyCell() {
    while (true) {
      const c = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
      if (!cellOccupiedByAnySnake(c)) return c;
    }
  }

  function randomEmptyBigFruitTopLeft() {
    while (true) {
      const x = Math.floor(Math.random() * (GRID_SIZE - 1));
      const y = Math.floor(Math.random() * (GRID_SIZE - 1));
      const cells = [{x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}];
      if (cells.every(c => !cellOccupiedByAnySnake(c))) return { x, y };
    }
  }

  function getBigFruitCells(big) {
    return [
      { x: big.x, y: big.y },
      { x: big.x + 1, y: big.y },
      { x: big.x, y: big.y + 1 },
      { x: big.x + 1, y: big.y + 1 }
    ];
  }

  function findNormalFruitIndexAt(cell) {
    return game.normalFruits.findIndex(f => same(f, cell));
  }

  function findBigFruitIndexAt(cell) {
    return game.bigFruits.findIndex(big => getBigFruitCells(big).some(c => same(c, cell)));
  }

  function spawnNormalFruitIfNeeded(now) {
    if (now - game.lastNormalFruitTs < NORMAL_FRUIT_INTERVAL) return;
    game.lastNormalFruitTs = now;
    if (game.normalFruits.length >= NORMAL_FRUIT_CAP) return;
    game.normalFruits.push(randomEmptyCell());
  }

  function spawnBigFruitIfNeeded(now) {
    if (now - game.lastBigFruitTs < BIG_FRUIT_INTERVAL) return;
    game.lastBigFruitTs = now;
    if (game.bigFruits.length >= BIG_FRUIT_CAP) return;
    game.bigFruits.push(randomEmptyBigFruitTopLeft());
  }

  function refreshHud(now = performance.now()) {
    difficultyText.textContent = DIFFICULTY[game.difficulty].label;
    playerScoreEl.textContent = game.playerScore.toFixed(1);
    aiScoreEl.textContent = game.aiScore.toFixed(1);
    shiftStateEl.textContent = game.playerShift ? "ON" : "OFF";
    multiplierTextEl.textContent = game.playerShift ? "x1.5" : "x1.0";
    btnPause.textContent = game.status === "paused" ? "Resume" : "Pause";
    const elapsed = game.status === "idle" ? 0 : (now - game.startAt - game.pausedAccum);
    timerEl.textContent = fmtTime(MATCH_MS - elapsed);
  }

  function getNearestNormalFruit(from) {
    if (!game.normalFruits.length) return null;
    let best = game.normalFruits[0];
    let bestD = dist(from, best);
    for (const f of game.normalFruits) {
      const d = dist(from, f);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  function getNearestBigFruitCell(from) {
    if (!game.bigFruits.length) return null;
    let bestCell = null;
    let bestD = Infinity;
    for (const big of game.bigFruits) {
      for (const c of getBigFruitCells(big)) {
        const d = dist(from, c);
        if (d < bestD) {
          bestD = d;
          bestCell = c;
        }
      }
    }
    return bestCell;
  }

  function predictPlayerHead(steps) {
    let p = game.playerSnake[game.playerSnake.length - 1];
    for (let i = 0; i < steps; i++) p = nextPos(p, game.playerDir);
    return p;
  }

  function chooseAiShift(head, target, cfg) {
    if (!target) return false;
    const d = dist(head, target);
    const proximityBoost = d <= 6 ? 0.2 : d <= 10 ? 0.1 : 0;
    return Math.random() < (cfg.aiShiftChance + proximityBoost);
  }

  function chooseAiDirection() {
    const cfg = DIFFICULTY[game.difficulty];
    const head = game.aiSnake[game.aiSnake.length - 1];
    const candidates = DIRS.filter(d => OPPOSITE[d] !== game.aiDir);

    const bodySet = new Set();
    for (let i = 0; i < game.playerSnake.length - 1; i++) bodySet.add(posKey(game.playerSnake[i]));
    for (let i = 0; i < game.aiSnake.length - 1; i++) bodySet.add(posKey(game.aiSnake[i]));

    const safe = candidates.filter(d => !bodySet.has(posKey(nextPos(head, d))));
    const use = safe.length ? safe : candidates;

    const predicted = predictPlayerHead(cfg.predictSteps);
    const nearestNormal = getNearestNormalFruit(head);
    const nearestBig = getNearestBigFruitCell(head);

    let target = predicted;
    let strategy = cfg.name;

    if (nearestBig) {
      const da = dist(head, predicted);
      const db = dist(head, nearestBig);
      if (db + 1 < da) {
        target = nearestBig;
        strategy = "Big fruit rush";
      }
    } else if (nearestNormal && Math.random() > cfg.aiAttackWeight) {
      target = nearestNormal;
      strategy = "Fruit race";
    }

    game.aiShift = chooseAiShift(head, target, cfg);
    aiStateEl.textContent = game.aiShift ? "Boost pressure" : "Engaging";
    aiStrategyEl.textContent = strategy;

    return use.sort((a, b) => dist(nextPos(head, a), target) - dist(nextPos(head, b), target))[0];
  }

  function initMatch(difficultyKey) {
    game.difficulty = difficultyKey;
    game.status = "playing";
    game.playerScore = 0;
    game.aiScore = 0;
    game.playerShift = false;
    game.aiShift = false;

    respawnSnake("player");
    respawnSnake("ai");

    game.normalFruits = [];
    game.bigFruits = [];

    const now = performance.now();
    game.startAt = now;
    game.pausedAt = 0;
    game.pausedAccum = 0;
    game.lastPlayerStepTs = 0;
    game.lastAiStepTs = 0;
    game.lastNormalFruitTs = now;
    game.lastBigFruitTs = now;

    for (let i = 0; i < 3; i++) game.normalFruits.push(randomEmptyCell());
    game.bigFruits.push(randomEmptyBigFruitTopLeft());

    setScreen("game");
    refreshHud(now);
    draw();
    cancelAnimationFrame(game.rafId);
    game.rafId = requestAnimationFrame(loop);
    playBgm();
  }

  function endMatch() {
    game.status = "over";
    cancelAnimationFrame(game.rafId);
    stopBgm();

    finalPlayerScore.textContent = game.playerScore.toFixed(1);
    finalAiScore.textContent = game.aiScore.toFixed(1);

    if (game.playerScore > game.aiScore) {
      winnerText.textContent = "🏆 You Win!";
      playSfx("win");
    } else if (game.playerScore < game.aiScore) {
      winnerText.textContent = "🤖 AI Wins!";
      playSfx("lose");
    } else {
      winnerText.textContent = "⚖️ Draw!";
      playSfx("collision");
    }

    resultDialog.showModal();
  }

  function togglePause() {
    if (game.status === "playing") {
      game.status = "paused";
      game.pausedAt = performance.now();
      stopBgm();
      refreshHud(game.pausedAt);
      return;
    }
    if (game.status === "paused") {
      const now = performance.now();
      game.status = "playing";
      const delta = now - game.pausedAt;
      game.pausedAccum += delta;
      game.lastPlayerStepTs = now;
      game.lastAiStepTs = now;
      game.lastNormalFruitTs += delta;
      game.lastBigFruitTs += delta;
      playBgm();
      refreshHud(now);
    }
  }

  function moveSnake(which) {
    const isPlayer = which === "player";
    const snake = isPlayer ? game.playerSnake : game.aiSnake;
    const dir = isPlayer ? game.playerDir : game.aiDir;
    const nh = nextPos(snake[snake.length - 1], dir);

    snake.push(nh);

    let grew = false;
    let addScore = 0;

    const nIdx = findNormalFruitIndexAt(nh);
    if (nIdx >= 0) {
      game.normalFruits.splice(nIdx, 1);
      addScore += isPlayer ? (game.playerShift ? 1.5 : 1.0) : (game.aiShift ? 1.5 : 1.0);
      grew = true;
      playSfx("eat");
    }

    const bIdx = findBigFruitIndexAt(nh);
    if (bIdx >= 0) {
      game.bigFruits.splice(bIdx, 1);
      addScore += BIG_FRUIT_SCORE;
      grew = true;
      playSfx("eat");
    }

    if (!grew) snake.shift();

    if (isPlayer) game.playerScore = round1(game.playerScore + addScore);
    else game.aiScore = round1(game.aiScore + addScore);
  }

  function applyBodyCollisionPenalty() {
    const pHead = game.playerSnake[game.playerSnake.length - 1];
    const aHead = game.aiSnake[game.aiSnake.length - 1];

    const playerBody = new Set();
    const aiBody = new Set();
    for (let i = 0; i < game.playerSnake.length - 1; i++) playerBody.add(posKey(game.playerSnake[i]));
    for (let i = 0; i < game.aiSnake.length - 1; i++) aiBody.add(posKey(game.aiSnake[i]));

    const pHitPlayerBody = playerBody.has(posKey(pHead));
    const pHitAiBody = aiBody.has(posKey(pHead));
    const aHitAiBody = aiBody.has(posKey(aHead));
    const aHitPlayerBody = playerBody.has(posKey(aHead));

    if (pHitPlayerBody || pHitAiBody) {
      const killer = pHitAiBody ? "ai" : null;
      applyKillTransfer("player", killer);
      respawnSnake("player");
      playSfx("collision");
    }

    if (aHitAiBody || aHitPlayerBody) {
      const killer = aHitPlayerBody ? "player" : null;
      applyKillTransfer("ai", killer);
      respawnSnake("ai");
      playSfx("collision");
    }
  }

  function applyHeadToHeadRule() {
    const pHead = game.playerSnake[game.playerSnake.length - 1];
    const aHead = game.aiSnake[game.aiSnake.length - 1];
    if (!same(pHead, aHead)) return;

    const pLen = game.playerSnake.length;
    const aLen = game.aiSnake.length;

    if (pLen > aLen) {
      applyKillTransfer("ai", "player");
      respawnSnake("ai");
      playSfx("collision");
    } else if (aLen > pLen) {
      applyKillTransfer("player", "ai");
      respawnSnake("player");
      playSfx("collision");
    } else {
      respawnSnake("player");
      respawnSnake("ai");
      playSfx("collision");
    }
  }

  function loop(now) {
    game.rafId = requestAnimationFrame(loop);
    if (game.status !== "playing") {
      draw();
      return;
    }

    const elapsed = now - game.startAt - game.pausedAccum;
    if (elapsed >= MATCH_MS) {
      refreshHud(now);
      draw();
      endMatch();
      return;
    }

    spawnNormalFruitIfNeeded(now);
    spawnBigFruitIfNeeded(now);

    const baseMs = DIFFICULTY[game.difficulty].baseMs;
    const playerMs = game.playerShift ? baseMs / 2 : baseMs;
    const aiMs = game.aiShift ? baseMs / 2 : baseMs;

    if (!game.lastPlayerStepTs) game.lastPlayerStepTs = now;
    if (!game.lastAiStepTs) game.lastAiStepTs = now;

    if (now - game.lastPlayerStepTs >= playerMs) {
      game.lastPlayerStepTs = now;
      game.playerDir = game.playerNextDir;
      moveSnake("player");
    }

    if (now - game.lastAiStepTs >= aiMs) {
      game.lastAiStepTs = now;
      game.aiNextDir = chooseAiDirection();
      game.aiDir = game.aiNextDir;
      moveSnake("ai");
    }

    applyBodyCollisionPenalty();
    applyHeadToHeadRule();

    refreshHud(now);
    draw();
  }

  function drawGrid() {
    ctx.strokeStyle = cssVar("--grid");
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = i * CELL;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(CANVAS_SIZE, p);
      ctx.stroke();
    }
  }

  function drawCell(x, y, color, radius = 2.5) {
    const px = x * CELL, py = y * CELL;
    const pad = 1;
    const w = CELL - pad * 2, h = CELL - pad * 2;
    const r = Math.min(radius, w / 2, h / 2);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + pad + r, py + pad);
    ctx.arcTo(px + pad + w, py + pad, px + pad + w, py + pad + h, r);
    ctx.arcTo(px + pad + w, py + pad + h, px + pad, py + pad + h, r);
    ctx.arcTo(px + pad, py + pad + h, px + pad, py + pad, r);
    ctx.arcTo(px + pad, py + pad, px + pad + w, py + pad, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawSnake(snake, bodyColor, headColor) {
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      drawCell(s.x, s.y, i === snake.length - 1 ? headColor : bodyColor, i === snake.length - 1 ? 4 : 2.5);
    }
  }

  function drawFruits() {
    for (const f of game.normalFruits) drawCell(f.x, f.y, cssVar("--food"), 4);
    const bigColor = "rgba(255, 185, 0, 0.95)";
    for (const b of game.bigFruits) {
      drawCell(b.x, b.y, bigColor, 2.5);
      drawCell(b.x + 1, b.y, bigColor, 2.5);
      drawCell(b.x, b.y + 1, bigColor, 2.5);
      drawCell(b.x + 1, b.y + 1, bigColor, 2.5);
    }
  }

  function drawPauseOverlay() {
    if (game.status !== "paused") return;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Paused", CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  }

  function draw() {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawGrid();
    drawFruits();
    drawSnake(game.playerSnake, cssVar("--player-body"), cssVar("--player-head"));
    drawSnake(game.aiSnake, cssVar("--ai-body"), cssVar("--ai-head"));
    drawPauseOverlay();
  }

  function requestPlayerDir(dir) {
    if (OPPOSITE[dir] === game.playerDir) return;
    game.playerNextDir = dir;
  }

  document.addEventListener("keydown", (e) => {
    if (currentScreen !== "game") return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePause();
      return;
    }

    if (e.key === "Shift") {
      if (!game.playerShift) playSfx("speedBoostOn");
      game.playerShift = true;
      return;
    }

    const keyMap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (keyMap[e.key]) {
      e.preventDefault();
      requestPlayerDir(keyMap[e.key]);
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift") game.playerShift = false;
  });

  touchControls.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".touch-btn");
    if (!btn) return;
    requestPlayerDir(btn.dataset.dir);
  });

  function openSettings() {
    skinSelect.value = settings.skin;
    sfxToggle.checked = settings.sfxEnabled;
    bgmToggle.checked = settings.bgmEnabled;
    volumeRange.value = settings.volume;
    settingsDialog.showModal();
  }

  function readSettingsUI() {
    settings.skin = skinSelect.value;
    settings.sfxEnabled = sfxToggle.checked;
    settings.bgmEnabled = bgmToggle.checked;
    settings.volume = Number(volumeRange.value);
  }

  btnGoDifficulty.addEventListener("click", () => {
    playSfx("click");
    difficultyDialog.showModal();
  });

  modalDifficultyButtons.forEach((b) => {
    b.addEventListener("click", () => {
      playSfx("click");
      const diff = b.dataset.difficulty;
      difficultyDialog.close();
      initMatch(diff);
    });
  });

  btnCloseDifficultyDialog.addEventListener("click", () => {
    playSfx("click");
    difficultyDialog.close();
  });

  btnPause.addEventListener("click", () => {
    playSfx("click");
    togglePause();
  });

  btnGoHomeFromGame.addEventListener("click", () => {
    playSfx("click");
    cancelAnimationFrame(game.rafId);
    stopBgm();
    game.status = "idle";
    setScreen("home");
  });

  btnOpenSettingsFromHome.addEventListener("click", () => {
    playSfx("click");
    openSettings();
  });

  btnOpenSettingsFromGame.addEventListener("click", () => {
    playSfx("click");
    openSettings();
  });

  btnCloseSettings.addEventListener("click", () => {
    playSfx("click");
    readSettingsUI();
    saveSettings();
    applyTheme();
    setAudioVolume(settings.volume);

    if (game.status === "playing") {
      if (settings.bgmEnabled) playBgm();
      else stopBgm();
    }

    settingsDialog.close();
    draw();
  });

  btnRetry.addEventListener("click", () => {
    playSfx("click");
    resultDialog.close();
    initMatch(game.difficulty);
  });

  btnGoHome.addEventListener("click", () => {
    playSfx("click");
    resultDialog.close();
    setScreen("home");
  });

  function unlockAudioOnce() {
    const resume = () => {
      Object.values(audioFiles).forEach(a => { try { a.load(); } catch (_) {} });
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }

  function init() {
    applyTheme();
    setAudioVolume(settings.volume);
    setScreen("home");
    refreshHud(performance.now());
    draw();
    unlockAudioOnce();
  }

  init();
})();