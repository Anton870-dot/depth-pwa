(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
  const ui = {
    ocean: $('ocean'), sonar: $('sonar'), intro: $('intro'), start: $('startBtn'),
    missions: $('missionsOverlay'), missionsBtn: $('missionsBtn'), closeMissions: $('closeMissions'), missionList: $('missionList'),
    journal: $('journalOverlay'), journalBtn: $('journalBtn'), closeJournal: $('closeJournal'), journalEntries: $('journalEntries'),
    event: $('eventOverlay'), eventType: $('eventType'), eventTitle: $('eventTitle'), eventText: $('eventText'), eventQuote: $('eventQuote'),
    eventGlyph: $('eventGlyph'), eventChoices: $('eventChoices'), eventResult: $('eventResult'), eventContinue: $('eventContinue'),
    end: $('endOverlay'), endEyebrow: $('endEyebrow'), endTitle: $('endTitle'), endText: $('endText'), endBtn: $('endBtn'),
    missionTitle: $('missionTitle'), missionObjective: $('missionObjective'), routeProgress: $('routeProgress'), routeText: $('routeText'),
    depth: $('depthValue'), zone: $('zoneName'), hullText: $('hullText'), hullBar: $('hullBar'), energyText: $('energyText'), energyBar: $('energyBar'),
    oxygenText: $('oxygenText'), oxygenBar: $('oxygenBar'), heatText: $('heatText'), heatBar: $('heatBar'), continueBtn: $('continueBtn'),
    continueHint: $('continueHint'), log: $('messageLog'), sub: $('submarine'), shipStatus: $('shipStatus'), ambient: $('ambientStatus'),
    contactTitle: $('contactTitle'), contactText: $('contactText'), hydroTask: $('hydroTask'), commandTask: $('commandTask'),
    reactorTask: $('reactorTask'), labTask: $('labTask')
  };

  const SAVE_KEY = 'under-ice-europa-v17-release';
  const missions = [
    { id:'prometheus', glyph:'⌁', danger:'НИЗКАЯ ОПАСНОСТЬ', title:'Последний сигнал «Прометея»', region:'ЛЕДЯНОЙ КАНЬОН · 38 КМ', objective:'Добраться до молчащей научной станции и выяснить, почему оборвалась связь.', steps:5, depth:2760, tags:['signal','station'], final:'prometheus_final' },
    { id:'garden', glyph:'✣', danger:'СРЕДНЯЯ ОПАСНОСТЬ', title:'Сад чёрных курильщиков', region:'ТЕРМАЛЬНЫЙ РАЗЛОМ · 71 КМ', objective:'Взять живые образцы возле гидротермального поля.', steps:6, depth:4180, tags:['biology','vent'], final:'garden_final' },
    { id:'leviathan', glyph:'◖', danger:'ВЫСОКАЯ ОПАСНОСТЬ', title:'След Левиафана', region:'ТЁМНАЯ РАВНИНА · 96 КМ', objective:'Установить маяк на пути гигантского организма и вернуться незамеченными.', steps:7, depth:6350, tags:['creature','abyss'], final:'leviathan_final' },
    { id:'door', glyph:'◇', danger:'НЕИЗВЕСТНАЯ ОПАСНОСТЬ', title:'Дверь на дне', region:'АБИССАЛЬ · ГЛУБИНА НЕИЗВЕСТНА', objective:'Исследовать правильную структуру, обнаруженную под слоем донных отложений.', steps:8, depth:9820, tags:['ruin','abyss'], final:'door_final', locked:2 }
  ];

  const choice = (title, desc, result, effects = {}, special = '') => ({ title, desc, result, effects, special });
  const events = [
    {id:'ice_song',type:'АКУСТИЧЕСКАЯ АНОМАЛИЯ',glyph:'〽',title:'Песня ледяной коры',text:'Через корпус проходит низкий многоголосый гул. Лёд над лодкой сжимается приливными силами Юпитера.',quote:'Соколова: «Это похоже на хор. Только каждая нота весит миллиард тонн».',choices:[
      choice('Остановиться и записать звук','Научная запись потребует времени и обогрева.','Спектр льда сохранён. Внутри гула обнаружился повторяющийся искусственный ритм.',{energy:-5,oxygen:-3,discovery:1},'Соколова · гидроакустик'),
      choice('Уйти глубже','Увеличить дистанцию от нестабильной коры.','«Нереида» мягко уходит вниз. Гул остаётся над корпусом.',{energy:-3,heat:-3,depth:260}),
      choice('Продолжить курс','Не тратить ресурсы на безопасный манёвр.','Через минуту сверху падают ледяные обломки. Один удар приходится по корме.',{hull:-7})
    ]},
    {id:'shadow',type:'БИОЛОГИЧЕСКИЙ КОНТАКТ',glyph:'◒',title:'Тень над лодкой',text:'Нечто огромное повторяет курс «Нереиды» под ледяным потолком. Пассивный сонар слышит движение мягких тканей.',quote:'Лин: «Оно не охотится. Кажется, оно нас рассматривает».',choices:[
      choice('Погасить свет','Остановить реактор и переждать.','Свет в отсеках гаснет. Через долгие четыре минуты тень уходит.',{energy:4,heat:-12,oxygen:-3},'Марек · инженер'),
      choice('Передать низкую частоту','Попытаться ответить существу.','Существо отвечает тремя ударами. Перед уходом оно оставляет на корпусе слой светящейся слизи.',{energy:-7,discovery:2},'Соколова · гидроакустик'),
      choice('Полный ход','Оторваться от контакта.','Винты ревут. Тень отстаёт, но перегретый привод забирает слишком много энергии.',{energy:-14,heat:9})
    ]},
    {id:'warm_current',type:'ОКЕАН',glyph:'≈',title:'Тёплое течение',text:'Температура за бортом неожиданно повышается на девять градусов. Поток ведёт в сторону от маршрута.',quote:'Марек: «Можно прогреть отсеки бесплатно. Если течение не унесёт нас в трещину».',choices:[
      choice('Войти в поток','Довериться течению и сберечь тепло.','Корпус обволакивает тёплая вода. За поворотом обнаружены колонии прозрачных существ.',{heat:18,energy:5,discovery:1}),
      choice('Использовать теплообменник','Не менять курс, забрать часть тепла.','Резервуары прогреты, но насосы израсходовали энергию.',{heat:10,energy:-5}),
      choice('Обойти аномалию','Безопасно, но переход станет длиннее.','Поток остаётся позади. В рубке снова слышно только работу винтов.',{oxygen:-5})
    ]},
    {id:'wreck_probe',type:'НАХОДКА',glyph:'✦',title:'Мёртвый зонд',text:'В луче прожектора появляется земной автоматический зонд. По маркировке он был потерян двадцать три года назад.',quote:'Лин: «Его память могла сохраниться. И то, что оборвало связь — тоже».',choices:[
      choice('Поднять зонд','Манипулятору придётся работать возле острой ледяной кромки.','Зонд поднят. В памяти — кадр огромного глаза в момент потери связи.',{energy:-6,hull:-2,discovery:2},'Лин · ксенобиолог'),
      choice('Скачать данные кабелем','Медленнее, зато объект останется снаружи.','Получена половина архива и координаты неизвестного источника тепла.',{energy:-9,oxygen:-3,discovery:1}),
      choice('Оставить его','Не всякая находка стоит риска.','Старый аппарат исчезает в темноте за кормой.',{})
    ]},
    {id:'microfracture',type:'АВАРИЯ',glyph:'⌁',title:'Микротрещина',text:'Датчики фиксируют тонкую струю воды в машинном отделении. Давление быстро расширяет дефект.',quote:'Марек: «Пять минут — и здесь будет бассейн. Три — если будем спорить».',choices:[
      choice('Залатать изнутри','Остановить лодку и поставить композитную заплату.','Марек успевает перекрыть течь. На палубе остаётся несколько сантиметров воды.',{energy:-6,oxygen:-4,hull:3},'Марек · инженер'),
      choice('Снизить давление','Подняться ближе ко льду.','Трещина перестаёт расти, но путь проходит через опасную ледяную зону.',{energy:-4,depth:-420,hull:-3}),
      choice('Изолировать машинный отсек','Сохранить корпус ценой температуры.','Переборки закрыты. Реактор работает без охлаждающего контура.',{heat:17,hull:-2})
    ]},
    {id:'lights',type:'НЕИЗВЕСТНАЯ ЖИЗНЬ',glyph:'✧',title:'Огни в бездне',text:'Под лодкой загораются сотни голубых точек. Они собираются в точную копию созвездия Ориона.',quote:'Лин: «Они никогда не видели земного неба. Кто тогда научил их этому?»',choices:[
      choice('Опуститься к огням','Пойти на прямой контакт.','Огни облепляют обзорные окна, а затем складываются в карту океанских течений.',{energy:-8,heat:-4,discovery:3},'Лин · ксенобиолог'),
      choice('Снять спектр издалека','Безопасное наблюдение с маршрута.','Спектрометр подтверждает: свет создают живые клетки с металлическими включениями.',{energy:-4,discovery:1}),
      choice('Погасить наружное освещение','Не привлекать неизвестную колонию.','Созвездие распадается и тонет в темноте.',{energy:3})
    ]},
    {id:'pressure_wave',type:'ОПАСНОСТЬ',glyph:'◉',title:'Ударная волна',text:'Сонар фиксирует быстро приближающийся фронт давления. Где-то в темноте обрушилась ледяная гора.',quote:'Соколова: «Волна через сорок секунд. Встретим носом или спрячемся за скалой».',choices:[
      choice('Развернуться носом','Принять удар самой прочной частью корпуса.','Лодку отбрасывает назад. Крепления выдерживают.',{hull:-5,energy:-3}),
      choice('Укрыться за уступом','Рискованный манёвр между скалами.','Волна проходит над укрытием, но борт касается камня.',{hull:-3,energy:-8}),
      choice('Продуть балласт','Резко подняться над основным фронтом.','Манёвр удаётся. Потрачено много воздуха из резервов.',{oxygen:-11,energy:-4,depth:-300})
    ]},
    {id:'black_water',type:'АНОМАЛИЯ',glyph:'●',title:'Чёрная вода',text:'Прожекторы перестают освещать пространство впереди. Вода поглощает свет, радио и даже импульсы лидара.',quote:'Соколова: «Гидрофон тоже ослеп. Впервые я слышу абсолютную тишину».',choices:[
      choice('Идти по инерциальной системе','Не останавливаться в неизвестной среде.','Через семь километров звёздная тьма отступает. Курс почти не изменился.',{energy:-5,oxygen:-4}),
      choice('Выпустить проводной буй','Оставить акустический ориентир позади.','Буй подтверждает: чёрная зона движется против течения, словно единое тело.',{energy:-7,discovery:2}),
      choice('Ждать','Позволить аномалии пройти самой.','Тишина длится час. Тепло уходит быстрее расчётного.',{heat:-14,oxygen:-7})
    ]},
    {id:'metal_rain',type:'ОКЕАНИЧЕСКОЕ ЯВЛЕНИЕ',glyph:'⋮',title:'Металлический дождь',text:'Сверху падают блестящие кристаллы солей. Они звенят по корпусу и оседают на винтах.',quote:'Марек: «Красиво. И очень скоро заклинит движитель».',choices:[
      choice('Включить обратный ход','Стряхнуть нарост с винтов.','Резкий реверс очищает движитель, но перегружает энергосистему.',{energy:-10,heat:7}),
      choice('Собрать образец','Пройти медленно, открыв приёмный контейнер.','В кристаллах найдены сложные органические молекулы.',{oxygen:-4,discovery:2},'Лин · ксенобиолог'),
      choice('Обойти облако','Потратить время, сохранив механизмы.','«Нереида» делает широкий крюк.',{oxygen:-6})
    ]},
    {id:'thermal_fault',type:'АВАРИЯ',glyph:'♨',title:'Перегрев контура',text:'Температура первого контура растёт. На панели реактора мигают сразу три несовместимых показания.',quote:'Марек: «Или датчики лгут, или реактор сейчас научит нас новой физике».',choices:[
      choice('Заглушить реактор','Перейти на аккумуляторы до диагностики.','Причиной оказался организм, выросший вокруг температурного датчика.',{energy:-9,heat:-11,discovery:1},'Марек · инженер'),
      choice('Открыть внешний контур','Пропустить океанскую воду через аварийный теплообменник.','Реактор охлаждён. Солёная вода повредила часть трубопроводов.',{heat:-18,hull:-4}),
      choice('Сбросить нагрузку','Отключить лабораторию и прожекторы.','Температура возвращается в норму, но часть наблюдений потеряна.',{heat:-9,energy:5,discovery:-1})
    ]},
    {id:'voice',type:'СИГНАЛ',glyph:'⌇',title:'Голос снаружи',text:'Приёмник фиксирует человеческий голос. Он повторяет имя капитана и просит открыть шлюз. Источник движется рядом с лодкой.',quote:'Соколова: «Это мой голос. Запись сделана сейчас, но я ничего не говорила».',choices:[
      choice('Ответить вопросом','Проверить, понимает ли источник речь.','Голос отвечает координатами, расположенными на девять километров ниже дна.',{energy:-4,discovery:2}),
      choice('Сохранить молчание','Не давать источнику новой информации.','Голос перечисляет имена всего экипажа и затихает.',{oxygen:-2}),
      choice('Дать активный импульс','Получить физический силуэт источника.','Отражение показывает объект размером с человека прямо на внешнем корпусе.',{energy:-10,hull:-2,discovery:1})
    ]},
    {id:'nursery',type:'БИОЛОГИЯ',glyph:'◌',title:'Питомник',text:'В ущелье висят тысячи прозрачных капсул. В каждой медленно развивается существо, похожее на маленькую подлодку.',quote:'Лин: «Это не мимикрия. Они выглядели так задолго до нашего прибытия».',choices:[
      choice('Взять пустую оболочку','Не тревожить живые капсулы.','Оболочка состоит из белка и сплава никеля, выращенных как единая ткань.',{energy:-5,discovery:2},'Лин · ксенобиолог'),
      choice('Наблюдать издалека','Записать цикл развития колонии.','Одна из капсул раскрывается. Детёныш следует за лодкой несколько километров.',{oxygen:-5,discovery:1}),
      choice('Покинуть ущелье','Не рисковать рядом с неизвестным выводком.','За кормой синхронно гаснут тысячи слабых огней.',{})
    ]},
    {id:'icefall',type:'НАВИГАЦИЯ',glyph:'▼',title:'Ледопад',text:'С потолка океана рушится целое поле ледяных игл. Автоматический маршрут проходит прямо под ним.',quote:'Соколова: «Автопилот предлагает обход. Я бы ему поверила».',choices:[
      choice('Обойти поле','Надёжный, но долгий путь.','Ледопад остаётся в стороне. Расход кислорода возрастает.',{oxygen:-7,energy:-3}),
      choice('Пройти под ним','Сэкономить время, рискуя корпусом.','Несколько обломков ударяют по верхней броне.',{hull:-9,energy:-2}),
      choice('Спрятаться в расселине','Переждать обрушение без движения.','Узкая расселина защищает лодку и открывает залежи редких минералов.',{heat:-6,discovery:1})
    ]},
    {id:'lost_station',type:'НАХОДКА',glyph:'⌂',title:'Станция без окон',text:'На дне стоит исследовательский модуль неизвестной серии. Все иллюминаторы заварены снаружи.',quote:'Марек: «По креплениям — земная работа. Но таких станций в реестре нет».',choices:[
      choice('Состыковаться','Войти через исправный шлюз.','Внутри тепло и пусто. На стене свежая надпись: «НЕ СЛУШАЙТЕ ГЛУБИНУ».',{oxygen:8,energy:7,discovery:2}),
      choice('Просканировать корпус','Не открывать лодку рядом с неизвестным объектом.','Под внешней обшивкой станции движется жидкость, не совпадающая с океанской водой.',{energy:-6,discovery:1}),
      choice('Отметить координаты','Вернуться к объекту позднее с подготовленной группой.','Маяк закреплён. Станция немедленно начинает медленно уходить в ил.',{energy:-2})
    ]},
    {id:'battery_bloom',type:'ТЕХНИКА',glyph:'⚡',title:'Цветение батарей',text:'В аккумуляторном блоке выросли тонкие белые нити. Они проводят ток лучше штатных шин.',quote:'Марек: «Они питаются утечкой энергии. Вопрос — что будет, когда проголодаются».',choices:[
      choice('Оставить колонию','Использовать неизвестную жизнь как проводник.','Сопротивление сети падает, батареи заряжаются быстрее.',{energy:14,discovery:1}),
      choice('Удалить и сохранить','Очистить батареи, образец передать в лабораторию.','Сеть снова безопасна. Нити продолжают светиться в герметичном контейнере.',{energy:-3,discovery:2},'Лин · ксенобиолог'),
      choice('Стерилизовать отсек','Не допустить заражения оборудования.','Нити сгорают, оставляя на металле схему, похожую на маршрут.',{energy:-6,heat:5})
    ]},
    {id:'current_wall',type:'НАВИГАЦИЯ',glyph:'↯',title:'Стена течения',text:'Поперечный поток держит лодку на месте. Двигатели работают, но расстояние до цели не уменьшается.',quote:'Марек: «Можем продавить. Только реактор потом попросит отпуск».',choices:[
      choice('Дать полный ход','Пробиться сквозь поток напрямую.','Двигатели выдерживают, температура реактора резко растёт.',{energy:-12,heat:13}),
      choice('Найти слабое место','Исследовать границу течения пассивными датчиками.','Соколова находит узкий спокойный канал.',{oxygen:-5,energy:-4},'Соколова · гидроакустик'),
      choice('Позволить потоку нести лодку','Выяснить, куда он направляется.','Поток выносит «Нереиду» к тёплой пещере, а затем возвращает на курс.',{heat:8,oxygen:-6,discovery:1})
    ]},
    {id:'hull_knock',type:'НЕИЗВЕСТНЫЙ КОНТАКТ',glyph:'···',title:'Три удара',text:'Снаружи раздаются три равномерных удара. После паузы — ещё три. Камеры не показывают источник.',quote:'Соколова: «Это не лёд. Интервал слишком точный».',choices:[
      choice('Ответить тремя ударами','Использовать манипулятор как сигнальный молоток.','Снаружи отвечают: три, один, четыре. Последовательность продолжается простыми числами.',{energy:-3,discovery:2}),
      choice('Включить внешние камеры','Осветить корпус со всех сторон.','На обшивке никого нет. Удары перемещаются изнутри к лаборатории.',{energy:-7}),
      choice('Увеличить скорость','Оставить источник позади.','Удары продолжаются ещё минуту, хотя лодка идёт полным ходом.',{energy:-9,heat:5})
    ]},
    {id:'blue_fog',type:'ОКЕАН',glyph:'∴',title:'Голубой туман',text:'Вода наполнена микроскопическими светящимися организмами. Видимость падает до двух метров.',quote:'Лин: «Каждая клетка поворачивается к нам. Весь туман смотрит».',choices:[
      choice('Двигаться медленно','Не повреждать колонию винтами.','Туман расступается перед носом, словно понимает намерение.',{oxygen:-5,discovery:1}),
      choice('Забрать воду в лабораторию','Получить живой образец колонии.','В контейнере клетки складываются в копию схемы «Нереиды».',{energy:-5,discovery:2},'Лин · ксенобиолог'),
      choice('Очистить путь ультразвуком','Быстро освободить пространство перед лодкой.','Организмы гаснут. Через секунду сонар слышит далёкий ответный крик.',{energy:-8})
    ]},
    {id:'magnetic_storm',type:'АНОМАЛИЯ',glyph:'⌇',title:'Магнитная буря',text:'Поле Юпитера проникает сквозь лёд. Компасы вращаются, в рубке мерцает аварийное освещение.',quote:'Марек: «Экранирование держится. Пока запах озона считается нормой».',choices:[
      choice('Отключить электронику','Переждать на механических системах.','Буря проходит. Отсеки успевают заметно остыть.',{heat:-10,oxygen:-4}),
      choice('Использовать поле для зарядки','Развернуть индукционный контур.','Катушки поют от нагрузки, но аккумуляторы наполняются энергией.',{energy:18,hull:-3,discovery:1},'Марек · инженер'),
      choice('Продолжить по счислению','Не терять время на остановку.','Курс сохранён, но несколько приборов выгорают.',{energy:-4,hull:-5})
    ]},
    {id:'frozen_cable',type:'СЛЕД ЭКСПЕДИЦИИ',glyph:'⌁',title:'Кабель в темноте',text:'На дне лежит силовой кабель земного производства. Он уходит к цели маршрута и в противоположную сторону.',quote:'Соколова: «По документам здесь никогда не было линий связи».',choices:[
      choice('Следовать к источнику','Ненадолго отклониться от курса.','Кабель заканчивается работающим ретранслятором с датой запуска из будущего.',{oxygen:-6,energy:-4,discovery:3}),
      choice('Подключиться','Попытаться прочитать трафик линии.','По кабелю передаётся карта движения «Нереиды» на двадцать минут вперёд.',{energy:-7,discovery:2}),
      choice('Перерезать кабель','Устранить возможный маяк слежения.','После разрыва все внешние шумы замолкают на девять секунд.',{energy:-3})
    ]},
    {id:'sleeping_one',type:'БИОЛОГИЧЕСКИЙ КОНТАКТ',glyph:'◓',title:'Спящий на дне',text:'Рельеф впереди делает вдох. То, что считалось горным хребтом, медленно поднимается и снова опускается.',quote:'Лин: «Длина объекта — четыре километра. Пожалуйста, не будите его».',choices:[
      choice('Обойти на тихом ходу','Потратить кислород ради безопасного пути.','Шум винтов стихает. Огромное существо продолжает спать.',{oxygen:-9,energy:-3}),
      choice('Снять биометрические данные','Приблизиться к поверхности организма.','Датчики фиксируют сердцебиение с интервалом в семнадцать минут.',{energy:-8,discovery:3},'Лин · ксенобиолог'),
      choice('Пройти над ним','Самый короткий путь к цели.','На середине хребта раскрывается ряд светящихся органов. Корпус задевает поднявшуюся пластину.',{hull:-12,energy:-4})
    ]},
    {id:'oxygen_algae',type:'НАХОДКА',glyph:'❋',title:'Кислородный риф',text:'Анализ воды показывает облако свободного кислорода вокруг белого рифа. Биомасса расщепляет океанскую воду.',quote:'Лин: «Можно пополнить запас. Только фильтры впустят часть спор».',choices:[
      choice('Заполнить баллоны','Пропустить газ через систему очистки.','Запас кислорода восстановлен. Несколько спор всё же попали в вентиляцию.',{oxygen:20,energy:-5,discovery:1}),
      choice('Взять только образец','Не подключать риф к системе жизнеобеспечения.','Образец герметизирован и сохранён для станции.',{energy:-3,discovery:2},'Лин · ксенобиолог'),
      choice('Не приближаться','Слишком велик риск биологического заражения.','Белый свет рифа медленно исчезает за кормой.',{})
    ]},
    {id:'false_bottom',type:'АНОМАЛИЯ',glyph:'▱',title:'Второе дно',text:'Эхолот показывает твёрдую поверхность в сорока метрах под лодкой. Камеры видят ещё километры чёрной воды.',quote:'Соколова: «Звук отражается от пустоты. Так не бывает».',choices:[
      choice('Опустить зонд','Проверить невидимую границу беспилотным аппаратом.','Зонд касается пустоты и исчезает. Через секунду сигнал приходит сверху.',{energy:-7,discovery:3}),
      choice('Пересечь границу','Погрузить саму лодку сквозь ложное дно.','На миг океан оказывается над и под «Нереидой» одновременно. Все часы отстают на минуту.',{hull:-4,energy:-5,heat:-5,discovery:2}),
      choice('Сменить глубину','Не проверять аномалию ценой лодки.','Ложное отражение преследует лодку ещё несколько километров.',{energy:-3})
    ]},
    {id:'reactor_echo',type:'ТЕХНИКА',glyph:'◎',title:'Второй реактор',text:'Датчики фиксируют рядом источник излучения, полностью повторяющий режим нашего реактора с задержкой в две секунды.',quote:'Марек: «Либо у нас появился двойник, либо кто-то очень хорошо притворяется».',choices:[
      choice('Изменить мощность по коду','Передать последовательность через колебания реактора.','Источник повторяет код и добавляет неизвестный символ.',{energy:-8,heat:7,discovery:2},'Марек · инженер'),
      choice('Заглушить реактор','Посмотреть, исчезнет ли отражение.','Наш реактор умолкает. Второй продолжает работать ещё девять секунд.',{energy:-6,heat:-8,discovery:1}),
      choice('Удалиться','Не вступать в контакт с источником радиации.','Отражение следует за лодкой, затем резко уходит вниз.',{energy:-7})
    ]},
    {id:'glass_forest',type:'ОТКРЫТИЕ',glyph:'♢',title:'Стеклянный лес',text:'Дно покрывают прозрачные стволы высотой с небоскрёб. Внутри каждого медленно движется тёплая жидкость.',quote:'Лин: «Это лес. Только его корни уходят сквозь океанское дно».',choices:[
      choice('Пройти между стволами','Исследовать экосистему изнутри.','Стволы отвечают на свет лодки волной биолюминесценции.',{energy:-5,oxygen:-4,discovery:3}),
      choice('Срезать маленькую ветвь','Получить образец структуры.','Срез мгновенно затягивается, а весь лес на секунду темнеет.',{energy:-6,discovery:2}),
      choice('Обойти лес','Сохранить дистанцию от огромной колонии.','Прозрачные вершины ещё долго отражают огни «Нереиды».',{oxygen:-4})
    ]},
    {id:'abandoned_bell',type:'СЛЕД ЛЮДЕЙ',glyph:'♧',title:'Спусковой колокол',text:'В толще воды висит старый батискаф. Трос оборван, люк открыт, внутри горит красная лампа.',quote:'Соколова: «Модель земная. Но первый аппарат такого типа прибудет сюда только через шесть лет».',choices:[
      choice('Осмотреть кабину','Состыковаться с открытым аппаратом.','В кресле лежит пустой скафандр. На стекле изнутри выцарапано имя капитана.',{oxygen:-5,energy:-4,discovery:3}),
      choice('Снять бортовой журнал','Передать данные направленным лучом.','Журнал содержит запись нашей экспедиции вплоть до текущей минуты.',{energy:-8,discovery:2}),
      choice('Уничтожить аппарат','Не позволить аномалии следовать за лодкой.','Торпеда разрывает колокол. Красная лампа продолжает гореть среди обломков.',{energy:-6})
    ]},
    {id:'salt_bridge',type:'НАВИГАЦИЯ',glyph:'⌒',title:'Соляной мост',text:'Каньон пересекает арка из чистого льда и солей. Под ней проходит кратчайший путь к цели.',quote:'Марек: «Арка выдержит. Наверное. На Европе слово “наверное” особенно бодрит».',choices:[
      choice('Пройти под аркой','Сэкономить ресурсы и принять риск.','Арка трещит, но лодка успевает пройти до обрушения.',{hull:-3,energy:-2}),
      choice('Укрепить импульсом тепла','Расплавить нестабильные выступы заранее.','Тепловой луч очищает проход, расходуя большой заряд.',{energy:-10,heat:5}),
      choice('Обойти каньон','Выбрать длинный безопасный маршрут.','Переход проходит спокойно и холодно.',{oxygen:-6,heat:-5})
    ]}
  ];

  const finalEvents = {
    prometheus_final:{id:'prometheus_final',type:'ЦЕЛЬ ЭКСПЕДИЦИИ',glyph:'⌂',title:'Станция «Прометей»',text:'Станция цела, свет включён, шлюз открыт. Внутри нет людей. Центральный компьютер повторяет одну фразу: «Экипаж ещё не прибыл».',quote:'Соколова: «Их последний сигнал пришёл отсюда три недели назад».',choices:[
      choice('Забрать архив станции','Скачать исследования и оставить станцию запечатанной.','В архиве обнаружены записи о сигнале, который предсказывал действия экипажа.',{energy:-8,discovery:5,complete:1}),
      choice('Войти внутрь','Осмотреть жилые отсеки лично.','На столе лежит свежая фотография «Нереиды», сделанная снаружи пять минут назад.',{oxygen:-7,discovery:7,complete:1}),
      choice('Перезапустить компьютер','Попытаться восстановить хронологию событий.','После перезапуска компьютер приветствует «экипаж, вернувшийся спустя 184 года».',{energy:-12,discovery:6,complete:1})
    ]},
    garden_final:{id:'garden_final',type:'ЦЕЛЬ ЭКСПЕДИЦИИ',glyph:'✣',title:'Сад чёрных курильщиков',text:'Вокруг горячих источников растёт город живых башен. Они перекачивают минералы и обмениваются вспышками света.',quote:'Лин: «Это не колония. Это цивилизация, которой не нужны слова».',choices:[
      choice('Взять отросток с края','Получить образец, почти не тревожа сад.','Отросток отделяется сам и запечатывает контейнер собственной оболочкой.',{energy:-5,discovery:6,complete:1}),
      choice('Передать световой рисунок','Попытаться представиться колонии.','Весь сад отвечает изображением Солнечной системы. Возле Европы уже отмечена точка.',{energy:-8,discovery:8,complete:1},'Лин · ксенобиолог'),
      choice('Только наблюдать','Не вмешиваться в первую встречу с экосистемой.','Час наблюдений меняет представление о жизни подо льдом. Ни один организм не повреждён.',{oxygen:-8,discovery:5,complete:1})
    ]},
    leviathan_final:{id:'leviathan_final',type:'ЦЕЛЬ ЭКСПЕДИЦИИ',glyph:'◖',title:'Левиафан',text:'Перед лодкой проходит существо длиной в несколько километров. На его спине видны следы старых земных маяков.',quote:'Соколова: «Мы не первые, кто его нашёл. Просто первые, кто об этом расскажет».',choices:[
      choice('Закрепить маяк на панцире','Подойти вплотную и выполнить задачу.','Маяк установлен. Левиафан открывает глаз, но не атакует.',{hull:-7,energy:-9,discovery:8,complete:1}),
      choice('Отпустить маяк следом','Не касаться существа, отслеживать из воды.','Маяк занимает позицию в течении. Запись движения получена без контакта.',{energy:-6,discovery:6,complete:1}),
      choice('Передать мирный сигнал','Сначала попытаться установить контакт.','Левиафан отвечает низким звуком. Все существа вокруг повторяют его одновременно.',{energy:-10,discovery:10,complete:1},'Соколова · гидроакустик')
    ]},
    door_final:{id:'door_final',type:'ЦЕЛЬ ЭКСПЕДИЦИИ',glyph:'◇',title:'Дверь на дне',text:'Идеально гладкая конструкция поднимается из ила. Когда «Нереида» приближается, створки расходятся, открывая сухой освещённый тоннель.',quote:'Марек: «Размер прохода совпадает с корпусом. До сантиметра».',choices:[
      choice('Войти','Принять приглашение неизвестного строителя.','За дверью находится океан под другим небом. В воде отражаются звёзды, которых нет над Европой.',{energy:-10,oxygen:-8,discovery:12,complete:1}),
      choice('Отправить автоматический зонд','Сохранить экипаж и лодку снаружи.','Зонд возвращается покрытым земной пылью и передаёт координаты Луны.',{energy:-8,discovery:9,complete:1}),
      choice('Закрыть дверь','Не открывать путь, который невозможно контролировать.','Створки смыкаются. На корпусе «Нереиды» появляется новый символ — маршрут домой.',{discovery:7,complete:1})
    ]}
  };

  let profile = loadProfile();
  let state = freshState();
  let currentEvent = null;
  let audio = null;

  function freshState(){ return {hull:100,energy:100,oxygen:100,heat:62,depth:2140,speed:'cruise',mission:null,step:0,used:[],discoveries:0,journal:[],active:false,lastEffects:{},eventResolved:false}; }
  function loadProfile(){ try{return Object.assign({completed:[],totalDiscoveries:0,runs:0},JSON.parse(localStorage.getItem(SAVE_KEY)||'{}'))}catch{return {completed:[],totalDiscoveries:0,runs:0}} }
  function saveProfile(){ localStorage.setItem(SAVE_KEY,JSON.stringify(profile)); }
  function initAudio(){ if(audio)return;const AC=window.AudioContext||window.webkitAudioContext;if(AC)audio=new AC(); }
  function tone(freq=220,duration=.15,volume=.025,type='sine'){ if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration); }
  function deepPing(){tone(148,1.7,.025,'sine');setTimeout(()=>tone(224,.7,.012,'sine'),420)}

  function renderMissions(){
    ui.missionList.innerHTML=missions.map(m=>{
      const complete=profile.completed.includes(m.id),locked=m.locked&&profile.completed.length<m.locked;
      return '<button class="mission-option '+(complete?'complete ':'')+(locked?'locked':'')+'" data-mission="'+m.id+'" '+(locked?'disabled':'')+'><span>'+m.glyph+'</span><small>'+(locked?'ОТКРОЕТСЯ ПОСЛЕ '+m.locked+' ЭКСПЕДИЦИЙ':m.danger)+'</small><b>'+m.title+'</b><p>'+m.objective+'</p><em>'+m.region+' · '+m.steps+' СОБЫТИЙ</em></button>';
    }).join('');
    ui.missionList.querySelectorAll('[data-mission]').forEach(btn=>btn.addEventListener('click',()=>startMission(btn.dataset.mission)));
  }
  function openMissions(){renderMissions();ui.missions.classList.add('visible');ui.closeMissions.style.display=state.active?'block':'none'}
  function closeMissions(){ui.missions.classList.remove('visible')}
  function startMission(id){
    const mission=missions.find(m=>m.id===id);if(!mission)return;
    state=freshState();state.mission=mission;state.active=true;
    state.journal.push({type:'МАРШРУТ ПРОЛОЖЕН',title:mission.title,text:mission.objective});
    closeMissions();updateHud();log('Автопилот проложил курс: '+mission.region+'. Ручное управление направлением не требуется.');
    ui.commandTask.textContent='Курс проложен автоматически';ui.continueBtn.disabled=false;ui.continueHint.textContent='До следующего события';deepPing();
  }
  function travel(){
    if(!state.active||!state.mission||ui.event.classList.contains('visible'))return;
    initAudio();tone(82,.5,.018,'triangle');
    const costs={silent:{energy:-4,oxygen:-6,heat:-5},cruise:{energy:-7,oxygen:-5,heat:-2},full:{energy:-11,oxygen:-4,heat:7}}[state.speed];
    applyEffects(costs,false);if(state.speed==='full'&&Math.random()<.3)applyEffects({hull:-3},false);
    state.step++;state.depth+=Math.sign(state.mission.depth-state.depth)*Math.min(Math.abs(state.mission.depth-state.depth),260+Math.random()*240);updateHud();
    if(checkFailure())return;
    showEvent(state.step>=state.mission.steps?finalEvents[state.mission.final]:pickEvent());
  }
  function pickEvent(){let pool=events.filter(e=>!state.used.includes(e.id));if(pool.length<5){state.used=[];pool=events.slice()}const event=pool[Math.floor(Math.random()*pool.length)];state.used.push(event.id);return event}
  function showEvent(event){
    currentEvent=event;state.eventResolved=false;ui.eventType.textContent=event.type;ui.eventTitle.textContent=event.title;ui.eventText.textContent=event.text;ui.eventQuote.textContent=event.quote||'';ui.eventGlyph.textContent=event.glyph;
    ui.eventResult.classList.remove('visible');ui.eventChoices.style.display='grid';
    ui.eventChoices.innerHTML=event.choices.map((c,i)=>'<button data-choice="'+i+'"><b>'+c.title+'</b><span>'+c.desc+'</span>'+(c.special?'<small>'+c.special+'</small>':'')+'</button>').join('');
    ui.eventChoices.querySelectorAll('[data-choice]').forEach(btn=>btn.addEventListener('click',()=>resolveChoice(Number(btn.dataset.choice))));
    ui.event.classList.add('visible');setContact(event);tone(event.type.includes('АВАР')?110:185,.7,.025,event.type.includes('АВАР')?'sawtooth':'sine');
  }
  function resolveChoice(index){
    if(state.eventResolved)return;state.eventResolved=true;const c=currentEvent.choices[index];applyEffects(c.effects,true);ui.eventChoices.style.display='none';ui.eventResult.querySelector('p').textContent=c.result;
    ui.eventResult.querySelector('.effects').innerHTML=formatEffects(c.effects);ui.eventResult.classList.add('visible');
    state.journal.unshift({type:currentEvent.type,title:currentEvent.title,text:c.title+'. '+c.result});if(state.journal.length>30)state.journal.length=30;
    if(c.effects.complete)completeMission(c.result);updateHud();checkFailure();tone(c.effects.hull<0?96:360,.35,.02,c.effects.hull<0?'sawtooth':'triangle');
  }
  function formatEffects(effects){
    const names={hull:'корпус',energy:'энергия',oxygen:'кислород',heat:'тепло',discovery:'открытие'};
    return Object.entries(effects).filter(([k,v])=>names[k]&&v).map(([k,v])=>'<span class="effect '+(v>0?'good':'bad')+'">'+(v>0?'+':'')+v+' · '+names[k]+'</span>').join('')||'<span class="effect">Без потерь</span>';
  }
  function applyEffects(effects,visual=true){
    ['hull','energy','oxygen','heat'].forEach(k=>{if(effects[k])state[k]=clamp(state[k]+effects[k])});
    if(effects.depth)state.depth=Math.max(900,state.depth+effects.depth);
    if(effects.discovery){state.discoveries=Math.max(0,state.discoveries+effects.discovery);profile.totalDiscoveries=Math.max(0,profile.totalDiscoveries+effects.discovery);saveProfile()}
    state.lastEffects=effects;if(visual){ui.sub.classList.remove('warning');void ui.sub.offsetWidth;ui.sub.classList.add('warning')}
  }
  function completeMission(result){
    const id=state.mission.id;if(!profile.completed.includes(id))profile.completed.push(id);profile.runs++;saveProfile();state.completedResult=result;ui.eventContinue.textContent='ЗАВЕРШИТЬ ЭКСПЕДИЦИЮ';
  }
  function closeEvent(){ui.event.classList.remove('visible');ui.eventContinue.textContent='ПРОДОЛЖИТЬ';if(state.completedResult){showEnd(true);return}setContact(null);updateHud()}
  function checkFailure(){
    let reason='';if(state.hull<=0)reason='Корпус «Нереиды» не выдержал давления океана.';else if(state.oxygen<=0)reason='Последний запас кислорода исчерпан вдали от станции.';else if(state.heat<=0)reason='Реактор остановлен. Лёд медленно сковал все отсеки.';else if(state.heat>=100)reason='Первый контур разрушен перегревом.';else if(state.energy<=0)reason='Без энергии лодка легла на дно и перестала отвечать.';
    if(!reason)return false;ui.event.classList.remove('visible');state.active=false;showEnd(false,reason);return true;
  }
  function showEnd(success,reason=''){
    ui.endEyebrow.textContent=success?'ЭКСПЕДИЦИЯ ЗАВЕРШЕНА':'СВЯЗЬ ПОТЕРЯНА';ui.endTitle.textContent=success?'«Нереида» возвращается к свету':'Океан сохранил свою тайну';
    ui.endText.textContent=success?state.completedResult+' Собрано открытий: '+state.discoveries+'. На станции уже готовят следующую экспедицию.':reason;ui.end.classList.add('visible');
  }
  function returnToBase(){ui.end.classList.remove('visible');state=freshState();updateHud();renderMissions();openMissions();log('«Нереида» восстановлена и готова к новому погружению.')}
  function setSpeed(speed){
    state.speed=speed;document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',b.dataset.speed===speed));
    const copy={silent:'Тихий ход: меньше риска, больше расход кислорода.',cruise:'Крейсерский ход: сбалансированный режим.',full:'Полный ход: высокая нагрузка на реактор.'};log(copy[speed]);updateHud();tone(speed==='full'?180:260,.15,.015,'triangle');
  }
  function setContact(event){
    if(!event){ui.contactTitle.textContent='ОКЕАН СПОКОЕН';ui.contactText.textContent='Только треск ледяной коры';ui.hydroTask.textContent='Пассивное наблюдение';return}
    const danger=/КОНТАКТ|ОПАСНОСТЬ|АВАРИЯ/.test(event.type);ui.contactTitle.textContent=danger?'КОНТАКТ ЗАФИКСИРОВАН':'СЛАБЫЙ СИГНАЛ';ui.contactText.textContent=event.title;ui.hydroTask.textContent=danger?'Акустический контакт':'Запись сигнала';
  }
  function updateHud(){
    const set=(text,bar,value)=>{text.textContent=Math.round(value)+'%';bar.style.width=clamp(value)+'%'};
    set(ui.hullText,ui.hullBar,state.hull);set(ui.energyText,ui.energyBar,state.energy);set(ui.oxygenText,ui.oxygenBar,state.oxygen);set(ui.heatText,ui.heatBar,state.heat);
    ui.depth.textContent=Math.round(state.depth).toLocaleString('ru-RU');ui.zone.textContent=state.depth<3000?'ВЕРХНИЙ ОКЕАН':state.depth<5500?'СУМЕРЕЧНЫЙ СЛОЙ':state.depth<8000?'ТЁМНАЯ РАВНИНА':'АБИССАЛЬ';
    if(state.mission){
      const pct=clamp(state.step/state.mission.steps*100);ui.missionTitle.textContent=state.mission.title;ui.missionObjective.textContent=state.mission.objective;ui.routeProgress.style.width=pct+'%';ui.routeText.textContent=state.step>=state.mission.steps?'ЦЕЛЬ ДОСТИГНУТА':Math.round(pct)+'% МАРШРУТА · '+state.mission.region;ui.continueBtn.disabled=!state.active;ui.continueHint.textContent='участок '+Math.min(state.step+1,state.mission.steps)+' из '+state.mission.steps;ui.commandTask.textContent=state.step?'Автопилот · участок '+state.step+'/'+state.mission.steps:'Курс проложен автоматически';
    }else{ui.missionTitle.textContent='Ожидание маршрута';ui.missionObjective.textContent='Выберите миссию в журнале экспедиций.';ui.routeProgress.style.width='0%';ui.routeText.textContent='БАЗА «ГАЛИЛЕЙ»';ui.continueBtn.disabled=true;ui.continueHint.textContent='Сначала выберите миссию'}
    ui.reactorTask.textContent=state.heat>82?'Опасный перегрев':state.energy<25?'Экономичный режим':'Номинальная мощность';ui.labTask.textContent=state.discoveries?'Открытий: '+state.discoveries:'Контейнеры пусты';ui.ambient.textContent='Лёд над корпусом: '+Math.max(2.1,13.5-state.depth/520).toFixed(1).replace('.',',')+' км';
    const bad=Math.min(state.hull,state.energy,state.oxygen),heatBad=state.heat<18||state.heat>88;ui.shipStatus.textContent=bad<25||heatBad?'КРИТИЧЕСКОЕ СОСТОЯНИЕ':bad<55?'ТРЕБУЕТСЯ ВНИМАНИЕ':'СИСТЕМЫ В НОРМЕ';ui.shipStatus.style.color=bad<25||heatBad?'var(--red)':bad<55?'var(--amber)':'var(--green)';
    ui.sub.classList.toggle('damage-leak',state.hull<72);ui.sub.classList.toggle('damage-spark',state.energy<42);ui.sub.classList.toggle('damage-fire',state.heat>82);ui.sub.classList.toggle('blackout',state.energy<22);ui.sub.classList.toggle('flooded',state.hull<38);
  }
  function log(text){ui.log.textContent=text}
  function renderJournal(){
    if(!state.journal.length)ui.journalEntries.innerHTML='<article class="journal-entry"><small>АРХИВ ПУСТ</small><b>История ещё не началась</b><p>Выберите экспедицию. Каждое принятое решение будет сохранено здесь.</p></article>';
    else ui.journalEntries.innerHTML=state.journal.map((e,i)=>'<article class="journal-entry"><small>ЗАПИСЬ '+String(state.journal.length-i).padStart(2,'0')+' · '+e.type+'</small><b>'+e.title+'</b><p>'+e.text+'</p></article>').join('');
  }

  const bg=ui.ocean.getContext('2d'),sonar=ui.sonar.getContext('2d');let particles=[];
  function resize(){const d=Math.min(2,devicePixelRatio||1);ui.ocean.width=innerWidth*d;ui.ocean.height=innerHeight*d;bg.setTransform(d,0,0,d,0,0);particles=Array.from({length:Math.min(100,Math.ceil(innerWidth*innerHeight/12000))},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:.3+Math.random()*1.5,s:.08+Math.random()*.28}))}
  function drawBackground(t){
    bg.clearRect(0,0,innerWidth,innerHeight);const g=bg.createLinearGradient(0,0,0,innerHeight);g.addColorStop(0,'#092939');g.addColorStop(.42,'#04141e');g.addColorStop(1,'#01060a');bg.fillStyle=g;bg.fillRect(0,0,innerWidth,innerHeight);bg.strokeStyle='rgba(114,213,230,.055)';bg.lineWidth=1;
    for(let i=0;i<7;i++){bg.beginPath();bg.moveTo(i*innerWidth/6+(Math.sin(t/4000+i)*35),0);bg.lineTo((i-.5)*innerWidth/6,innerHeight*.32);bg.stroke()}
    particles.forEach(p=>{p.y-=p.s;if(p.y<0){p.y=innerHeight;p.x=Math.random()*innerWidth}bg.fillStyle='rgba(133,221,228,'+(.12+p.r*.05)+')';bg.beginPath();bg.arc(p.x,p.y,p.r,0,7);bg.fill()});
  }
  function drawSonar(t){
    const w=ui.sonar.width,h=ui.sonar.height,cx=w/2,cy=h*.47;sonar.clearRect(0,0,w,h);sonar.strokeStyle='rgba(102,232,243,.15)';sonar.lineWidth=1;
    [28,55,82,109].forEach(r=>{sonar.beginPath();sonar.arc(cx,cy,r,Math.PI,Math.PI*2);sonar.stroke()});for(let a=0;a<=Math.PI;a+=Math.PI/8){sonar.beginPath();sonar.moveTo(cx,cy);sonar.lineTo(cx+Math.cos(a)*115,cy-Math.sin(a)*115);sonar.stroke()}
    const sweep=(t/2600)%1*Math.PI,grad=sonar.createLinearGradient(cx,cy,cx+Math.cos(sweep)*120,cy-Math.sin(sweep)*120);grad.addColorStop(0,'rgba(102,232,243,0)');grad.addColorStop(1,'rgba(102,232,243,.65)');sonar.strokeStyle=grad;sonar.lineWidth=2;sonar.beginPath();sonar.moveTo(cx,cy);sonar.lineTo(cx+Math.cos(sweep)*120,cy-Math.sin(sweep)*120);sonar.stroke();
    if(currentEvent&&ui.event.classList.contains('visible')){const pulse=.5+Math.sin(t/250)*.3;sonar.fillStyle='rgba(255,200,103,'+pulse+')';sonar.shadowColor='#ffc867';sonar.shadowBlur=12;sonar.beginPath();sonar.arc(cx+55,cy-45,3,0,7);sonar.fill();sonar.shadowBlur=0}
  }
  function frame(t){drawBackground(t);drawSonar(t);requestAnimationFrame(frame)}

  ui.start.addEventListener('click',()=>{initAudio();ui.intro.classList.remove('visible');openMissions();deepPing()});
  ui.missionsBtn.addEventListener('click',openMissions);ui.closeMissions.addEventListener('click',closeMissions);
  ui.journalBtn.addEventListener('click',()=>{renderJournal();ui.journal.classList.add('visible')});ui.closeJournal.addEventListener('click',()=>ui.journal.classList.remove('visible'));
  ui.continueBtn.addEventListener('click',travel);ui.eventContinue.addEventListener('click',closeEvent);ui.endBtn.addEventListener('click',returnToBase);
  document.querySelectorAll('[data-speed]').forEach(btn=>btn.addEventListener('click',()=>setSpeed(btn.dataset.speed)));
  window.addEventListener('resize',resize);window.addEventListener('pointerdown',initAudio,{once:true});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  resize();renderMissions();updateHud();requestAnimationFrame(frame);
})();
