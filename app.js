(() => {
  'use strict';

  const canvas = document.querySelector('#ocean');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    depth: $('depthValue'), oxygen: $('oxygenText'), energy: $('energyText'), hull: $('hullText'),
    oxygenBar: $('oxygenBar'), energyBar: $('energyBar'), hullBar: $('hullBar'), fragments: $('fragments'),
    mission: $('missionTitle'), log: $('log'), ping: $('pingBtn'), silent: $('silentBtn'), repair: $('repairBtn'),
    samples: $('samples'), zone: $('zoneName'), targetDepth: $('targetDepth'), action: $('actionBtn'),
    ballast: $('ballastMode'), crewCount: $('crewCount'), credits: $('credits'), crewSlots: $('crewSlots'), crewCards: $('crewCards'),
    intro: $('intro'), end: $('endScreen'), journal: $('journal'), crewScreen: $('crewScreen'), journalEntries: $('journalEntries'),
    endEyebrow: $('endEyebrow'), endTitle: $('endTitle'), endText: $('endText'), best: $('bestRun')
  };

  const WORLD = 3600;
  const crewCatalog = [
    { id: 'sonar', icon: '◉', name: 'Мира Волкова', role: 'ГИДРОАКУСТИК', cost: 480, skill: 'Дальность сонара +30%, импульс расходует меньше энергии.' },
    { id: 'engineer', icon: '⚙', name: 'Илья Корин', role: 'БОРТИНЖЕНЕР', cost: 420, skill: 'Усиленный ремонт и ускоренное восстановление энергии.' },
    { id: 'biologist', icon: '⌁', name: 'Ада Лин', role: 'КСЕНОБИОЛОГ', cost: 390, skill: 'Биообразцы дают больше кислорода и исследовательских кредитов.' }
  ];
  let profile = loadProfile();
  let dpr = 1, w = 0, h = 0, last = 0, running = false, audio = null, audioNodes = null, nextCreak = 0;
  let state, entities, particles, ripples, bubbles, messages, startedAt;

  function seededRandom(seed = 7749) {
    let n = seed >>> 0;
    return () => ((n = Math.imul(1664525, n) + 1013904223 >>> 0) / 4294967296);
  }

  function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem('depth-profile') || 'null');
      if (saved && Array.isArray(saved.crew)) return { credits: Number(saved.credits) || 0, crew: saved.crew.filter(id => crewCatalog.some(c => c.id === id)).slice(0, 2) };
    } catch (_) {}
    return { credits: 1000, crew: [] };
  }

  function saveProfile() { localStorage.setItem('depth-profile', JSON.stringify(profile)); }
  function hasCrew(id) { return (state?.crew || profile.crew).includes(id); }

  function renderCrew() {
    ui.credits.textContent = profile.credits;
    ui.crewSlots.textContent = profile.crew.length;
    ui.crewCount.textContent = `${profile.crew.length}/2`;
    ui.crewCards.innerHTML = crewCatalog.map(person => {
      const hired = profile.crew.includes(person.id);
      const blocked = !hired && (profile.crew.length >= 2 || profile.credits < person.cost);
      return `<article class="crew-card${hired ? ' hired' : ''}"><div class="crew-portrait">${person.icon}</div><h3>${person.name}</h3><small>${person.role}</small><p>${person.skill}</p><button type="button" data-crew="${person.id}"${blocked ? ' disabled' : ''}>${hired ? 'В ЭКИПАЖЕ · УБРАТЬ' : `НАНЯТЬ · ${person.cost} CR`}</button></article>`;
    }).join('');
    ui.crewCards.querySelectorAll('[data-crew]').forEach(button => button.addEventListener('click', () => toggleCrew(button.dataset.crew)));
  }

  function toggleCrew(id) {
    const person = crewCatalog.find(c => c.id === id); if (!person) return;
    const index = profile.crew.indexOf(id);
    if (index >= 0) { profile.crew.splice(index, 1); profile.credits += person.cost; }
    else if (profile.crew.length < 2 && profile.credits >= person.cost) { profile.crew.push(id); profile.credits -= person.cost; }
    saveProfile(); if (state) state.crew = [...profile.crew]; renderCrew(); updateHud();
  }

  function reset() {
    const rand = seededRandom(47821);
    state = {
      x: WORLD / 2, y: WORLD / 2, targetX: WORLD / 2, targetY: WORLD / 2,
      angle: -Math.PI / 2, oxygen: 100, energy: 100, hull: 100, fragments: 0,
      depth: 640, targetDepth: 640, silent: false, pingRadius: 0, pingActive: false, pingId: 0, cameraShake: 0,
      missionComplete: false, distance: 0, samples: 0, nearby: null, pressureWarned: false, crew: [...profile.crew], surfaced: false,
      journal: [
        { title: 'ПРИКАЗ ЭКСПЕДИЦИИ', text: 'Найти три фрагмента самописца экспедиции «Орфей» и вернуться к навигационному маяку.', unlocked: true },
        { title: 'ЗАПИСЬ 01', text: 'Данные ещё не восстановлены.', unlocked: false },
        { title: 'ЗАПИСЬ 02', text: 'Данные ещё не восстановлены.', unlocked: false },
        { title: 'ЗАПИСЬ 03', text: 'Данные ещё не восстановлены.', unlocked: false }
      ]
    };
    entities = [];
    particles = Array.from({ length: 110 }, () => ({ x: rand() * WORLD, y: rand() * WORLD, r: .5 + rand() * 1.8, a: .08 + rand() * .32 }));
    bubbles = [];
    ripples = [];
    messages = [];

    const spots = [
      [1250, 910], [2710, 1120], [950, 2740], [2880, 2850], [1850, 430], [450, 1750], [3230, 1900]
    ];
    spots.sort(() => rand() - .5).slice(0, 3).forEach((p, i) => entities.push(makeEntity('wreck', p[0], p[1], i)));
    [[1560,1250],[2250,1600],[1380,2320],[2510,2460],[700,680],[3040,720],[650,3140],[3150,3200]].forEach((p,i) =>
      entities.push(makeEntity(i % 3 === 0 ? 'vent' : 'mine', p[0], p[1], i)));
    [[1120,1700],[2050,820],[2320,2770],[820,2240],[3000,1450]].forEach((p,i) => entities.push(makeEntity('specimen',p[0],p[1],i)));
    for (let i = 0; i < 24; i++) entities.push(makeEntity('flora', 250 + rand() * 3100, 250 + rand() * 3100, i));
    entities.push(makeEntity('leviathan', 2650, 1980, 0));
    entities.push(makeEntity('beacon', WORLD / 2, WORLD / 2 + 90, 0));
    updateHud();
    renderJournal();
    renderCrew();
    ui.log.innerHTML = '';
    log('Бортовые системы запущены. Ожидается команда.');
  }

  function makeEntity(type, x, y, index) {
    const bands = { wreck: [520,760,980], mine: [460,620,820,980], vent: [920], specimen: [430,610,790,930,1060], flora: [500,700,880,1010], leviathan: [780], beacon: [0] };
    const choices = bands[type] || [640], z = choices[index % choices.length];
    return { type, x, y, z, index, found: type === 'beacon', collected: false, reveal: type === 'beacon' ? 999 : 0, lastEcho: -1, phase: index * 1.7, vx: 0, vy: 0 };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initAudio() {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    if (!audio) {
      audio = new AudioEngine();
      const master = audio.createGain(); master.gain.value = .68; master.connect(audio.destination);
      const delay = audio.createDelay(2); delay.delayTime.value = .48;
      const feedback = audio.createGain(); feedback.gain.value = .16;
      const echoFilter = audio.createBiquadFilter(); echoFilter.type = 'lowpass'; echoFilter.frequency.value = 1900;
      delay.connect(echoFilter).connect(feedback).connect(delay); echoFilter.connect(master);
      audioNodes = { master, delay, feedback, ambient: null, propeller: null };
      startHydrophone();
    }
    if (audio.state === 'suspended') audio.resume();
  }

  function startHydrophone() {
    if (!audio || audioNodes.ambient) return;
    const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate), data = buffer.getChannelData(0);
    let brown = 0; for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .025) / 1.018; data[i] = brown * 3.2; }
    const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    noise.buffer = buffer; noise.loop = true; filter.type = 'lowpass'; filter.frequency.value = 420; gain.gain.value = .018;
    noise.connect(filter).connect(gain).connect(audioNodes.master); noise.start();
    const prop = audio.createOscillator(), propGain = audio.createGain(); prop.type = 'sine'; prop.frequency.value = 42; propGain.gain.value = .012;
    prop.connect(propGain).connect(audioNodes.master); prop.start(); audioNodes.ambient = gain; audioNodes.propeller = propGain;
  }

  function tone(freq, duration, gain = .05, type = 'sine', delay = 0) {
    if (!audio) return;
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator(), amp = audio.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * .72), t + duration);
    amp.gain.setValueAtTime(.0001, t); amp.gain.exponentialRampToValueAtTime(gain, t + .025); amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(audioNodes?.master || audio.destination); osc.start(t); osc.stop(t + duration + .03);
  }

  function sonarPulse(delay = 0, level = .09) {
    if (!audio) return;
    const t = audio.currentTime + delay, base = 1280 - clamp(state.depth * .22, 0, 230);
    const osc = audio.createOscillator(), harmonic = audio.createOscillator(), band = audio.createBiquadFilter(), amp = audio.createGain(), hAmp = audio.createGain();
    osc.type = 'sine'; harmonic.type = 'sine'; band.type = 'bandpass'; band.frequency.value = base; band.Q.value = 7;
    osc.frequency.setValueAtTime(base * 1.18, t); osc.frequency.exponentialRampToValueAtTime(base, t + .075); osc.frequency.exponentialRampToValueAtTime(base * .965, t + 1.6);
    harmonic.frequency.setValueAtTime(base * 2.01, t); harmonic.frequency.exponentialRampToValueAtTime(base * 1.93, t + .9);
    amp.gain.setValueAtTime(.0001, t); amp.gain.exponentialRampToValueAtTime(level, t + .012); amp.gain.exponentialRampToValueAtTime(.0001, t + 1.7);
    hAmp.gain.setValueAtTime(.0001,t);hAmp.gain.exponentialRampToValueAtTime(level*.16,t+.01);hAmp.gain.exponentialRampToValueAtTime(.0001,t+.75);
    osc.connect(amp).connect(band); harmonic.connect(hAmp).connect(band); band.connect(audioNodes.master); band.connect(audioNodes.delay);
    osc.start(t);harmonic.start(t);osc.stop(t+1.75);harmonic.stop(t+1.1);
  }

  function sonarSound() {
    if (!audio) return;
    tone(68, .5, .018, 'sine'); sonarPulse(0, .1); sonarPulse(.62, .026); sonarPulse(1.25, .009);
  }
  function sonarReturn(type) {
    const frequencies = { wreck: 780, mine: 1680, vent: 520, specimen: 1120, leviathan: 260 };
    const gains = { wreck: .018, mine: .012, vent: .009, specimen: .01, leviathan: .025 };
    if (frequencies[type]) tone(frequencies[type], type === 'leviathan' ? .9 : .38, gains[type], type === 'mine' ? 'triangle' : 'sine');
  }
  function alertSound() { tone(180, .24, .045, 'sawtooth'); tone(150, .24, .04, 'sawtooth', .28); }
  function collectSound() { tone(440, .35, .04); tone(660, .5, .04, 'sine', .18); tone(990, .55, .03, 'sine', .36); }

  function start() {
    initAudio(); reset(); running = true; startedAt = performance.now(); last = performance.now();
    ui.intro.classList.remove('visible'); ui.end.classList.remove('visible'); ui.journal.classList.remove('visible'); ui.crewScreen.classList.remove('visible');
    log('Получен слабый сигнал. Используйте сонар для поиска.');
    requestAnimationFrame(loop);
  }

  function setCourse(clientX, clientY) {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    if (sy < 135 || sy > h - 105) return;
    state.targetX = clamp(state.x + (sx - w / 2) * 2.15, 90, WORLD - 90);
    state.targetY = clamp(state.y + (sy - h / 2) * 2.15, 90, WORLD - 90);
    ripples.push({ x: state.targetX, y: state.targetY, r: 4, life: 1 });
  }

  function ping() {
    const cost = hasCrew('sonar') ? 14 : 18;
    if (!running || state.energy < cost || state.pingActive) return;
    initAudio(); sonarSound(); state.energy -= cost; state.pingRadius = 8; state.pingActive = true; state.pingId++;
    log('Импульс отправлен. Анализ отражений…');
  }

  function toggleSilent() {
    if (!running) return;
    state.silent = !state.silent; ui.silent.classList.toggle('active', state.silent);
    log(state.silent ? 'Тихий ход. Акустическая сигнатура снижена.' : 'Обычный ход восстановлен.');
  }

  function repair() {
    const cost = hasCrew('engineer') ? 20 : 25, amount = hasCrew('engineer') ? 36 : 24;
    if (!running || state.energy < cost || state.hull >= 99) return;
    state.energy -= cost; state.hull = Math.min(100, state.hull + amount); tone(320, .35, .035, 'triangle');
    log('Ремонтные дроны восстановили часть корпуса.');
  }

  function changeDepth(amount) {
    if (!running) return;
    state.targetDepth = clamp(state.targetDepth + amount, 0, 1180);
    log(amount > 0 ? `Погружение до ${state.targetDepth} метров.` : `Подъём до ${state.targetDepth} метров.`);
  }

  function surface() {
    if (!running) return;
    state.targetDepth = 0; tone(92,.7,.025,'triangle');
    log('Продувка главного балласта. Начато всплытие.');
  }

  function interact() {
    if (!running || !state.nearby) return;
    const e = state.nearby;
    if (e.type === 'wreck' && !e.collected) {
      e.collected = true; state.fragments++; collectSound(); state.energy = Math.min(100, state.energy + 10);
      const stories = [
        '«…мы слышим стук снаружи. Он повторяет наш идентификационный код…»',
        'Капитан приказал выключить активный сонар. Что-то отвечало на каждый импульс.',
        'Последняя координата ведёт ниже проектной глубины. Запись обрывается словом: «проснулось». '
      ];
      state.journal[state.fragments] = { title: `ЗАПИСЬ 0${state.fragments}`, text: stories[state.fragments - 1], unlocked: true };
      renderJournal(); log(`Самописец расшифрован: ${state.fragments}/3. Запись добавлена в журнал.`);
      if (state.fragments === 3) {
        state.missionComplete = true; ui.mission.textContent = 'Маяк и всплытие';
        entities.find(x => x.type === 'beacon').reveal = 999;
        log('В данных указано: объект следует за «Нереидой». Вернитесь к маяку и всплывите!', true);
      }
    } else if (e.type === 'specimen' && !e.collected) {
      e.collected = true; state.samples++; collectSound(); state.oxygen = Math.min(100, state.oxygen + (hasCrew('biologist') ? 12 : 5));
      profile.credits += hasCrew('biologist') ? 180 : 110; saveProfile(); renderCrew();
      log(`Биообразец сохранён. Научный грант: +${hasCrew('biologist') ? 180 : 110} CR.`);
    } else if (e.type === 'vent') {
      state.energy = Math.min(100, state.energy + 38); state.oxygen = Math.min(100, state.oxygen + 12);
      e.cooldown = 18; log('Термогенератор заряжен. Кислород частично восстановлен.');
    }
    state.nearby = null; updateAction(); updateHud();
  }

  function updateAction() {
    const e = state.nearby;
    ui.action.classList.toggle('visible', !!e);
    if (!e) return;
    ui.action.textContent = e.type === 'wreck' ? 'ИЗВЛЕЧЬ САМОПИСЕЦ' : e.type === 'specimen' ? 'ВЗЯТЬ БИООБРАЗЕЦ' : 'ПОДКЛЮЧИТЬ ГЕНЕРАТОР';
  }

  function renderJournal() {
    ui.journalEntries.innerHTML = state.journal.map(item =>
      `<article class="journal-entry${item.unlocked ? '' : ' locked'}"><b>${item.title}</b><p>${item.text}</p></article>`
    ).join('');
  }

  function openJournal() { if (running) ui.journal.classList.add('visible'); }
  function closeJournal() { ui.journal.classList.remove('visible'); last = performance.now(); }
  function openCrew() { renderCrew(); ui.crewScreen.classList.add('visible'); }
  function closeCrew() { ui.crewScreen.classList.remove('visible'); last = performance.now(); }

  function update(dt) {
    const dx = state.targetX - state.x, dy = state.targetY - state.y, dist = Math.hypot(dx, dy);
    const speed = state.silent ? 42 : 96;
    if (dist > 8) {
      const desired = Math.atan2(dy, dx), diff = angleDiff(desired, state.angle);
      state.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const move = Math.min(dist, speed * dt);
      state.x += Math.cos(state.angle) * move; state.y += Math.sin(state.angle) * move; state.distance += move;
      if (Math.random() < dt * (state.silent ? 2 : 7)) bubbles.push({ x: state.x - Math.cos(state.angle) * 28, y: state.y - Math.sin(state.angle) * 28, life: 1, s: 7 + Math.random() * 9 });
    }
    const vertical = state.targetDepth - state.depth, verticalRate = vertical < 0 ? 58 : 42;
    state.depth += Math.sign(vertical) * Math.min(Math.abs(vertical), verticalRate * dt);
    const depthLoad = Math.max(0, (state.depth - 850) / 400);
    if (state.depth < 12) {
      state.oxygen = Math.min(100, state.oxygen + dt * 5.5);
      if (!state.surfaced) { state.surfaced = true; log('Поверхность достигнута. Забортный воздух поступает в систему.'); }
    } else { state.surfaced = false; state.oxygen -= dt * (.205 + depthLoad * .12); }
    state.energy = Math.min(100, state.energy + dt * (state.silent ? 2.4 : 1.35) + dt * (hasCrew('engineer') ? .42 : 0) - dt * depthLoad * .34);
    if (audioNodes) {
      audioNodes.ambient.gain.setTargetAtTime(.012 + depthLoad * .018, audio.currentTime, .4);
      audioNodes.propeller.gain.setTargetAtTime(state.silent ? .003 : .013, audio.currentTime, .3);
    }
    if (audio && state.depth > 820 && performance.now() > nextCreak) {
      tone(105 + Math.random() * 55, 1.3, .012 + depthLoad * .02, 'sawtooth'); nextCreak = performance.now() + 5000 + Math.random() * 8000;
    }
    if (state.depth > 1080) {
      state.hull -= dt * .42;
      if (!state.pressureWarned) { state.pressureWarned = true; log('Внимание: глубина превышает расчётную. Корпус испытывает давление.', true); alertSound(); }
    } else if (state.depth < 1030) state.pressureWarned = false;
    state.cameraShake = Math.max(0, state.cameraShake - dt * 10);

    if (state.pingActive) {
      const sonarBoost = hasCrew('sonar') ? 1.3 : 1;
      state.pingRadius += dt * 760 * sonarBoost;
      entities.forEach(e => {
        const d = Math.hypot(e.x - state.x, e.y - state.y, (e.z - state.depth) * 1.15);
        if (Math.abs(d - state.pingRadius) < 42 && !e.collected) {
          e.found = true; e.reveal = Math.max(e.reveal, 8);
          if (e.lastEcho !== state.pingId) { e.lastEcho = state.pingId; sonarReturn(e.type); }
        }
      });
      if (state.pingRadius > Math.max(w, h) * 1.55 * sonarBoost) state.pingActive = false;
    }

    state.nearby = null;
    entities.forEach(e => {
      e.phase += dt;
      e.cooldown = Math.max(0, (e.cooldown || 0) - dt);
      e.reveal = Math.max(0, e.reveal - dt);
      const horizontal = Math.hypot(e.x - state.x, e.y - state.y), verticalGap = Math.abs(e.z - state.depth);
      const d = Math.hypot(horizontal, verticalGap * 1.35);
      if (d < 130) { e.found = true; e.reveal = 3; }

      if (e.type === 'wreck' && !e.collected && horizontal < 72 && verticalGap < 80) state.nearby = e;
      if (e.type === 'specimen' && !e.collected && horizontal < 64 && verticalGap < 75) state.nearby = e;
      if (e.type === 'vent' && !e.cooldown && horizontal < 72 && verticalGap < 90) state.nearby = e;
      if (e.type === 'mine' && !e.collected && d < 46) {
        e.collected = true; damage(18, 'Мина! Пробоина внешнего корпуса.');
      }
      if (e.type === 'vent' && horizontal < 75 && verticalGap < 100) {
        state.energy = Math.min(100, state.energy + dt * 7); e.reveal = 2;
      }
      if (e.type === 'leviathan') {
        const hear = Math.hypot(e.x - state.x, e.y - state.y, (e.z-state.depth)*.7);
        if (!state.silent && hear < 520) {
          const a = Math.atan2(state.y - e.y, state.x - e.x);
          e.x += Math.cos(a) * dt * 72; e.y += Math.sin(a) * dt * 72; e.found = true; e.reveal = 1.2;
        } else { e.x += Math.cos(e.phase * .23) * dt * 15; e.y += Math.sin(e.phase * .19) * dt * 15; }
        if (hear < 72 && e.reveal > 0) { damage(12 * dt, 'Крупный контакт у борта! Включите тихий ход.'); }
      }
      if (e.type === 'beacon' && state.missionComplete && horizontal < 90 && state.depth < 14) win();
    });

    bubbles.forEach(b => { b.life -= dt * .7; b.y -= dt * b.s; });
    bubbles = bubbles.filter(b => b.life > 0);
    ripples.forEach(r => { r.r += dt * 85; r.life -= dt * .8; });
    ripples = ripples.filter(r => r.life > 0);
    if (state.oxygen <= 0) lose('Запас кислорода исчерпан. «Нереида» осталась в безмолвной глубине.');
    if (state.hull <= 0) lose('Корпус не выдержал давления. Последний сигнал подлодки растворился в помехах.');
    updateAction();
    updateHud();
  }

  let lastAlert = 0;
  function damage(amount, text) {
    state.hull -= amount; state.cameraShake = Math.min(12, state.cameraShake + amount * .6);
    if (performance.now() - lastAlert > 1600) { alertSound(); log(text, true); lastAlert = performance.now(); }
  }

  function updateHud() {
    const set = (text, bar, value) => { text.textContent = `${Math.max(0, Math.round(value))}%`; bar.style.width = `${clamp(value, 0, 100)}%`; };
    ui.depth.textContent = Math.round(state.depth);
    set(ui.oxygen, ui.oxygenBar, state.oxygen); set(ui.energy, ui.energyBar, state.energy); set(ui.hull, ui.hullBar, state.hull);
    ui.fragments.textContent = state.fragments;
    ui.samples.textContent = state.samples;
    ui.targetDepth.textContent = Math.round(state.targetDepth);
    const zone = state.depth < 20 ? 'ПОВЕРХНОСТЬ' : state.depth < 140 ? 'ПЕРИСКОПНАЯ ГЛУБИНА' : state.depth < 560 ? 'ХОЛОДНЫЙ ШЕЛЬФ' : state.depth < 860 ? 'СУМЕРЕЧНАЯ ЗОНА' : state.depth < 1050 ? 'АБИССАЛЬНАЯ ЗОНА' : 'ЗОНА ДАВЛЕНИЯ';
    ui.zone.textContent = zone;
    const vertical = state.targetDepth - state.depth;
    ui.ballast.textContent = Math.abs(vertical) < 4 ? 'НЕЙТРАЛЬНО' : vertical > 0 ? 'БАЛЛАСТ +' : 'ПРОДУВКА';
    const pingCost = hasCrew('sonar') ? 14 : 18, repairCost = hasCrew('engineer') ? 20 : 25;
    ui.ping.disabled = state.energy < pingCost || state.pingActive; ui.ping.querySelector('small').textContent = `−${pingCost} энергии`;
    ui.repair.disabled = state.energy < repairCost || state.hull >= 99; ui.repair.querySelector('small').textContent = `−${repairCost} энергии`;
  }

  function log(text, alert = false) {
    const p = document.createElement('p'); p.textContent = text; if (alert) p.className = 'alert';
    ui.log.prepend(p); while (ui.log.children.length > 3) ui.log.lastElementChild.remove();
  }

  function win() {
    if (!running) return; running = false;
    const secs = Math.round((performance.now() - startedAt) / 1000);
    profile.credits += 350; saveProfile(); renderCrew();
    const best = Number(localStorage.getItem('depth-best') || 0);
    if (!best || secs < best) localStorage.setItem('depth-best', secs);
    ui.endEyebrow.textContent = 'СИГНАЛ ВОССТАНОВЛЕН'; ui.endTitle.textContent = 'ЭКСПЕДИЦИЯ СПАСЕНА';
    ui.endText.textContent = `Все фрагменты доставлены на поверхность. Время погружения: ${formatTime(secs)}. Награда: 350 CR. Но в последней записи слышен звук, которого не должно существовать…`;
    ui.end.classList.add('visible'); collectSound();
  }

  function lose(text) {
    if (!running) return; running = false; ui.endEyebrow.textContent = 'СВЯЗЬ ПОТЕРЯНА'; ui.endTitle.textContent = 'ГЛУБИНА ПОБЕДИЛА';
    ui.endText.textContent = text; ui.end.classList.add('visible');
  }

  function draw(time) {
    ctx.save();
    if (state.cameraShake) ctx.translate((Math.random() - .5) * state.cameraShake, (Math.random() - .5) * state.cameraShake);
    const deep = clamp((state.depth - 450) / 700, 0, 1);
    const g = ctx.createRadialGradient(w * .5, h * .46, 10, w * .5, h * .46, Math.max(w, h) * .75);
    g.addColorStop(0, deep > .72 ? '#092735' : '#0a4050'); g.addColorStop(.45, deep > .72 ? '#041924' : '#062b38'); g.addColorStop(1, '#01070d'); ctx.fillStyle = g; ctx.fillRect(-20, -20, w + 40, h + 40);

    drawGrid();
    drawCurrents(time);
    if (state.depth < 150) drawSurfaceLight(time);
    particles.forEach(p => {
      const s = worldToScreen(p.x, p.y); if (!onscreen(s.x, s.y, 10)) return;
      ctx.fillStyle = `rgba(116,218,226,${p.a})`; ctx.beginPath(); ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    bubbles.forEach(b => { const s = worldToScreen(b.x, b.y); ctx.strokeStyle = `rgba(126,230,244,${b.life * .48})`; ctx.beginPath(); ctx.arc(s.x, s.y, 2 + (1 - b.life) * 3, 0, 7); ctx.stroke(); });
    drawHeadlight();
    entities.forEach(e => drawEntity(e, time));
    ripples.forEach(r => { const s = worldToScreen(r.x, r.y); ctx.strokeStyle = `rgba(86,233,255,${r.life * .45})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, r.r / 2.15, 0, 7); ctx.stroke(); });
    drawSubmarine(time);
    if (state.pingActive) drawPing();
    drawCompass();
    drawVignette();
    ctx.restore();
  }

  function drawGrid() {
    const spacing = 140, ox = ((-state.x / 2.15 + w / 2) % spacing + spacing) % spacing, oy = ((-state.y / 2.15 + h / 2) % spacing + spacing) % spacing;
    ctx.strokeStyle = 'rgba(85,209,228,.045)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = ox; x < w; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = oy; y < h; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke();
    ctx.strokeStyle = 'rgba(86,233,255,.055)';
    [120, 230, 350].forEach(r => { ctx.beginPath(); ctx.arc(w/2, h/2, r, 0, Math.PI*2); ctx.stroke(); });
  }

  function drawCurrents(time) {
    ctx.save(); ctx.strokeStyle = 'rgba(94,211,225,.045)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = ((i * 137 + time * .012) % (h + 180)) - 90;
      ctx.beginPath(); ctx.moveTo(-20, y); ctx.bezierCurveTo(w*.25, y-35, w*.66, y+42, w+20, y-12); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSurfaceLight(time) {
    const strength = 1 - state.depth / 150; ctx.save();
    const light = ctx.createLinearGradient(0,0,0,h*.72); light.addColorStop(0,`rgba(88,220,242,${.22*strength})`);light.addColorStop(1,'transparent');ctx.fillStyle=light;ctx.fillRect(0,0,w,h*.75);
    ctx.strokeStyle=`rgba(170,246,255,${.18*strength})`;ctx.lineWidth=1.3;
    for(let i=0;i<6;i++){const y=35+i*28+Math.sin(time*.001+i)*8;ctx.beginPath();for(let x=0;x<=w;x+=18){const yy=y+Math.sin(x*.025+time*.0015+i)*5;if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();}
    ctx.restore();
  }

  function drawHeadlight() {
    ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(state.angle);
    const beam = ctx.createLinearGradient(10,0,245,0); beam.addColorStop(0, state.silent ? 'rgba(116,232,240,.035)' : 'rgba(160,240,247,.13)'); beam.addColorStop(1,'transparent');
    ctx.fillStyle=beam; ctx.beginPath(); ctx.moveTo(8,-10);ctx.lineTo(250,-95);ctx.lineTo(250,95);ctx.lineTo(8,10);ctx.closePath();ctx.fill();ctx.restore();
  }

  function drawEntity(e, time) {
    if (e.collected) return;
    const s = worldToScreen(e.x, e.y); if (!onscreen(s.x, s.y, 100)) return;
    const visible = e.reveal > 0 || e.type === 'beacon' || e.type === 'flora'; if (!visible) return;
    const fade = Math.min(1, e.reveal || 1), depthFade = clamp(1 - Math.abs(e.z-state.depth)/320,.08,1), pulse = .8 + Math.sin(time / 320 + e.phase) * .2;
    ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = fade * depthFade;
    if (e.type === 'wreck') {
      ctx.rotate(-.35); ctx.strokeStyle = '#ffca63'; ctx.fillStyle = 'rgba(255,202,99,.1)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-22,-9); ctx.lineTo(18,-6); ctx.lineTo(27,6); ctx.lineTo(-14,10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffca63'; ctx.fillRect(-4,-15,12,7); label('СИГНАЛ', 0, 30, '#ffca63');
    } else if (e.type === 'mine') {
      ctx.strokeStyle = '#ff6680'; ctx.lineWidth = 1.5; ctx.rotate(e.phase * .15);
      ctx.beginPath(); ctx.arc(0,0,9,0,7); for(let a=0;a<7;a++){const q=a/7*Math.PI*2;ctx.moveTo(Math.cos(q)*9,Math.sin(q)*9);ctx.lineTo(Math.cos(q)*16,Math.sin(q)*16);} ctx.stroke();
    } else if (e.type === 'vent') {
      ctx.fillStyle = 'rgba(96,255,190,.15)'; ctx.strokeStyle = '#69efbb'; ctx.beginPath(); ctx.moveTo(-17,13);ctx.lineTo(-8,-7);ctx.lineTo(1,4);ctx.lineTo(10,-16);ctx.lineTo(18,13);ctx.closePath();ctx.fill();ctx.stroke();
      for(let i=0;i<3;i++){ctx.globalAlpha=fade*(.3+i*.16);ctx.beginPath();ctx.arc((i-1)*5,-20-i*8+Math.sin(e.phase+i)*3,3+i,0,7);ctx.stroke();}
      label('ТЕРМОИСТОЧНИК', 0, 31, '#69efbb');
    } else if (e.type === 'specimen') {
      ctx.strokeStyle='#b674ff';ctx.fillStyle='rgba(182,116,255,.15)';ctx.lineWidth=1.4;
      for(let i=0;i<5;i++){const a=e.phase*.35+i/5*Math.PI*2,r=8+(i%2)*5;ctx.beginPath();ctx.ellipse(Math.cos(a)*r,Math.sin(a)*r,5,2,a,0,7);ctx.fill();ctx.stroke();}
      ctx.shadowColor='#b674ff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,3*pulse,0,7);ctx.fill();ctx.shadowBlur=0;label('БИОСИГНАЛ',0,30,'#d0aaff');
    } else if (e.type === 'flora') {
      const glow=.18+.18*Math.sin(e.phase*1.3);ctx.globalAlpha=glow*depthFade;ctx.strokeStyle=e.index%2?'#56e9ff':'#b674ff';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(0,12);ctx.quadraticCurveTo(Math.sin(e.phase)*9,-2,Math.cos(e.phase*.7)*7,-18);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(Math.cos(e.phase*.7)*7,-18,2.2,0,7);ctx.fill();
    } else if (e.type === 'beacon') {
      const active = state.missionComplete; ctx.strokeStyle = active ? '#ffca63' : '#56e9ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,0,13*pulse,0,7); ctx.stroke(); ctx.beginPath();ctx.arc(0,0,23*pulse,0,7);ctx.stroke(); ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(-2,-2,4,4);
      if (active) label('ТОЧКА ЭВАКУАЦИИ', 0, 38, '#ffca63');
    } else if (e.type === 'leviathan') {
      ctx.globalAlpha = fade * depthFade * .48; ctx.strokeStyle = '#ff6680'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(-45, 8); ctx.bezierCurveTo(-20,-25,18,25,48,-7); ctx.stroke();
      ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,58*pulse,0,7);ctx.stroke(); label('НЕИЗВЕСТНЫЙ КОНТАКТ', 0, 44, '#ff6680');
    }
    ctx.restore();
  }

  function drawSubmarine(time) {
    ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(state.angle);
    const glow = ctx.createRadialGradient(25,0,1,25,0,75); glow.addColorStop(0,'rgba(180,245,255,.22)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(-30,-75,140,150);
    ctx.fillStyle='#8fc1ca';ctx.strokeStyle='#c2eef2';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(34,0);ctx.bezierCurveTo(18,-12,-23,-11,-38,-3);ctx.lineTo(-38,3);ctx.bezierCurveTo(-22,11,18,12,34,0);ctx.fill();ctx.stroke();
    ctx.fillStyle='#4d7c87';ctx.fillRect(-7,-13,14,8);ctx.beginPath();ctx.moveTo(-18,-5);ctx.lineTo(-34,-17);ctx.lineTo(-30,-2);ctx.fill();ctx.beginPath();ctx.moveTo(-18,5);ctx.lineTo(-34,17);ctx.lineTo(-30,2);ctx.fill();
    ctx.fillStyle='#56e9ff';ctx.globalAlpha=.7+Math.sin(time/90)*.2;ctx.beginPath();ctx.arc(27,0,2.6,0,7);ctx.fill();ctx.restore();
  }

  function drawPing() {
    const r = state.pingRadius / 2.15; ctx.save(); ctx.translate(w/2,h/2); ctx.strokeStyle='rgba(86,233,255,.7)';ctx.lineWidth=2;ctx.shadowColor='#56e9ff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.stroke();ctx.restore();
  }

  function drawCompass() {
    ctx.save();ctx.translate(w-34,h/2);ctx.strokeStyle='rgba(120,210,225,.25)';ctx.beginPath();ctx.moveTo(0,-70);ctx.lineTo(0,70);ctx.stroke();ctx.fillStyle='rgba(180,230,238,.55)';ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillText('N',0,-77);ctx.fillText('S',0,84);ctx.restore();
  }

  function drawVignette() {
    const v=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.72);v.addColorStop(.35,'transparent');v.addColorStop(1,'rgba(0,2,6,.78)');ctx.fillStyle=v;ctx.fillRect(0,0,w,h);
  }

  function label(text,x,y,color){ctx.font='8px system-ui';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,y);}
  function worldToScreen(x,y){return{x:w/2+(x-state.x)/2.15,y:h/2+(y-state.y)/2.15};}
  function onscreen(x,y,p=0){return x>-p&&x<w+p&&y>-p&&y<h+p;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
  function formatTime(s){return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}

  function loop(now) {
    if (!running) return;
    const dt = Math.min(.035, (now - last) / 1000 || 0); last = now;
    if (!ui.journal.classList.contains('visible') && !ui.crewScreen.classList.contains('visible')) update(dt);
    draw(now); requestAnimationFrame(loop);
  }

  canvas.addEventListener('pointerdown', e => setCourse(e.clientX, e.clientY));
  ui.ping.addEventListener('click', ping); ui.silent.addEventListener('click', toggleSilent); ui.repair.addEventListener('click', repair);
  ui.action.addEventListener('click', interact);
  $('ascendBtn').addEventListener('click', () => changeDepth(-120));
  $('descendBtn').addEventListener('click', () => changeDepth(120));
  $('surfaceBtn').addEventListener('click', surface);
  $('journalBtn').addEventListener('click', openJournal); $('closeJournalBtn').addEventListener('click', closeJournal);
  $('crewBtn').addEventListener('click', openCrew); $('openCrewIntroBtn').addEventListener('click', openCrew); $('closeCrewBtn').addEventListener('click', closeCrew);
  $('startBtn').addEventListener('click', start); $('restartBtn').addEventListener('click', start);
  addEventListener('resize', resize); resize(); reset(); draw(0);
  const best = Number(localStorage.getItem('depth-best') || 0); if (best) ui.best.textContent = `Лучшее погружение: ${formatTime(best)}`;
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();

