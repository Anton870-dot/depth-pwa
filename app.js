(() => {
  'use strict';

  const canvas = document.querySelector('#ocean');
  const ctx = canvas.getContext('2d');
  const miniCanvas = document.querySelector('#miniSonar');
  const miniCtx = miniCanvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    depth: $('depthValue'), oxygen: $('oxygenText'), energy: $('energyText'), hull: $('hullText'),
    oxygenBar: $('oxygenBar'), energyBar: $('energyBar'), hullBar: $('hullBar'), fragments: $('fragments'),
    mission: $('missionTitle'), log: $('log'), ping: $('pingBtn'), silent: $('silentBtn'), cooling: $('coolingBtn'), repair: $('repairBtn'),
    samples: $('samples'), zone: $('zoneName'), targetDepth: $('targetDepth'), action: $('actionBtn'),
    ballast: $('ballastMode'), crewCount: $('crewCount'), credits: $('credits'), crewSlots: $('crewSlots'), crewCards: $('crewCards'),
    interior: $('interiorView'), interiorCrew: $('interiorCrew'), interiorStatus: $('interiorStatus'), interiorAlert: $('interiorAlert'),
    passive: $('passiveBtn'), passiveContact: $('passiveContact'), passiveBearing: $('passiveBearing'), thermal: $('thermalSummary'),
    noise: $('noiseReadout'), trim: $('trimReadout'), powerBudget: $('powerBudget'), emergency: $('emergencyObjective'),
    intro: $('intro'), end: $('endScreen'), journal: $('journal'), crewScreen: $('crewScreen'), journalEntries: $('journalEntries'),
    endEyebrow: $('endEyebrow'), endTitle: $('endTitle'), endText: $('endText'), best: $('bestRun')
  };

  const WORLD = 3600;
  const roomDefs = {
    sonar: { name: 'Гидроакустический пост', task: 'Пассивное наблюдение' },
    command: { name: 'Командный отсек', task: 'Управление экспедицией' },
    engine: { name: 'Машинное отделение', task: 'Реактор стабилен' },
    lab: { name: 'Лаборатория', task: 'Нет образцов для анализа' }
  };
  const incidentDefs = {
    leak: { name: 'ПОДТЕКАНИЕ', rooms: ['sonar','command','engine','lab'], damage: .1, inflow: .48 },
    breach: { name: 'ПРОБОИНА КОРПУСА', rooms: ['sonar','command','engine','lab'], damage: .18, inflow: 1.45 },
    short: { name: 'КОРОТКОЕ ЗАМЫКАНИЕ', rooms: ['sonar','command','lab'], damage: .06 },
    overheat: { name: 'ПЕРЕГРЕВ РЕАКТОРА', rooms: ['engine'], damage: .08 },
    fire: { name: 'ПОЖАР', rooms: ['command','engine','lab'], damage: .16 },
    equipment: { name: 'ПОВРЕЖДЕНИЕ ОБОРУДОВАНИЯ', rooms: ['sonar','command','engine','lab'], damage: .04 }
  };
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
      if (saved && Array.isArray(saved.crew)) return {
        credits: Number(saved.credits) || 0,
        crew: saved.crew.filter(id => crewCatalog.some(c => c.id === id)).slice(0, 2),
        assignments: saved.assignments && typeof saved.assignments === 'object' ? saved.assignments : {},
        researched: Number(saved.researched) || 0
      };
    } catch (_) {}
    return { credits: 1000, crew: [], assignments: {}, researched: 0 };
  }

  function saveProfile() { localStorage.setItem('depth-profile', JSON.stringify(profile)); }
  function hasCrew(id) { return (state?.crew || profile.crew).includes(id); }
  function crewAt(id, roomId) { return !!state?.rooms?.[roomId]?.crew.includes(id) && !state.transit[id]; }

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
    if (index >= 0) {
      profile.crew.splice(index, 1); profile.credits += person.cost; delete profile.assignments[id];
      if (state?.rooms) Object.values(state.rooms).forEach(room => room.crew = room.crew.filter(member => member !== id));
    }
    else if (profile.crew.length < 2 && profile.credits >= person.cost) { profile.crew.push(id); profile.credits -= person.cost; }
    saveProfile(); if (state) {
      state.crew = [...profile.crew];
      profile.crew.forEach(member=>{if(!state.crewVitals[member])state.crewVitals[member]={health:100,fatigue:0,stress:5,bodyTemp:36.6};});
    } renderCrew(); renderInterior(); updateHud();
  }

  function createRooms() {
    const rooms = {};
    const initialTemperature = { sonar: 18, command: 20, engine: 34, lab: 19 };
    Object.entries(roomDefs).forEach(([id, def]) => rooms[id] = { id, health: 100, water: 0, temperature: initialTemperature[id], incident: null, crew: [], task: def.task, repairing: 0, pumping: false, floodWarned: false, thermalWarned: false });
    profile.crew.forEach(id => {
      const roomId = profile.assignments[id] || ({sonar:'sonar',engineer:'engine',biologist:'lab'}[id]);
      profile.assignments[id] = roomId;
      if (rooms[roomId] && rooms[roomId].crew.length < 2) rooms[roomId].crew.push(id);
    });
    saveProfile();
    return rooms;
  }

  function reset() {
    const rand = seededRandom(47821);
    state = {
      x: WORLD / 2, y: WORLD / 2, targetX: WORLD / 2, targetY: WORLD / 2,
      angle: -Math.PI / 2, oxygen: 100, energy: 100, hull: 100, fragments: 0,
      depth: 640, targetDepth: 640, silent: false, coolingOn: false, pingRadius: 0, pingActive: false, pingId: 0, cameraShake: 0,
      missionComplete: false, distance: 0, samples: 0, nearby: null, pressureWarned: false, crew: [...profile.crew], surfaced: false,
      view: 'interior', selectedCrew: null, rooms: createRooms(), transit: {}, passiveOn: false, passiveTimer: 0,
      nextIncidentAt: 0, nextThermalIncidentAt: 0, floodLevel: 0, outsideTemperature: 0, temperatureLoad: 0, analysisProgress: 0, researched: profile.researched || 0, saveTimer: 0,
      power: { propulsion: 35, pumps: 25, life: 25, sonar: 15 }, bulkheads: { 'sonar-command': false, 'command-engine': false, 'engine-lab': false },
      noise: 12, trim: 0, emergencyPhase: 0, emergencyAt: 0, emergencyDeadline: 0, emergencyRoom: null, emergencyRewarded: false,
      crewVitals: Object.fromEntries(profile.crew.map(id => [id, { health: 100, fatigue: 0, stress: 5, bodyTemp: 36.6 }])),
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
    setView('interior');
    ui.silent.classList.remove('active'); ui.cooling.classList.remove('active'); ui.passive.classList.remove('active');
    ui.passive.textContent='ВКЛЮЧИТЬ'; ui.action.classList.remove('visible');
    document.querySelectorAll('[data-power]').forEach(input => { input.value = state.power[input.dataset.power]; input.nextElementSibling.value = input.value; });
    renderInterior();
    ui.log.innerHTML = '';
    log('Бортовые системы запущены. Ожидается команда.');
  }

  function makeEntity(type, x, y, index) {
    const bands = { wreck: [520,760,980], mine: [460,620,820,980], vent: [920], specimen: [430,610,790,930,1060], flora: [500,700,880,1010], leviathan: [780], beacon: [0] };
    const choices = bands[type] || [640], z = choices[index % choices.length];
    return { type, x, y, z, index, found: type === 'beacon', collected: false, reveal: type === 'beacon' ? 999 : 0, lastEcho: -1, phase: index * 1.7, vx: 0, vy: 0 };
  }

  function setView(view) {
    if (!state) return;
    state.view = view;
    $('game').classList.toggle('interior-mode', view === 'interior');
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if (view === 'interior') renderInterior();
  }

  function renderInterior() {
    if (!state?.rooms) return;
    const incidents = Object.values(state.rooms).filter(room => room.incident);
    const flooded = Object.values(state.rooms).filter(room => room.water >= 1), floodLevel = getFloodLevel();
    const powerUnstable = state.energy < 28 || Object.values(state.rooms).some(room => room.incident === 'short' || room.temperature > 62);
    $('game').classList.toggle('alert-mode', incidents.length > 0 || floodLevel >= 8);
    $('game').classList.toggle('power-unstable', powerUnstable);
    ui.interiorStatus.textContent = incidents.length ? 'АВАРИЙНЫЙ РЕЖИМ' : flooded.length ? 'БОРЬБА ЗА ЖИВУЧЕСТЬ' : 'СИСТЕМЫ В НОРМЕ';
    ui.interiorAlert.textContent = incidents.length || flooded.length ? `АВАРИЙ: ${incidents.length} · ВОДА: ${Math.round(floodLevel)}%` : 'НЕИСПРАВНОСТЕЙ НЕТ';
    if (ui.thermal) ui.thermal.textContent = `СНАРУЖИ ${Math.round(state.outsideTemperature)}°C`;
    ui.interiorCrew.innerHTML = state.crew.length ? state.crew.map(id => {
      const person = crewCatalog.find(member => member.id === id), room = Object.values(state.rooms).find(item => item.crew.includes(id));
      const moving = state.transit[id], vitals = state.crewVitals[id] || {health:100,fatigue:0,stress:0}, place = moving ? `ПЕРЕХОД: ${roomDefs[moving.target].name}` : room ? roomDefs[room.id].name : 'НЕ НАЗНАЧЕН';
      return `<button type="button" class="crew-token${state.selectedCrew === id ? ' selected' : ''}${moving ? ' transit' : ''}" data-assign-crew="${id}"><b>${person.icon} ${person.name}</b><span>${place}</span><small>ЗДР ${Math.round(vitals.health)} · УСТ ${Math.round(vitals.fatigue)} · СТР ${Math.round(vitals.stress)}</small></button>`;
    }).join('') : '<span class="crew-token">Сначала наймите специалистов</span>';
    ui.interiorCrew.querySelectorAll('[data-assign-crew]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation(); selectInteriorCrew(button.dataset.assignCrew);
    }));

    document.querySelectorAll('.compartment').forEach(card => {
      const room = state.rooms[card.dataset.room], health = Math.max(0, room.health);
      card.classList.toggle('damaged', !!room.incident); card.classList.toggle('flooded', room.water >= 1); card.classList.toggle('disabled-room', health <= 0 || room.water >= 90);
      card.classList.toggle('cold', room.temperature < 8); card.classList.toggle('hot', room.temperature > 46);
      card.classList.toggle('power-fault', room.incident === 'short' || room.temperature > 64);
      card.classList.toggle('blackout', health < 18 || room.water >= 88 || (room.incident === 'short' && state.energy < 35));
      card.classList.toggle('assignment-target', !!state.selectedCrew && !state.transit[state.selectedCrew]);
      card.style.setProperty('--water-level', `${Math.min(100,room.water)}%`);
      card.querySelector('.room-health em').style.width = `${health}%`;
      card.querySelector('.room-health span').textContent = `${Math.round(health)}%`;
      card.querySelector('.room-water em').style.width = `${Math.min(100,room.water)}%`;
      card.querySelector('.room-water span').textContent = `ВОДА ${Math.round(room.water)}%`;
      card.querySelector('.room-temperature em').style.width = `${clamp((room.temperature + 10) / 85 * 100, 0, 100)}%`;
      card.querySelector('.room-temperature span').textContent = `${Math.round(room.temperature)}°C`;
      card.querySelector('.room-task').textContent = room.task;
      card.querySelector('.room-crew').innerHTML = room.crew.map(id => {
        const person = crewCatalog.find(member => member.id === id); return `<span class="room-person" title="${person.name}">${person.icon}</span>`;
      }).join('');
      card.querySelector('.room-incident').textContent = room.incident ? incidentDefs[room.incident].name : '';
      const action = card.querySelector('.room-action');
      action.disabled = room.repairing > 0;
      if (room.repairing > 0) action.textContent = `ЗАДЕЛКА · ${Math.ceil(room.repairing)}с`;
      else if (room.incident) action.textContent = room.incident === 'breach' ? 'ЗАДЕЛАТЬ ПРОБОИНУ' : room.incident === 'leak' ? 'УСТРАНИТЬ ТЕЧЬ' : 'УСТРАНИТЬ АВАРИЮ';
      else action.textContent = room.pumping ? 'ОСТАНОВИТЬ ОТКАЧКУ' : 'ВКЛЮЧИТЬ ОТКАЧКУ';
    });
    document.querySelectorAll('[data-bulkhead]').forEach(button => {
      const closed = state.bulkheads[button.dataset.bulkhead];
      button.classList.toggle('closed', closed); button.querySelector('small').textContent = closed ? 'ЗАКРЫТА' : 'ОТКРЫТА';
    });
    const totalPower = Object.values(state.power).reduce((sum,value)=>sum+value,0);
    ui.powerBudget.textContent = `${totalPower} / 100`; ui.powerBudget.classList.toggle('overload', totalPower > 100);
    ui.noise.textContent = `ШУМ ${Math.round(state.noise)}%`; ui.noise.classList.toggle('danger',state.noise>68);
    ui.trim.textContent = `ДИФФЕРЕНТ ${state.trim > 0 ? '+' : ''}${state.trim.toFixed(1)}°`; ui.trim.classList.toggle('danger',Math.abs(state.trim)>6);
    renderEmergencyObjective();
  }

  function getFloodLevel() {
    if (!state?.rooms) return 0;
    return Object.values(state.rooms).reduce((sum, room) => sum + room.water, 0) / 4;
  }

  function roomEfficiency(room) {
    const thermalPenalty = room.temperature < 8 ? (8-room.temperature)*.025 : room.temperature > 45 ? (room.temperature-45)*.02 : 0;
    const crewPenalty = room.crew.length ? Math.max(...room.crew.map(id => {
      const v=state.crewVitals[id]; return v ? (100-v.health)*.003+v.fatigue*.002+v.stress*.0015 : 0;
    })) : 0;
    return clamp(1 - thermalPenalty - room.water/135 - (room.health < 45 ? .18 : 0) - crewPenalty, .15, 1);
  }

  function roomIndex(id) { return ['sonar','command','engine','lab'].indexOf(id); }
  function pathBlocked(from,to) {
    const a=roomIndex(from), b=roomIndex(to); if(a<0||b<0)return false;
    const order=['sonar','command','engine','lab'];
    for(let i=Math.min(a,b);i<Math.max(a,b);i++) if(state.bulkheads[`${order[i]}-${order[i+1]}`]) return true;
    return false;
  }

  function toggleBulkhead(key) {
    if(!running)return;
    const [a,b]=key.split('-');
    const boundary=Math.min(roomIndex(a),roomIndex(b));
    if(!state.bulkheads[key] && Object.values(state.transit).some(trip => {
      const from=roomIndex(trip.from),to=roomIndex(trip.target); return Math.min(from,to)<=boundary&&Math.max(from,to)>boundary;
    })){log('Нельзя закрыть переборку: в переходе находится человек.',true);return;}
    state.bulkheads[key]=!state.bulkheads[key]; tone(state.bulkheads[key]?115:175,.45,.035,'square');
    log(`Переборка ${roomDefs[a].name.toLowerCase()} — ${roomDefs[b].name.toLowerCase()} ${state.bulkheads[key]?'закрыта':'открыта'}.`); renderInterior();
  }

  function setPower(system,value,input) {
    const previous=state.power[system], next=Number(value); state.power[system]=next;
    const total=Object.values(state.power).reduce((sum,item)=>sum+item,0);
    if(total>100){state.power[system]=previous;input.value=previous;tone(120,.12,.025,'square');log('Лимит реактора превышен. Сначала снизьте мощность другой системы.',true);}
    input.nextElementSibling.value=input.value; renderInterior();
  }

  function renderEmergencyObjective(){
    if(!ui.emergency)return;
    const title=ui.emergency.querySelector('b'), text=ui.emergency.querySelector('span');
    ui.emergency.classList.toggle('active',state.emergencyPhase===1);
    if(state.emergencyPhase===0){title.textContent='ОЖИДАНИЕ';text.textContent='Центральный пост готов к борьбе за живучесть.';}
    else if(state.emergencyPhase===1){const left=Math.max(0,Math.ceil((state.emergencyDeadline-performance.now())/1000));title.textContent=`ЛОКАЛИЗОВАТЬ ЗАТОПЛЕНИЕ · ${left}с`;text.textContent='Закройте соседние переборки, устраните пробоину и осушите аварийный отсек до 20%.';}
    else {title.textContent='АВАРИЯ ЛОКАЛИЗОВАНА';text.textContent='Лодка сохранена. Аварийный резерв: +18 энергии, +120 CR.';}
  }

  function emergencyBulkheads(roomId){
    const order=['sonar','command','engine','lab'], index=order.indexOf(roomId), keys=[];
    if(index>0)keys.push(`${order[index-1]}-${order[index]}`);
    if(index<order.length-1)keys.push(`${order[index]}-${order[index+1]}`);
    return keys;
  }

  function startEmergencyMission(now){
    const room=state.rooms.command;
    state.emergencyPhase=1;state.emergencyRoom='command';state.emergencyDeadline=now+120000;
    room.incident='breach';room.emergencyBreach=true;room.water=Math.max(room.water,22);room.health=Math.min(room.health,78);room.pumping=false;
    state.cameraShake=10;state.hull=Math.max(1,state.hull-9);alertSound();
    log('УДАРНАЯ ВОЛНА! Пробоина командного отсека. Локализуйте затопление.',true);renderInterior();
  }

  function updateEmergencyMission(now){
    if(state.emergencyPhase!==1)return;
    const room=state.rooms[state.emergencyRoom], sealed=emergencyBulkheads(room.id).every(key=>state.bulkheads[key]);
    if(sealed&&!room.incident&&room.water<20){
      state.emergencyPhase=2;state.energy=Math.min(100,state.energy+18);state.hull=Math.min(100,state.hull+8);
      state.nextIncidentAt=now+45000;
      if(!state.emergencyRewarded){state.emergencyRewarded=true;profile.credits+=120;saveProfile();renderCrew();}
      collectSound();log('Авария локализована. Отсеки удержали давление. +120 CR.');
    } else if(now>=state.emergencyDeadline){
      state.emergencyDeadline=now+30000;state.hull=Math.max(0,state.hull-18);state.oxygen=Math.max(0,state.oxygen-10);
      damage(4,'Локализация сорвана: вода повреждает центральные магистрали.');
    }
  }

  function selectInteriorCrew(id) {
    if (!state.crew.includes(id) || state.transit[id]) return;
    state.selectedCrew = state.selectedCrew === id ? null : id; renderInterior();
  }

  function assignCrewToRoom(roomId) {
    const id = state.selectedCrew, target = state.rooms[roomId];
    if (!id || !target || state.transit[id] || target.crew.length >= 2 || target.crew.includes(id)) return;
    const current=Object.values(state.rooms).find(room=>room.crew.includes(id));
    if(current&&pathBlocked(current.id,roomId)){log('Маршрут перекрыт герметичной переборкой.',true);tone(110,.16,.025,'square');return;}
    Object.values(state.rooms).forEach(room => room.crew = room.crew.filter(member => member !== id));
    state.transit[id] = { from: current?.id || roomId, target: roomId, arriveAt: performance.now() + 3000 };
    state.selectedCrew = null; log(`${crewCatalog.find(p => p.id === id).name} направляется в отсек.`); renderInterior();
  }

  function togglePassive() {
    const room = state.rooms.sonar;
    if (!running || room.health <= 0 || room.water >= 70) return;
    state.passiveOn = !state.passiveOn; state.passiveTimer = 0;
    ui.passive.classList.toggle('active', state.passiveOn); ui.passive.textContent = state.passiveOn ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ';
    log(state.passiveOn ? 'Пассивный гидрофон активирован. Соблюдайте тишину.' : 'Пассивный гидрофон отключён.');
  }

  function updatePassiveContact() {
    if (!state.passiveOn || state.rooms.sonar.health <= 0 || state.rooms.sonar.water >= 70) {
      ui.passiveContact.textContent = state.rooms.sonar.water >= 70 ? 'ОТСЕК ЗАТОПЛЕН' : state.rooms.sonar.health <= 0 ? 'ПОСТ ОТКЛЮЧЁН' : 'РЕЖИМ ОЖИДАНИЯ';
      ui.passiveBearing.textContent = 'Контакты не обнаружены'; return;
    }
    const range = (crewAt('sonar','sonar') ? 1150 : 720) * roomEfficiency(state.rooms.sonar) * clamp(state.power.sonar/15,.35,1.8);
    const candidates = entities.filter(e => !e.collected && ['mine','wreck','leviathan','specimen'].includes(e.type))
      .map(e => ({ e, d: Math.hypot(e.x-state.x,e.y-state.y,(e.z-state.depth)*.75) })).filter(item => item.d < range).sort((a,b) => a.d-b.d);
    if (!candidates.length) { ui.passiveContact.textContent = 'ТОЛЬКО ФОНОВЫЙ ШУМ'; ui.passiveBearing.textContent = 'Контакты вне диапазона'; return; }
    const {e,d} = candidates[0], angle = Math.atan2(e.y-state.y,e.x-state.x), relative = angleDiff(angle,state.angle)*180/Math.PI;
    const side = Math.abs(relative) < 15 ? 'ПРЯМО ПО КУРСУ' : relative > 0 ? `СПРАВА ${Math.round(Math.abs(relative))}°` : `СЛЕВА ${Math.round(Math.abs(relative))}°`;
    const strength = d < range*.3 ? 'СИЛЬНЫЙ' : d < range*.65 ? 'СРЕДНИЙ' : 'СЛАБЫЙ';
    const type = e.type === 'leviathan' || e.type === 'specimen' ? 'БИОЛОГИЧЕСКИЙ' : 'МЕХАНИЧЕСКИЙ';
    ui.passiveContact.textContent = `${strength} · ${type}`; ui.passiveBearing.textContent = side;
  }

  function triggerIncident(forcedType = null) {
    const available = Object.keys(state.rooms).filter(id => !state.rooms[id].incident);
    if (!available.length) return;
    const possible = Object.entries(incidentDefs).filter(([type,def]) => (!forcedType || type === forcedType) && def.rooms.some(id => available.includes(id)));
    if (!possible.length) return;
    const [type, def] = possible[Math.floor(Math.random()*possible.length)];
    const rooms = def.rooms.filter(id => available.includes(id)), roomId = rooms[Math.floor(Math.random()*rooms.length)], room = state.rooms[roomId];
    room.incident = type; room.repairing = 0; room.pumping = false;
    if (type === 'equipment') room.health = Math.max(0,room.health-16);
    if (type === 'breach') room.water = Math.max(room.water, 4);
    alertSound(); log(`${def.name}: ${roomDefs[roomId].name}.`, true); renderInterior();
  }

  function startRoomRepair(roomId) {
    const room = state.rooms[roomId]; if (!room || room.repairing > 0) return;
    if (room.incident) {
      const baseTime = room.crew.includes('engineer') ? 5 : room.crew.length ? (room.incident === 'breach' ? 13 : 10) : (room.incident === 'breach' ? 20 : 16);
      room.repairing = baseTime / (room.emergencyBreach ? Math.max(.55,roomEfficiency(room)) : roomEfficiency(room));
      room.task = room.crew.includes('engineer') ? 'Инженер герметизирует отсек' : room.crew.length ? 'Экипаж борется за живучесть' : 'Аварийная автоматика ведёт ремонт';
    } else if (room.water >= 1) {
      room.pumping = !room.pumping;
      room.task = room.pumping ? 'Осушительные помпы работают' : 'Откачка воды остановлена';
      log(`${roomDefs[roomId].name}: откачка воды ${room.pumping ? 'начата' : 'остановлена'}.`);
    }
    renderInterior();
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
    state.nextIncidentAt = performance.now() + (65 + Math.random() * 12) * 1000;
    state.emergencyAt = performance.now() + 32000;
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

  function setMiniCourse(event) {
    if (!running) return;
    const rect = miniCanvas.getBoundingClientRect(), cx = rect.width/2, cy = rect.height/2;
    const dx = event.clientX-rect.left-cx, dy = event.clientY-rect.top-cy, radius = Math.min(rect.width,rect.height)*.42;
    const distance = Math.hypot(dx,dy); if (distance > radius*1.15) return;
    const range = 920, factor = range/radius;
    state.targetX = clamp(state.x+dx*factor,90,WORLD-90); state.targetY = clamp(state.y+dy*factor,90,WORLD-90);
    log(`Новый курс: ${Math.round(Math.atan2(dx,-dy)*180/Math.PI+360)%360}°.`);
  }

  function drawMiniSonar(time) {
    const rect = miniCanvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const scale = Math.min(devicePixelRatio||1,2), mw = rect.width, mh = rect.height;
    if (miniCanvas.width !== Math.round(mw*scale) || miniCanvas.height !== Math.round(mh*scale)) {
      miniCanvas.width=Math.round(mw*scale); miniCanvas.height=Math.round(mh*scale);
    }
    miniCtx.setTransform(scale,0,0,scale,0,0); miniCtx.clearRect(0,0,mw,mh);
    const cx=mw/2, cy=mh/2, radius=Math.min(mw,mh)*.42, range=920;
    miniCtx.save(); miniCtx.translate(cx,cy); miniCtx.strokeStyle='rgba(86,233,255,.2)'; miniCtx.lineWidth=1;
    [.33,.66,1].forEach(part=>{miniCtx.beginPath();miniCtx.arc(0,0,radius*part,0,Math.PI*2);miniCtx.stroke();});
    miniCtx.beginPath();miniCtx.moveTo(-radius,0);miniCtx.lineTo(radius,0);miniCtx.moveTo(0,-radius);miniCtx.lineTo(0,radius);miniCtx.stroke();
    const sweep=time*.00055; miniCtx.strokeStyle='rgba(86,233,255,.55)';miniCtx.beginPath();miniCtx.moveTo(0,0);miniCtx.lineTo(Math.cos(sweep)*radius,Math.sin(sweep)*radius);miniCtx.stroke();
    const tx=(state.targetX-state.x)/range*radius,ty=(state.targetY-state.y)/range*radius;
    if(Math.hypot(tx,ty)<=radius*1.2){miniCtx.strokeStyle='#ffca63';miniCtx.beginPath();miniCtx.arc(tx,ty,4,0,7);miniCtx.moveTo(tx-7,ty);miniCtx.lineTo(tx+7,ty);miniCtx.moveTo(tx,ty-7);miniCtx.lineTo(tx,ty+7);miniCtx.stroke();}
    entities.forEach(entity=>{
      if(entity.collected)return; const dx=(entity.x-state.x)/range*radius,dy=(entity.y-state.y)/range*radius;
      if(Math.hypot(dx,dy)>radius)return;
      const passiveVisible=state.passiveOn&&Math.hypot(entity.x-state.x,entity.y-state.y)<(crewAt('sonar','sonar')?1150:720)*roomEfficiency(state.rooms.sonar);
      if(!entity.found&&entity.reveal<=0&&!passiveVisible&&entity.type!=='beacon')return;
      const colors={mine:'#ff6680',wreck:'#ffca63',specimen:'#bc83ff',vent:'#75efad',leviathan:'#ff6680',beacon:'#56e9ff'};
      miniCtx.fillStyle=colors[entity.type]||'#7ba9b2';miniCtx.globalAlpha=(entity.reveal>0||entity.found) ? .9 : .45;miniCtx.beginPath();miniCtx.arc(dx,dy,entity.type==='leviathan'?4:2.4,0,7);miniCtx.fill();miniCtx.globalAlpha=1;
    });
    if(state.pingActive){miniCtx.strokeStyle='rgba(86,233,255,.8)';miniCtx.lineWidth=2;miniCtx.beginPath();miniCtx.arc(0,0,Math.min(radius,state.pingRadius/range*radius),0,7);miniCtx.stroke();}
    miniCtx.rotate(state.angle);miniCtx.fillStyle='#e6fbff';miniCtx.shadowColor='#56e9ff';miniCtx.shadowBlur=8;miniCtx.beginPath();miniCtx.moveTo(9,0);miniCtx.lineTo(-7,-5);miniCtx.lineTo(-4,0);miniCtx.lineTo(-7,5);miniCtx.closePath();miniCtx.fill();miniCtx.restore();
  }

  function ping() {
    const sonarOnline = state.rooms.sonar.health > 0 && state.rooms.sonar.water < 70 && !state.rooms.sonar.incident;
    const sonarPower=clamp(state.power.sonar/15,.35,1.8), cost = Math.ceil((crewAt('sonar','sonar') ? 14 : 18) / (.72 + roomEfficiency(state.rooms.sonar)*.28) / Math.sqrt(sonarPower));
    if (!running || !sonarOnline || state.energy < cost || state.pingActive) return;
    initAudio(); sonarSound(); state.energy -= cost; state.pingRadius = 8; state.pingActive = true; state.pingId++; state.noise=Math.min(100,state.noise+35);
    log('Импульс отправлен. Анализ отражений…');
  }

  function toggleSilent() {
    if (!running) return;
    state.silent = !state.silent; ui.silent.classList.toggle('active', state.silent);
    log(state.silent ? 'Тихий ход. Акустическая сигнатура снижена.' : 'Обычный ход восстановлен.');
  }

  function toggleCooling() {
    const engine=state.rooms.engine;
    if(!running||engine.health<=0||engine.water>=75||state.energy<5)return;
    state.coolingOn=!state.coolingOn;ui.cooling.classList.toggle('active',state.coolingOn);
    log(state.coolingOn?'Контур аварийного охлаждения реактора включён.':'Контур аварийного охлаждения отключён.');
  }

  function repair() {
    const cost = crewAt('engineer','engine') ? 20 : 25, amount = crewAt('engineer','engine') ? 36 : 24;
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
      e.collected = true; state.samples++; collectSound(); state.oxygen = Math.min(100, state.oxygen + 4);
      log('Биообразец сохранён. Назначьте биолога в лабораторию для анализа.');
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

  function updateInteriorSystems(dt) {
    const now = performance.now();
    if(state.emergencyPhase===0&&state.emergencyAt&&now>=state.emergencyAt)startEmergencyMission(now);
    updateEmergencyMission(now);
    Object.entries(state.transit).forEach(([id, trip]) => {
      if (now >= trip.arriveAt) {
        const room = state.rooms[trip.target]; if (room && room.crew.length < 2) room.crew.push(id);
        profile.assignments[id] = trip.target; delete state.transit[id]; saveProfile();
        log(`${crewCatalog.find(p => p.id === id).name} прибыл в ${roomDefs[trip.target].name.toLowerCase()}.`); renderInterior();
      }
    });

    if (state.emergencyPhase!==1 && state.nextIncidentAt && now >= state.nextIncidentAt) {
      triggerIncident();
      state.nextIncidentAt = now + (45 + Math.random() * 35) * 1000;
    }
    state.outsideTemperature = clamp(8-state.depth*.012,-5,8);
    const movingDemand = Math.hypot(state.targetX-state.x,state.targetY-state.y)>8 ? (state.silent ? .45 : 1) : .18;
    const propulsionPower=clamp(state.power.propulsion/35,.2,1.45), pumpPower=clamp(state.power.pumps/25,.18,1.7);
    const thermalTargets = {
      sonar: 17+state.energy*.045+(state.power.life-25)*.16,
      command: 19+state.energy*.04+(state.power.life-25)*.16,
      engine: 31+movingDemand*13+(100-state.energy)*.035,
      lab: 18+state.energy*.045
    };
    if(state.coolingOn)thermalTargets.engine-=20;
    let thermalLoad = 0;
    Object.values(state.rooms).forEach(room=>{
      let target=thermalTargets[room.id];
      if(room.incident==='overheat')target+=42;
      if(room.incident==='fire')target+=30;
      if(room.incident==='short')target+=9;
      const waterCoupling=clamp(room.water/100*.72,0,.72), hullCoupling=.08+state.depth/18000;
      target=target*(1-waterCoupling-hullCoupling)+state.outsideTemperature*(waterCoupling+hullCoupling);
      room.temperature+=(target-room.temperature)*dt*(room.id==='engine' ? .055 : .035);
      const cold=Math.max(0,8-room.temperature), hot=Math.max(0,room.temperature-46);
      thermalLoad+=cold+hot*1.35;
      if(cold>0)room.health=Math.max(0,room.health-cold*.0025*dt);
      if(hot>0){room.health=Math.max(0,room.health-hot*.005*dt);state.energy-=hot*.006*dt;}
      const critical=cold>10||hot>17;
      if(critical&&!room.thermalWarned){room.thermalWarned=true;log(`${roomDefs[room.id].name}: критическая температура ${Math.round(room.temperature)}°C.`,true);}
      if(!critical)room.thermalWarned=false;
    });
    state.temperatureLoad=thermalLoad/4;
    if(state.rooms.engine.temperature>66&&!state.rooms.engine.incident&&now>=state.nextThermalIncidentAt){
      triggerIncident('overheat');state.nextThermalIncidentAt=now+70000;
    }
    let hasAlert = false;
    Object.values(state.rooms).forEach(room => {
      const def = room.incident ? incidentDefs[room.incident] : null;
      if (def) {
        hasAlert = true; room.health = Math.max(0, room.health - def.damage*dt);
        if (def.inflow) room.water = Math.min(100, room.water + def.inflow * dt * (1 + state.depth / 1500) * (room.emergencyBreach ? .35 : 1));
        if (room.incident === 'leak') state.oxygen -= dt*.18;
        if (room.incident === 'short') state.energy -= dt*.5;
        if (room.incident === 'overheat') state.hull -= dt*.16;
        if (room.incident === 'fire') state.oxygen -= dt*.62;
      }
      if (room.repairing > 0) {
        room.repairing -= dt;
        if (room.repairing <= 0) {
          log(`${def.name} устранена: ${roomDefs[room.id].name}.`); room.incident = null; room.emergencyBreach=false; room.health = Math.min(100,room.health+18);
          room.task = room.water >= 1 ? 'Корпус герметичен — требуется откачка' : roomDefs[room.id].task;
        }
      }
      if (room.pumping) {
        if (state.energy <= 0) { room.pumping = false; room.task = 'Откачка остановлена'; }
        else {
          const pumpRate = (room.crew.includes('engineer') ? 4.6 : room.crew.length ? 2.7 : 1.45)*roomEfficiency(room)*pumpPower;
          room.water = Math.max(0, room.water - pumpRate * dt); state.energy -= .09 * pumpPower * dt;
          room.task = `Откачка воды · ${Math.round(room.water)}%`;
          if (room.water <= 0) { room.pumping = false; room.floodWarned = false; room.task = roomDefs[room.id].task; log(`${roomDefs[room.id].name} полностью осушен.`); }
        }
      }
      if (room.water > 45) room.health = Math.max(0, room.health - (room.water / 100) * .035 * dt);
      if (room.water >= 85 && !room.floodWarned) { room.floodWarned = true; log(`${roomDefs[room.id].name}: критическое затопление!`, true); alertSound(); }
      if (room.water >= 1) hasAlert = true;
      room.crew.forEach(id=>{
        const vitals=state.crewVitals[id];if(!vitals)return;
        const working=room.repairing>0||room.pumping||room.incident, thermalStress=Math.max(0,8-room.temperature)+Math.max(0,room.temperature-42);
        vitals.fatigue=clamp(vitals.fatigue+dt*(working?.34:-.09),0,100);
        vitals.stress=clamp(vitals.stress+dt*((room.incident?1.05:0)+(room.water>35?.38:0)+(state.noise>70?.12:0)-(!working?.12:0)),0,100);
        vitals.bodyTemp+=(clamp(room.temperature,0,55)-20-(vitals.bodyTemp-36.6)*5)*dt*.006;
        if(thermalStress>8||room.water>72||room.incident==='fire')vitals.health=clamp(vitals.health-dt*(thermalStress*.008+room.water*.0015+(room.incident==='fire'?.28:0)),1,100);
        else if(vitals.fatigue<65&&vitals.stress<65)vitals.health=clamp(vitals.health+dt*.025,1,100);
      });
    });

    const order = ['sonar','command','engine','lab'];
    order.forEach((id,index) => {
      const room = state.rooms[id]; if (room.water < 78) return;
      [order[index-1],order[index+1]].filter(Boolean).forEach(adjacentId => {
        const adjacent = state.rooms[adjacentId];
        const key=roomIndex(id)<roomIndex(adjacentId)?`${id}-${adjacentId}`:`${adjacentId}-${id}`;
        if (!state.bulkheads[key]&&adjacent.water < room.water - 18) adjacent.water = Math.min(100, adjacent.water + .12 * dt);
      });
    });
    state.floodLevel = getFloodLevel();
    const weights={sonar:-1.5,command:-.5,engine:.5,lab:1.5};
    const targetTrim=Object.values(state.rooms).reduce((sum,room)=>sum+room.water*weights[room.id],0)/15;
    state.trim+=(clamp(targetTrim,-12,12)-state.trim)*dt*.8;
    const activePumps=Object.values(state.rooms).filter(room=>room.pumping).length,activeRepairs=Object.values(state.rooms).filter(room=>room.repairing>0).length;
    const moving=movingDemand>.2, targetNoise=6+(moving?(state.silent?9:27)*propulsionPower:2)+activePumps*9*pumpPower+activeRepairs*6+(state.coolingOn?8:0)+(state.pingActive?28:0)+Math.abs(state.trim)*1.2;
    state.noise+=(clamp(targetNoise,0,100)-state.noise)*dt*(targetNoise>state.noise?2.2:.55);

    if (state.passiveOn) {
      state.passiveTimer -= dt;
      if (state.passiveTimer <= 0) { updatePassiveContact(); state.passiveTimer = crewAt('sonar','sonar') ? 1.2 : 3.4; }
    }

    const lab = state.rooms.lab, waiting = state.samples - state.researched;
    if (waiting > 0 && crewAt('biologist','lab') && lab.health > 0 && !lab.incident && !lab.pumping && lab.water < 55) {
      state.analysisProgress += dt * Math.max(.2,lab.health/100)*roomEfficiency(lab); lab.task = `Анализ образца · ${Math.min(100,Math.round(state.analysisProgress/20*100))}%`;
      if (state.analysisProgress >= 20) {
        state.analysisProgress = 0; state.researched++; profile.researched = state.researched; profile.credits += 180; saveProfile(); renderCrew();
        state.journal.push({title:`БИООБРАЗЕЦ ${String(state.researched).padStart(2,'0')}`,text:'Обнаружена ткань, способная перестраиваться под воздействием гидроакустических волн. Исследовательский грант: 180 CR.',unlocked:true});
        renderJournal(); log('Лабораторный анализ завершён: +180 CR.');
      }
    } else if (waiting > 0 && !lab.pumping) lab.task = crewAt('biologist','lab') ? 'Анализ приостановлен' : 'Для анализа требуется Ада Лин';
    else if (!lab.pumping && lab.water < 1) lab.task = 'Нет образцов для анализа';

    state.saveTimer -= dt;
    if (state.saveTimer <= 0) { state.saveTimer = .5; if (state.view === 'interior' || hasAlert) renderInterior(); }
  }

  function update(dt) {
    updateInteriorSystems(dt);
    const dx = state.targetX - state.x, dy = state.targetY - state.y, dist = Math.hypot(dx, dy);
    const propulsionEfficiency = Math.min(roomEfficiency(state.rooms.engine), .65+roomEfficiency(state.rooms.command)*.35)*clamp(state.power.propulsion/35,.2,1.45);
    const speed = (state.silent ? 42 : 96)*propulsionEfficiency*Math.max(.48,1-Math.abs(state.trim)*.035);
    if (dist > 8) {
      const desired = Math.atan2(dy, dx), diff = angleDiff(desired, state.angle);
      state.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const move = Math.min(dist, speed * dt);
      state.x += Math.cos(state.angle) * move; state.y += Math.sin(state.angle) * move; state.distance += move;
      if (Math.random() < dt * (state.silent ? 2 : 7)) bubbles.push({ x: state.x - Math.cos(state.angle) * 28, y: state.y - Math.sin(state.angle) * 28, life: 1, s: 7 + Math.random() * 9 });
    }
    const floodDepthBias = state.floodLevel * 4.2;
    const effectiveTargetDepth = clamp(state.targetDepth + floodDepthBias, 0, 1240);
    const vertical = effectiveTargetDepth - state.depth, verticalRate = vertical < 0 ? Math.max(16, 58 - state.floodLevel * .38) : 42;
    state.depth += Math.sign(vertical) * Math.min(Math.abs(vertical), verticalRate * dt);
    const depthLoad = Math.max(0, (state.depth - 850) / 400);
    if (state.depth < 12) {
      state.oxygen = Math.min(100, state.oxygen + dt * 5.5);
      if (!state.surfaced) { state.surfaced = true; log('Поверхность достигнута. Забортный воздух поступает в систему.'); }
    } else { state.surfaced = false; state.oxygen -= dt * (.205 + depthLoad * .12) * clamp(25/state.power.life,.65,2.5); }
    const engineEfficiency = Math.max(.08,state.rooms.engine.health/100) * (state.rooms.engine.incident ? .55 : 1) * Math.max(.12,1-state.rooms.engine.water/112);
    state.energy = clamp(state.energy + dt * ((state.silent ? 2.4 : 1.35) + (crewAt('engineer','engine') ? .42 : 0)) * engineEfficiency - dt * depthLoad * .34 - dt*state.temperatureLoad*.018 - (state.coolingOn ? dt*.72 : 0),0,100);
    if(state.coolingOn&&(state.energy<=1||state.rooms.engine.water>=75||state.rooms.engine.health<=0)){state.coolingOn=false;ui.cooling.classList.remove('active');log('Аварийное охлаждение отключилось.');}
    if (audioNodes) {
      audioNodes.ambient.gain.setTargetAtTime(.012 + depthLoad * .018, audio.currentTime, .4);
      audioNodes.propeller.gain.setTargetAtTime(.002+state.noise*.00013, audio.currentTime, .3);
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
      const sonarBoost = crewAt('sonar','sonar') ? 1.3 : 1;
      state.pingRadius += dt * 760 * sonarBoost * clamp(state.power.sonar/15,.35,1.8);
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
        e.collected = true; damage(18, 'Мина! Пробоина внешнего корпуса.'); triggerIncident('breach');
      }
      if (e.type === 'vent' && horizontal < 75 && verticalGap < 100) {
        state.energy = Math.min(100, state.energy + dt * 7); e.reveal = 2;
      }
      if (e.type === 'leviathan') {
        const hear = Math.hypot(e.x - state.x, e.y - state.y, (e.z-state.depth)*.7);
        const acousticRange=260+state.noise*5.2;
        if (state.noise>24 && hear < acousticRange) {
          const a = Math.atan2(state.y - e.y, state.x - e.x);
          e.x += Math.cos(a) * dt * 72; e.y += Math.sin(a) * dt * 72; e.found = true; e.reveal = 1.2;
        } else { e.x += Math.cos(e.phase * .23) * dt * 15; e.y += Math.sin(e.phase * .19) * dt * 15; }
        if (hear < 72 && e.reveal > 0) { damage(12 * dt, 'Крупный контакт у борта! Снизьте акустический шум.'); }
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
    ui.ballast.textContent = state.floodLevel >= 4 ? `ЗАТОПЛЕНИЕ ${Math.round(state.floodLevel)}%` : Math.abs(vertical) < 4 ? 'НЕЙТРАЛЬНО' : vertical > 0 ? 'БАЛЛАСТ +' : 'ПРОДУВКА';
    const pingCost = Math.ceil((crewAt('sonar','sonar') ? 14 : 18) / (.72+roomEfficiency(state.rooms.sonar)*.28) / Math.sqrt(clamp(state.power.sonar/15,.35,1.8))), repairCost = crewAt('engineer','engine') ? 20 : 25;
    ui.ping.disabled = state.rooms.sonar.health <= 0 || state.rooms.sonar.water >= 70 || !!state.rooms.sonar.incident || state.energy < pingCost || state.pingActive; ui.ping.querySelector('small').textContent = state.rooms.sonar.water >= 70 ? 'отсек затоплен' : state.rooms.sonar.health <= 0 ? 'пост отключён' : `−${pingCost} энергии`;
    ui.cooling.disabled=state.rooms.engine.health<=0||state.rooms.engine.water>=75||state.energy<5;ui.cooling.querySelector('small').textContent=state.coolingOn?'расход энергии':'реактор';
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
    draw(now); drawMiniSonar(now); requestAnimationFrame(loop);
  }

  canvas.addEventListener('pointerdown', e => setCourse(e.clientX, e.clientY));
  miniCanvas.addEventListener('pointerdown', setMiniCourse);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('.compartment').forEach(card => {
    card.addEventListener('click', () => assignCrewToRoom(card.dataset.room));
    card.querySelector('.room-action').addEventListener('click', event => { event.stopPropagation(); startRoomRepair(card.dataset.room); });
  });
  document.querySelectorAll('[data-bulkhead]').forEach(button=>button.addEventListener('click',()=>toggleBulkhead(button.dataset.bulkhead)));
  document.querySelectorAll('[data-power]').forEach(input=>input.addEventListener('input',()=>setPower(input.dataset.power,input.value,input)));
  ui.passive.addEventListener('click', togglePassive);
  ui.ping.addEventListener('click', ping); ui.silent.addEventListener('click', toggleSilent); ui.cooling.addEventListener('click',toggleCooling); ui.repair.addEventListener('click', repair);
  ui.action.addEventListener('click', interact);
  $('ascendBtn').addEventListener('click', () => changeDepth(-120));
  $('descendBtn').addEventListener('click', () => changeDepth(120));
  $('surfaceBtn').addEventListener('click', surface);
  $('journalBtn').addEventListener('click', openJournal); $('closeJournalBtn').addEventListener('click', closeJournal);
  $('crewBtn').addEventListener('click', openCrew); $('openCrewIntroBtn').addEventListener('click', openCrew); $('closeCrewBtn').addEventListener('click', closeCrew);
  $('startBtn').addEventListener('click', start); $('restartBtn').addEventListener('click', start);
  addEventListener('resize', resize); resize(); reset(); draw(0); drawMiniSonar(0);
  const best = Number(localStorage.getItem('depth-best') || 0); if (best) ui.best.textContent = `Лучшее погружение: ${formatTime(best)}`;
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
