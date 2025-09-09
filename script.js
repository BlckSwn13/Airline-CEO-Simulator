/*
 * Zentrales Skript für den Crown Aviation CEO Simulator.
 * Dieses Modul steuert die Navigation, das Setup‑Formular, das dynamische
 * Farbthema sowie den Austausch mit dem OpenAI‑API. Vor der Nutzung muss
 * OPENAI_API_KEY durch den tatsächlichen API‑Key ersetzt werden. Für das
 * Deployment auf Netlify kann der Key als Umgebungsvariable eingebunden
 * werden (z. B. über Netlify Environment Variables und serverless‑functions).
 */

const OPENAI_API_KEY = '';

// State
let ceoConfig = null;
let currentTimeMode = 'normal';

// Globale Spielvariablen
// Enthält den aktuellen Spielzeitstempel, der abhängig vom Zeitmodus fortgeschrieben wird
let gameTime;
// Chatverlauf für den GPT‑Assistenten
let chatMessages = [];
// Datenhaltung für die Flottenübersicht
let fleetData = [];
// Personal und Programme
let hrEmployees = [];
let hrPrograms = [];

// Mailbox: getrennte Ablagen für Eingangs- und Ausgangsnachrichten
// Gesendete Mails erscheinen im Ordner "Gesendet", empfangene im Posteingang.
let inboxMails = [];
let sentMails = [];
// Aktueller Ordner im Postfach ('inbox' oder 'sent')
let currentMailboxView = 'inbox';

// Meeting‑Protokolle: speichert abgeschlossene Meetings aus dem Kalender.
// Jeder Eintrag enthält Titel, Datum und einen Gesprächsverlauf (transcript)
let meetingHistory = [];

// Persistente Chat‑Logs pro Flugnummer. Die Kommunikation zwischen CEO
// und Crew wird hier bis zum Ende eines Fluges gespeichert. Nach Abschluss
// eines Fluges sollte der entsprechende Eintrag aus flightChats gelöscht werden.
const flightChats = {};
// Kalenderereignisse pro Kategorie
let ceoEvents = [];
let airlineEvents = [];
let personalEvents = [];

// DOM‑Elemente – erst nach DOMContentLoaded definiert
let navItems;
let tabContents;
let dateEl;
let timeEl;
let timeButtons;

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
  // Elementreferenzen erst hier abholen
  navItems = document.querySelectorAll('.navigation li');
  tabContents = document.querySelectorAll('.tab-content');
  dateEl = document.getElementById('current-date');
  timeEl = document.getElementById('current-time');
  timeButtons = {
    pause: document.getElementById('btn-pause'),
    normal: document.getElementById('btn-normal'),
    fast: document.getElementById('btn-fast'),
    top: document.getElementById('btn-top'),
  };
  initLanding();
  initNavigation();
  initTimeControls();
  startClock();

  // Zusätzliche Initialisierungen für neue Features
  initChat();
  initModal();
  initFleetFilter();
  initCalendarEvents();
  initHRTab();
  initMailbox();
});

function initNavigation() {
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-tab');
      activateTab(target);
    });
  });
}

/**
 * Initialisiert die Landing‑Seite mit Login‑/Registrierungslogik.
 */
function initLanding() {
  const landing = document.getElementById('landing-container');
  const appContainer = document.getElementById('app-container');
  const showLoginBtn = document.getElementById('btn-show-login');
  const showSigninBtn = document.getElementById('btn-show-signin');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  showLoginBtn.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  });
  showSigninBtn.addEventListener('click', () => {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    initColorPickers();
    initFleetCustom();
  });
  loginForm.addEventListener('submit', handleLoginSubmit);
  signupForm.addEventListener('submit', handleSignupSubmit);
}

/**
 * Behandelt das Login. Prüft, ob eine Konfiguration für die Airline existiert und
 * ob das Passwort korrekt ist. Bei Erfolg wird die App geladen.
 */
function handleLoginSubmit(event) {
  event.preventDefault();
  const airlineName = document.getElementById('login-airline-name').value.trim();
  const password = document.getElementById('login-password').value;
  const stored = localStorage.getItem('ceoConfig-' + airlineName.toLowerCase());
  if (!stored) {
    alert('Diese Airline ist nicht registriert. Bitte prüfe den Namen oder registriere dich.');
    return;
  }
  const config = JSON.parse(stored);
  if (config.password !== password) {
    alert('Das Passwort ist falsch.');
    return;
  }
  ceoConfig = config;
  // Anwenden und anzeigen
  applyConfigToUI();
  showApp();
}

/**
 * Behandelt die Registrierung. Speichert die Konfiguration unter einem
 * airline‑spezifischen Schlüssel. Anschließend wird die App geladen.
 */
async function handleSignupSubmit(event) {
  event.preventDefault();
  const airlineName = document.getElementById('airline-name').value.trim();
  const ceoPublicName = document.getElementById('ceo-public-name').value.trim();
  const ceoInternalName = document.getElementById('ceo-internal-name').value.trim();
  const colorPrimary = document.getElementById('color-primary').value;
  const colorAccent = document.getElementById('color-accent').value;
  const colorNeutral = document.getElementById('color-neutral').value;
  const homeAirport = document.getElementById('home-airport').value.trim();
  const startMode = document.getElementById('start-mode').value;
  const fleetOption = document.getElementById('fleet-option').value;
  const financeMode = document.getElementById('finance-mode').value;
  const password = document.getElementById('password').value;
  const logoFile = document.getElementById('logo-upload').files[0];
  // Flotte definieren, falls manuell
  let customFleet = [];
  if (fleetOption === 'custom') {
    const rows = document.querySelectorAll('.fleet-row');
    rows.forEach((row) => {
      const model = row.querySelector('input[type="text"]').value.trim();
      const qty = parseInt(row.querySelector('input[type="number"]').value) || 0;
      if (model) customFleet.push({ model, quantity: qty });
    });
  }
  ceoConfig = {
    airlineName,
    ceoPublicName,
    ceoInternalName,
    colors: {
      primary: colorPrimary,
      accent: colorAccent,
      neutral: colorNeutral,
    },
    homeAirport,
    startMode,
    fleetOption,
    financeMode,
    password,
    logoDataUrl: null,
    customFleet,
  };
  applyColors(ceoConfig.colors);
  document.getElementById('company-name').textContent = airlineName || 'Crown Aviation';
  if (logoFile) {
    const dataUrl = await readFileAsDataURL(logoFile);
    ceoConfig.logoDataUrl = dataUrl;
    document.getElementById('logo-image').src = dataUrl;
  } else {
    document.getElementById('logo-image').src = 'https://placehold.co/80x80/png?text=Logo';
  }
  // Speichern unter airline‑spezifischem Schlüssel
  localStorage.setItem('ceoConfig-' + airlineName.toLowerCase(), JSON.stringify(ceoConfig));
  applyConfigToUI();
  showApp();
  if (OPENAI_API_KEY) {
    sendInitialGreeting();
  }
}

function showApp() {
  // Landing verstecken, App zeigen
  document.getElementById('landing-container').classList.add('hidden');
  const appContainer = document.getElementById('app-container');
  appContainer.classList.remove('hidden');
  // Dashboard als Starttab aktivieren
  activateTab('dashboard');
}

/**
 * Initialisiert die Farbauswahl und zeigt dem Nutzer die gewählten Werte an.
 */
function initColorPickers() {
  const colorInputs = [
    { input: document.getElementById('color-primary'), value: document.getElementById('color-primary-value') },
    { input: document.getElementById('color-accent'), value: document.getElementById('color-accent-value') },
    { input: document.getElementById('color-neutral'), value: document.getElementById('color-neutral-value') },
  ];
  colorInputs.forEach(({ input, value }) => {
    // Zeige initiale Werte
    value.textContent = input.value;
    value.style.backgroundColor = input.value;
    value.style.padding = '0.1rem 0.3rem';
    value.style.borderRadius = '4px';
    value.style.color = '#000';
    input.addEventListener('input', () => {
      value.textContent = input.value;
      value.style.backgroundColor = input.value;
      // Setze die Farbvariablen direkt, um ein sofortiges Feedback zu geben
      applyColors({
        primary: document.getElementById('color-primary').value,
        accent: document.getElementById('color-accent').value,
        neutral: document.getElementById('color-neutral').value,
      });
    });
  });
}

/**
 * Initialisiert die dynamische Eingabe für manuelle Flottendefinition.
 */
function initFleetCustom() {
  const fleetSelect = document.getElementById('fleet-option');
  const container = document.getElementById('fleet-custom-container');
  const list = document.getElementById('fleet-custom-list');
  const addBtn = document.getElementById('add-fleet-row');
  function createRow(model = '', quantity = 0) {
    const row = document.createElement('div');
    row.className = 'fleet-row';
    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.placeholder = 'Modell (z. B. A320neo)';
    modelInput.value = model;
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.placeholder = 'Menge';
    qtyInput.value = quantity;
    row.appendChild(modelInput);
    row.appendChild(qtyInput);
    return row;
  }
  function showCustomFleet(show) {
    if (show) {
      container.style.display = 'block';
      if (list.childElementCount === 0) {
        list.appendChild(createRow());
        list.appendChild(createRow());
      }
    } else {
      container.style.display = 'none';
      list.innerHTML = '';
    }
  }
  fleetSelect.addEventListener('change', () => {
    showCustomFleet(fleetSelect.value === 'custom');
  });
  addBtn.addEventListener('click', () => {
    list.appendChild(createRow());
  });
  // initialer Zustand
  showCustomFleet(fleetSelect.value === 'custom');
}

function activateTab(tab) {
  // Sidebar aktive Klasse aktualisieren
  navItems.forEach((item) => {
    if (item.getAttribute('data-tab') === tab) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  // Sichtbarkeit der Tab‑Content anpassen
  tabContents.forEach((content) => {
    if (content.id === 'tab-' + tab) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

function initTimeControls() {
  Object.entries(timeButtons).forEach(([mode, btn]) => {
    btn.addEventListener('click', () => {
      setTimeMode(mode);
    });
  });
  setTimeMode('normal');
}

function setTimeMode(mode) {
  currentTimeMode = mode;
  Object.entries(timeButtons).forEach(([m, btn]) => {
    if (m === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  // Hier könnten wir eine Simulation implementieren, die den Zeitablauf skaliert.
}

function startClock() {
  // Initialisiere die Spielzeit mit dem aktuellen Datum, wenn noch nicht gesetzt
  gameTime = new Date();
  updateClock();
  setInterval(() => {
    updateGameClock();
    updateClock();
  }, 1000);
}

/**
 * Fortschreibung der Spielzeit in Abhängigkeit des gewählten Zeitmodus.
 * Im Pausenmodus wird keine Zeit addiert, im Normalmodus läuft die Uhr
 * eine Stunde pro reeller Minute, im Fast‑Modus zwei Stunden pro Minute
 * und im Top‑Speed zwölf Stunden pro Minute. Diese Werte sind
 * approximiert, um ein Gefühl für unterschiedliche Tempi zu vermitteln.
 */
function updateGameClock() {
  if (!gameTime) {
    gameTime = new Date();
  }
  // Berechne das Zeitinkrement abhängig vom Spielmodus. Im Echtzeitmodus
  // vergeht eine Spielsekunde pro realer Sekunde. Im Simulationsmodus
  // skalieren die einzelnen Modi die Spielzeit gemäss Spezifikation:
  //   normal: 1h Spiel = 60m real  → 1s real = 1s Spiel
  //   fast (Beschleunigt): 1h Spiel = 30m real  → 1s real = 2s Spiel
  //   top: 1h Spiel = 5m real      → 1s real = 12s Spiel
  let increment;
  // Echtzeitmodus überschreibt jegliche Zeitskalierung
  if (ceoConfig && ceoConfig.startMode === 'realtime') {
    increment = 1000;
  } else {
    switch (currentTimeMode) {
      case 'pause':
        increment = 0;
        break;
      case 'normal':
        increment = 1000;
        break;
      case 'fast':
        increment = 2 * 1000;
        break;
      case 'top':
        increment = 12 * 1000;
        break;
      default:
        increment = 1000;
    }
  }
  gameTime = new Date(gameTime.getTime() + increment);
}

function updateClock() {
  const now = gameTime || new Date();
  const optionsDate = { year: 'numeric', month: 'long', day: 'numeric' };
  const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const locale = 'de-CH';
  dateEl.textContent = now.toLocaleDateString(locale, optionsDate);
  timeEl.textContent = now.toLocaleTimeString(locale, optionsTime);
}

function loadConfigFromStorage() {
  // Diese Funktion ist jetzt ausgelagert in den Login‑/Registrierungs‑Prozess
  return null;
}


function applyConfigToUI() {
  if (!ceoConfig) return;
  // Anwenden der Farben und Logo
  applyColors(ceoConfig.colors);
  document.getElementById('company-name').textContent = ceoConfig.airlineName;
  if (ceoConfig.logoDataUrl) {
    document.getElementById('logo-image').src = ceoConfig.logoDataUrl;
  }
  // Dashboard initialisieren
  populateDashboard();
  // Weitere Tabs mit Beispielinhalten füllen
  populateOCC();
  populateCalendar();
  populateFleet();
  populateHR();
  populateFinances();
  populateNews();
  populateHistory();
}

function applyColors(colors) {
  if (!colors) return;
  document.documentElement.style.setProperty('--color-primary', colors.primary);
  document.documentElement.style.setProperty('--color-accent', colors.accent);
  document.documentElement.style.setProperty('--color-neutral', colors.neutral);
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function populateDashboard() {
  // KPI‑Karten – hier sind Platzhalter enthalten. In einer späteren Version
  // können diese durch dynamische Werte ersetzt werden, z. B. aus GPT‑Reports.
  const kpiContainer = document.getElementById('kpi-cards');
  kpiContainer.innerHTML = '';
  const kpis = [
    { title: 'Umsatz', value: '0 CHF' },
    { title: 'Verfügbare Mittel', value: '–' },
    { title: 'Auslastung', value: '–' },
    { title: 'Pünktlichkeitsrate', value: '–' },
    { title: 'Mitarbeiterzufriedenheit', value: '–' },
    { title: 'Sicherheitsstatus', value: '–' },
  ];
  kpis.forEach((kpi) => {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = kpi.title;
    const value = document.createElement('p');
    value.textContent = kpi.value;
    card.appendChild(title);
    card.appendChild(value);
    kpiContainer.appendChild(card);
  });
  // Führungsstil & CEO‑Stimmung
  document.getElementById('leadership-style').innerHTML = `<h3>Führungsstil</h3><p>–</p>`;
  document.getElementById('ceo-mood').innerHTML = `<h3>CEO‑Stimmung</h3><p>–</p>`;
  document.getElementById('reputation').innerHTML = `<h3>Reputation</h3><p>–</p>`;
  document.getElementById('event-alerts').innerHTML = `<h3>Event‑Alerts</h3><p>–</p>`;
}

/**
 * Befüllt die Operation‑Control‑Center (OCC) Tabelle mit Beispiel‑Flügen
 * und richtet einen Klickhandler ein, der Detailinformationen anzeigt.
 */
function populateOCC() {
  const tbody = document.querySelector('#flight-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  // Beispielhafte Flugdaten. In einer späteren Version können diese
  // von einer Datenbank oder GPT generiert werden.
  const sampleFlights = [
    {
      flightNo: 'CR123',
      route: 'ZRH → VIE',
      depart: '08:00',
      arrive: '09:15',
      status: 'Boarding',
      type: 'A320neo',
      dispatch: 'Anna M.',
      details: {
        passengers: 150,
        cargo: '2t',
        lastRadio: 'Pushback at stand A12 approved.',
        recentComms: [
          'ATC: Cleared to taxi to runway 28 via taxiway B.',
          'Crew: Requesting weather update for Vienna.',
          'ATC: Visibility 8km, winds calm.',
        ],
      },
    },
    {
      flightNo: 'CR456',
      route: 'VIE → LHR',
      depart: '10:30',
      arrive: '12:05',
      status: 'Gate Open',
      type: 'B737-800',
      dispatch: 'Lukas S.',
      details: {
        passengers: 170,
        cargo: '1.5t',
        lastRadio: 'Passengers boarding completed.',
        recentComms: [
          'Crew: Door closing in progress.',
          'ATC: Expect slight delay due to congestion.',
          'Crew: Copy that, ready when cleared.',
        ],
      },
    },
    {
      flightNo: 'CR789',
      route: 'LHR → ZRH',
      depart: '14:00',
      arrive: '15:30',
      status: 'Scheduled',
      type: 'E190',
      dispatch: 'Mia F.',
      details: {
        passengers: 112,
        cargo: '0.8t',
        lastRadio: 'Standby for clearance.',
        recentComms: [
          'ATC: Flight plan received and confirmed.',
          'Crew: Will pushback at 13:50.',
          'ATC: Acknowledge, stand by.',
        ],
      },
    },
  ];
  if (sampleFlights.length === 0) {
    const noRow = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.textAlign = 'center';
    td.textContent = 'Keine Flüge verfügbar.';
    noRow.appendChild(td);
    tbody.appendChild(noRow);
    return;
  }
  sampleFlights.forEach((flight, index) => {
    const tr = document.createElement('tr');
    // Mark the row with a data attribute so that a delegated click handler can
    // resolve the flight later. This avoids attaching individual listeners
    // which sometimes fail when the DOM is regenerated.
    tr.dataset.flightIndex = index.toString();
    [
      flight.flightNo,
      flight.route,
      flight.depart,
      flight.arrive,
      flight.status,
      flight.type,
      flight.dispatch,
    ].forEach((val) => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  // Attach a single click handler to the tbody if not already attached. Using a
  // delegated event handler ensures that dynamically created rows respond
  // correctly and circumvents issues where the click listener on each row
  // silently fails. The handler reads the data attribute to look up the
  // corresponding flight and then calls showFlightDetails().
  if (!tbody.dataset.listenerAttached) {
    tbody.addEventListener('click', (ev) => {
      const row = ev.target.closest('tr');
      if (!row) return;
      const idx = row.dataset.flightIndex;
      if (idx === undefined) return;
      const flight = sampleFlights[parseInt(idx, 10)];
      if (flight) showFlightDetails(flight);
    });
    tbody.dataset.listenerAttached = 'true';
  }
}

/**
 * Zeigt Detailinformationen zu einem Flug im OCC‑Bereich an.
 * @param {Object} flight Die Fluginformation.
 */
function showFlightDetails(flight) {
  // Statt in einem festen Container werden die Flugdetails nun in einem
  // Popup-Fenster angezeigt. Wir erstellen das Inhaltselement dynamisch
  // und übergeben es an showModal().
  const container = document.createElement('div');
  const info = document.createElement('p');
  info.innerHTML =
    `<strong>Route:</strong> ${flight.route}<br/>` +
    `<strong>Abflug:</strong> ${flight.depart}<br/>` +
    `<strong>Ankunft:</strong> ${flight.arrive}<br/>` +
    `<strong>Typ:</strong> ${flight.type}<br/>` +
    `<strong>Status:</strong> ${flight.status}`;
  container.appendChild(info);
  const p2 = document.createElement('p');
  p2.innerHTML =
    `<strong>Passagiere:</strong> ${flight.details.passengers}<br/>` +
    `<strong>Fracht:</strong> ${flight.details.cargo}<br/>` +
    `<strong>Letzter Funk:</strong> ${flight.details.lastRadio}`;
  container.appendChild(p2);
  // Liste der letzten Funkmeldungen
  const listTitle = document.createElement('h4');
  listTitle.textContent = 'Letzte Funkmeldungen';
  container.appendChild(listTitle);
  const ul = document.createElement('ul');
  flight.details.recentComms.forEach((msg) => {
    const li = document.createElement('li');
    li.textContent = msg;
    ul.appendChild(li);
  });
  container.appendChild(ul);
  // Crew‑Chat: Chatverlauf und Eingabefeld für die Kommunikation mit der Crew
  const chatHeader = document.createElement('h4');
  chatHeader.textContent = 'Crew‑Chat';
  container.appendChild(chatHeader);
  // Wrapper für Chatverlauf. Wir verwenden die vorhandene Chat‑Terminal‑Klasse,
  // damit Nachrichten optisch ansprechend dargestellt werden.
  const chatWrap = document.createElement('div');
  chatWrap.className = 'chat-terminal';
  // Chatlog anzeigen. Existiert für den Flug noch kein Log, wird ein leeres Array erstellt
  const chatLog = document.createElement('div');
  chatLog.className = 'chat-log';
  const flightId = flight.flightNo;
  if (!flightChats[flightId]) {
    flightChats[flightId] = [];
  }
  // Bestehende Nachrichten darstellen
  flightChats[flightId].forEach((msg) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.textContent = msg.message;
    chatLog.appendChild(msgDiv);
  });
  chatWrap.appendChild(chatLog);
  // Eingabefeld
  const chatTextarea = document.createElement('textarea');
  chatTextarea.placeholder = 'Nachricht schreiben ...';
  chatTextarea.rows = 3;
  chatTextarea.style.width = '100%';
  chatWrap.appendChild(chatTextarea);
  // Senden‑Button
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Senden';
  sendBtn.style.marginTop = '0.5rem';
  sendBtn.addEventListener('click', () => {
    const text = chatTextarea.value.trim();
    if (!text) return;
    // Nachricht im Log speichern
    flightChats[flightId].push({ timestamp: new Date(), message: text });
    // Nachricht im UI anzeigen
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message user';
    msgDiv.textContent = text;
    chatLog.appendChild(msgDiv);
    // Eingabefeld leeren
    chatTextarea.value = '';
    // Scroll ans Ende
    chatLog.scrollTop = chatLog.scrollHeight;
  });
  chatWrap.appendChild(sendBtn);
  container.appendChild(chatWrap);
  // Anzeige der Details im Modal
  showModal(`Flug ${flight.flightNo} Details`, container);
}

/**
 * Erstellt Beispiel‑Termine im Kalender (CEO‑, Airline‑ und persönliche Events).
 */
function populateCalendar() {
  const ceoList = document.getElementById('ceo-events');
  const airlineList = document.getElementById('airline-events');
  const personalList = document.getElementById('personal-events');
  if (!ceoList || !airlineList || !personalList) return;
  // Falls keine benutzerdefinierten Termine vorhanden sind, generiere Demo‑Termine
  if (ceoEvents.length === 0 && airlineEvents.length === 0 && personalEvents.length === 0) {
    const now = new Date();
    ceoEvents = [
      { title: 'Meeting mit CFO', time: new Date(now.getTime() + 86400000) },
      { title: 'Pressekonferenz', time: new Date(now.getTime() + 3 * 86400000) },
    ];
    airlineEvents = [
      { title: 'Neue Flotte Ankündigung', time: new Date(now.getTime() + 2 * 86400000) },
      { title: 'Wartung B737', time: new Date(now.getTime() + 5 * 86400000) },
    ];
    personalEvents = [
      { title: 'Privater Arzttermin', time: new Date(now.getTime() + 4 * 86400000) },
      { title: 'Dinner mit Partner', time: new Date(now.getTime() + 7 * 86400000) },
    ];
  }
  // Hilfsfunktion zum Befüllen einer Liste und Hinzufügen von Klickhandlern
  function fillListWithEvents(listEl, events, category) {
    listEl.innerHTML = '';
    events.forEach((ev, index) => {
      const li = document.createElement('li');
      li.textContent = `${ev.title} – ${formatDateTime(ev.time)}`;
      li.addEventListener('click', () => {
        showCalendarEventDetails(category, index);
      });
      listEl.appendChild(li);
    });
    if (events.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Keine Termine.';
      listEl.appendChild(li);
    }
  }
  fillListWithEvents(ceoList, ceoEvents, 'ceo');
  fillListWithEvents(airlineList, airlineEvents, 'airline');
  fillListWithEvents(personalList, personalEvents, 'personal');
}

/**
 * Zeigt die Flotte der Airline an. Bei manuell definierter Flotte werden die
 * hinterlegten Modelle angezeigt, andernfalls eine Beispiel‑Flotte.
 */
function populateFleet() {
  // Erstelle oder aktualisiere fleetData abhängig von der Konfiguration
  fleetData = [];
  if (ceoConfig && ceoConfig.fleetOption === 'custom' && ceoConfig.customFleet.length > 0) {
    ceoConfig.customFleet.forEach((item, index) => {
      for (let i = 0; i < item.quantity; i++) {
        fleetData.push({
          type: item.model,
          registration: `TST-${index}${i}`,
          status: 'In Betrieb',
          age: 'Neu',
          service: 'N/A',
          routes: '—',
          seats: '—',
        });
      }
    });
  } else {
    // Standardflotte basierend auf der ausgewählten Startoption
    const smallFleet = [
      { type: 'A320neo', quantity: 2 },
      { type: 'E195-E2', quantity: 2 },
    ];
    const fullFleet = [
      { type: 'A320neo', quantity: 5 },
      { type: 'B737-800', quantity: 4 },
      { type: 'A220-300', quantity: 3 },
    ];
    let template;
    if (ceoConfig && ceoConfig.fleetOption === 'small') {
      template = smallFleet;
    } else if (ceoConfig && ceoConfig.fleetOption === 'full') {
      template = fullFleet;
    } else {
      template = [];
    }
    template.forEach((item, idx) => {
      for (let i = 0; i < item.quantity; i++) {
        fleetData.push({
          type: item.type,
          registration: `${item.type.replace(/[^A-Z0-9]/g, '')}-${idx}${i}`,
          status: 'In Betrieb',
          age: `${Math.floor(Math.random() * 10)} Jahre`,
          service: 'Alle 1000h',
          routes: 'Diverse',
          seats: '—',
        });
      }
    });
  }
  // Tabelle basierend auf aktuellen Filtern rendern
  applyFleetFilter();
}

// Alte populateHR‑Implementierung wurde durch eine neue ersetzt. Die
// ursprüngliche Version bleibt auskommentiert als Referenz.
/*
function populateHR() {
  const tbody = document.querySelector('#hr-table tbody');
  const programList = document.getElementById('hr-programs');
  if (!tbody || !programList) return;
  // Diese Version wird nicht mehr verwendet.
}
*/

/**
 * Zeigt eine Beispielbilanz und Segmentdaten im Finanzen‑Tab an.
 */
function populateFinances() {
  const balanceEl = document.getElementById('finance-balance');
  const incomeList = document.getElementById('finance-income');
  const expenseList = document.getElementById('finance-expenses');
  const investList = document.getElementById('finance-invest');
  if (!balanceEl || !incomeList || !expenseList || !investList) return;
  // Beispielwerte. Spätere Versionen können diese aus realen Daten generieren.
  // Im Kreativmodus wird eine unendliche Bilanz angezeigt (∞), ansonsten eine Beispielzahl.
  if (ceoConfig && ceoConfig.financeMode === 'creative') {
    balanceEl.textContent = '∞';
  } else {
    balanceEl.textContent = '5 000 000 CHF';
  }
  const incomes = [
    'Passagiere: 3 200 000 CHF',
    'Cargo: 800 000 CHF',
    'Nebenleistungen (Bordverkauf, Lounges): 150 000 CHF',
  ];
  const expenses = [
    'Personal: 1 200 000 CHF',
    'Treibstoff: 900 000 CHF',
    'Wartung & Technik: 500 000 CHF',
    'Gebühren & Lizenzen: 200 000 CHF',
  ];
  const investments = [
    'Anzahlung neue A320neo (4x) – 1 000 000 CHF',
    'Simulationszentrum Bau – 300 000 CHF',
  ];
  function fillList(el, arr) {
    el.innerHTML = '';
    arr.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      el.appendChild(li);
    });
    if (arr.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Keine Daten.';
      el.appendChild(li);
    }
  }
  fillList(incomeList, incomes);
  fillList(expenseList, expenses);
  fillList(investList, investments);
}

/**
 * Füllt den News‑ und Wetter‑Tab mit Beispielartikeln und Warnungen.
 */
function populateNews() {
  const newsList = document.getElementById('news-feed');
  const weatherList = document.getElementById('weather-feed');
  if (!newsList || !weatherList) return;
  const newsItems = [
    'Crown Aviation eröffnet neue Route nach New York – tägliche Flüge ab Winterflugplan.',
    'Luftfahrtbranche erwartet höhere Nachfrage im Sommer – Kapazitäten werden angepasst.',
    'Bundesregierung beschließt strengere CO₂‑Regeln – Auswirkungen auf Ticketpreise.',
  ];
  const weatherItems = [
    'Gewitterwarnung für Zürich: Verzögerungen im Flugverkehr möglich.',
    'Starker Schneefall in Wien: Vereiste Rollbahnen sorgen für Engpässe.',
  ];
  function fill(el, items) {
    el.innerHTML = '';
    items.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      el.appendChild(li);
    });
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Keine News.';
      el.appendChild(li);
    }
  }
  fill(newsList, newsItems);
  fill(weatherList, weatherItems);
}

/**
 * Erstellt eine Beispielchronik im Tab "Geschichte".
 */
function populateHistory() {
  const timeline = document.getElementById('history-timeline');
  if (!timeline) return;
  timeline.innerHTML = '';
  const events = [
    { date: '01.01.2025', text: 'Gründung der Airline durch den CEO.' },
    { date: '15.01.2025', text: 'Erster Flug ZRH – VIE erfolgreich absolviert.' },
    { date: '10.02.2025', text: 'Eröffnung des ersten internationalen Hubs in Wien.' },
    { date: '01.03.2025', text: 'Über 10 000 Passagiere befördert – Meilenstein erreicht.' },
  ];
  // Statistische Ereignisse ausgeben
  events.forEach((ev) => {
    const li = document.createElement('li');
    li.textContent = `${ev.date}: ${ev.text}`;
    timeline.appendChild(li);
  });
  // Meeting‑Protokolle anfügen, sofern vorhanden
  if (meetingHistory && meetingHistory.length > 0) {
    // Abschnittsüberschrift
    const section = document.createElement('li');
    section.className = 'history-section';
    section.textContent = 'Meetings';
    timeline.appendChild(section);
    meetingHistory.forEach((meet) => {
      const li = document.createElement('li');
      li.className = 'meeting-entry';
      li.textContent = `${meet.date}: ${meet.title}`;
      li.addEventListener('click', () => {
        showMeetingTranscript(meet);
      });
      timeline.appendChild(li);
    });
  }
  // Falls keinerlei historische Daten vorhanden sind
  if (events.length === 0 && (!meetingHistory || meetingHistory.length === 0)) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Keine historischen Ereignisse.';
    timeline.appendChild(li);
  }
}

/**
 * Zeigt den Gesprächsverlauf eines abgeschlossenen Meetings im Verlauf.
 * Öffnet ein Modal mit Titel, Datum und allen Nachrichten als Protokoll.
 * @param {Object} meet Ein Eintrag aus meetingHistory
 */
function showMeetingTranscript(meet) {
  const container = document.createElement('div');
  // Titel und Datum
  const h2 = document.createElement('h2');
  h2.textContent = meet.title;
  container.appendChild(h2);
  const dateP = document.createElement('p');
  dateP.innerHTML = `<strong>Datum:</strong> ${meet.date}`;
  container.appendChild(dateP);
  // Nachrichtenliste
  meet.transcript.forEach((msg) => {
    const p = document.createElement('p');
    let speaker;
    // CEO‑Name ermitteln für Nutzer
    const ceoName = ceoConfig ? ceoConfig.ceoPublicName || 'CEO' : 'CEO';
    if (msg.role === 'user') {
      speaker = ceoName;
    } else {
      speaker = 'Teilnehmer';
    }
    p.innerHTML = `<strong>${speaker}:</strong> ${msg.text}`;
    container.appendChild(p);
  });
  showModal('Meeting‑Protokoll', container);
}

async function sendInitialGreeting() {
  const systemPrompt = buildSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Start der Simulation. Bitte begrüßen Sie mich als Head of OCC und nennen Sie mir die nächsten Schritte.' },
  ];
  try {
    const response = await callOpenAI(messages);
    if (response) {
      displayMail({
        from: 'Head of OCC',
        subject: 'Willkommen bei Crown Aviation',
        content: response,
      });
    }
  } catch (err) {
    console.error(err);
  }
}

function buildSystemPrompt() {
  // Baue einen ausführlichen Systemprompt basierend auf den Angaben des CEO und
  // den Leitlinien aus der GPT‑Integrationsanleitung. Dieser Prompt versorgt
  // das Sprachmodell mit sämtlichen relevanten Meta‑Informationen und Regeln,
  // damit es in der Rolle des Management‑Assistenten agieren kann. Sollte
  // keine Konfiguration vorliegen, wird ein leerer String zurückgegeben.
  if (!ceoConfig) return '';
  const {
    airlineName,
    ceoPublicName,
    ceoInternalName,
    homeAirport,
    colors,
    startMode,
    financeMode,
    fleetOption,
    customFleet,
  } = ceoConfig;

  // Hilfsfunktion zur Beschreibung der Flottenauswahl
  function describeFleet() {
    if (fleetOption === 'custom' && Array.isArray(customFleet) && customFleet.length > 0) {
      const parts = customFleet.map((f) => `${f.quantity}× ${f.model}`);
      return `Eigene Flotte: ${parts.join(', ')}`;
    }
    if (fleetOption === 'small') return 'Flottenwahl: kleine Standardflotte';
    if (fleetOption === 'medium') return 'Flottenwahl: mittlere Standardflotte';
    if (fleetOption === 'large') return 'Flottenwahl: große Standardflotte';
    return 'Flottenwahl: unbekannt';
  }

  // Hauptprompt zusammensetzen. Es werden alle vom CEO bereitgestellten
  // Unternehmensdaten erwähnt. Anschließend folgen Verhaltensregeln aus
  // der Anleitung: Rollenlogik, Antwortlogik, Analyse und Datenprüfung. Die
  // Struktur orientiert sich an der gelieferten Dokumentation.
  let prompt = '';
  prompt += `Du bist ein KI‑gestützter Management‑Assistent im Spiel "Airline – CEO Simulator". Dieses Spiel simuliert die Leitung der fiktiven Airline "${airlineName}" durch den Nutzer (den CEO).\n`;
  prompt += `Du bist in eine Web‑Anwendung eingebettet und siehst keine grafische Oberfläche. Alle Informationen erhältst du ausschließlich über Texteingaben aus dem Spielsystem.\n\n`;
  // Pflichtdaten des CEOs
  prompt += `Pflichtdaten des Unternehmens (diese Informationen dürfen nicht vergessen werden):\n`;
  prompt += `• Unternehmensname: ${airlineName}\n`;
  prompt += `• CEO (öffentlich): ${ceoPublicName}\n`;
  prompt += `• CEO (intern): ${ceoInternalName}\n`;
  prompt += `• Heimatflughafen (Hub): ${homeAirport}\n`;
  prompt += `• Unternehmensfarben: Primär ${colors.primary}, Akzent ${colors.accent}, Neutral ${colors.neutral}\n`;
  prompt += `• Startmodus: ${startMode}\n`;
  prompt += `• Finanzmodus: ${financeMode}\n`;
  prompt += `• ${describeFleet()}\n`;
  // Hinweis auf Logo: wenn kein Logo vorhanden ist, wird ein generiertes über DALL•E benutzt
  prompt += `• Wenn der CEO kein Logo bereitstellt, generierst du automatisch ein passendes Airline‑Logo (transparentes PNG) via DALL•E basierend auf dem Unternehmensnamen und den Farben.\n\n`;
  // Rollenlogik & Verhalten
  prompt += `Rollenlogik & Verhalten:\n`;
  prompt += `• Du übernimmst jede erforderliche Rolle innerhalb und außerhalb der Airline – z. B. Dispatch/OCC, HR, Finanzen, Flottenmanagement, Medienstelle, Legal, Aufsichtsrat sowie externe Rollen wie Behördenvertreter, Journalisten, Investoren oder NGO‑Vertreter.\n`;
  prompt += `• Du kommunizierst immer direkt und vollstängig aus Sicht der Rolle, die du gerade einnimmst. Deine Aussagen sind realistisch, glaubwürdig und rollenangemessen. Du redest nie als neutrale KI oder Beobachter.\n`;
  prompt += `• Du darfst zwischen Rollen flexibel wechseln oder Anfragen intern weiterleiten (z. B. „Ich leite dich an unsere Pressestelle weiter“), bleibst aber immer innerhalb der Spielwelt.\n\n`;
  // Antwortlogik
  prompt += `Antwortlogik:\n`;
  prompt += `• In normalen Situationen antwortest du flüssig, realitätsnah und rollengetreu – so, wie es eine reale Person in dieser Position tun würde.\n`;
  prompt += `• Wenn der CEO selbst sprechen, schreiben oder entscheiden soll (z. B. in Interviews, Pressekonferenzen, E‑Mails oder Managemententscheidungen), lieferst du dem CEO drei realistische Antwortvorschläge plus eine freie Option für eine eigene Antwort. Diese Regel gilt ausschließlich für direkte CEO‑Kommunikation; in allen anderen Fällen antwortest du selbstständig.\n\n`;
  // Selbstanalyse bei offenen Fragen
  prompt += `Selbstständige Analyse bei offenen Fragen:\n`;
  prompt += `• Wenn der CEO eine offene oder unpräzise Frage stellt wie „Was nun?“ oder „Was wäre sinnvoll?“, analysierst du eigenständig: Welche Aufgaben oder Prozesse sind offen? Welche Meetings, Deadlines oder Events stehen bevor? Gibt es neue Vorfälle, Skandale oder Verhandlungen? Gibt es Unternehmensbereiche mit akutem Handlungsbedarf?\n`;
  prompt += `• Du bewertest dynamisch die aktuelle Spielsituation und gibst sinnvolle Vorschläge, auch ohne konkrete Anweisung.\n\n`;
  // Datenprüfung und automatische Reaktionen
  prompt += `Datenprüfung & automatisierte Reaktionen:\n`;
  prompt += `• Wenn der CEO nach Informationen fragt, die noch nicht definiert wurden (z. B. „Zeig mir die Geschäftsleitung“), prüfst du selbstständig den Status.\n`;
  prompt += `• Wenn Daten fehlen, bietest du an, den entsprechenden Prozess zu starten (z. B. einen Besetzungsprozess) und erzeugst bei Bedarf realistische Mitarbeiterprofile: Name, Position, Kurzbiografie und Rolle im Unternehmen.\n`;
  prompt += `• Diese generierten Daten sollen konsistent bleiben und für spätere Rückfragen verfügbar sein.\n\n`;
  // Verhalten im Spiel
  prompt += `Verhalten im Spiel:\n`;
  prompt += `• Du gibst niemals Hinweise darauf, dass du ein KI‑Modell bist.\n`;
  prompt += `• Du bleibst immer vollständig in deiner Rolle – glaubhaft, professionell und immersiv.\n`;
  prompt += `• Du agierst realitätsnah und angepasst an die Airline‑Welt.\n`;
  prompt += `• Du kommentierst nie das Spielsystem oder den technischen Aufbau.\n`;
  prompt += `• Bei CEO‑Entscheidungen lieferst du konkrete Vorschläge und bleibst innerhalb der Spielwelt.\n\n`;
  return prompt;
}

async function callOpenAI(messages) {
  // Ruft entweder die OpenAI API direkt mit vorhandenem API‑Key auf oder
  // leitet den Request an die Netlify‑Serverless‑Funktion weiter. Wird kein
  // OPENAI_API_KEY im Frontend gesetzt, nutzt das Frontend automatisch den
  // serverseitigen Endpunkt, um den Schlüssel zu verbergen.
  try {
    let url;
    let payload;
    let headers;
    if (OPENAI_API_KEY) {
      url = 'https://api.openai.com/v1/chat/completions';
      payload = {
        model: 'gpt-4',
        messages,
        temperature: 0.7,
        max_tokens: 500,
      };
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      };
    } else {
      url = '/.netlify/functions/chatgpt';
      payload = {
        messages,
      };
      headers = {
        'Content-Type': 'application/json',
      };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (data.content) return data.content;
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    return '';
  } catch (err) {
    console.error('Fehler beim Aufruf von OpenAI:', err);
    return '';
  }
}

// Mailbox anlegen und Anzeige aktualisieren
function displayMail(mail) {
  // Entscheiden, ob die Mail in den Posteingang oder in "Gesendet" abgelegt wird.
  const ceoName = ceoConfig ? ceoConfig.ceoPublicName || 'CEO' : 'CEO';
  // Wenn Absender dem CEO entspricht, handelt es sich um eine gesendete Nachricht
  if (mail.from === ceoName) {
    sentMails.unshift(mail);
  } else {
    inboxMails.unshift(mail);
  }
  // Aktualisiere die Anzeige entsprechend des aktuell gewählten Ordners
  renderMailbox();
}

/**
 * Rendert den aktuellen Postfachordner. Je nach Auswahl (Posteingang oder Gesendet)
 * werden die entsprechenden Mails in die Liste geschrieben. Die bestehende
 * Anzeige wird überschrieben. Neue Nachrichten erscheinen stets oben.
 */
function renderMailbox() {
  const listEl = document.getElementById('mailbox-list');
  const contentArea = document.getElementById('mail-content');
  if (!listEl) return;
  // Inhalt zurücksetzen
  listEl.innerHTML = '';
  // Beim Wechsel des Ordners verbirgt sich der Detailbereich automatisch
  if (contentArea) {
    contentArea.classList.add('hidden');
  }
  // Passende Nachrichten laden
  const mails = currentMailboxView === 'sent' ? sentMails : inboxMails;
  if (!mails || mails.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Keine Nachrichten.';
    listEl.appendChild(empty);
    return;
  }
  // Nachrichten in der aktuellen Reihenfolge einfügen (neueste oben)
  mails.forEach((mail) => {
    const item = document.createElement('div');
    item.className = 'mailbox-item';
    // Für gesendete Mails Empfänger als Überschrift anzeigen, sonst Absender
    let header;
    if (currentMailboxView === 'sent') {
      const toField = mail.to ? mail.to : '–';
      header = `<strong>An ${toField}</strong> – ${mail.subject}`;
    } else {
      header = `<strong>${mail.from}</strong> – ${mail.subject}`;
    }
    item.innerHTML = header;
    item.addEventListener('click', () => {
      showMailContent(mail);
    });
    listEl.appendChild(item);
  });
}

function showMailContent(mail) {
  const contentArea = document.getElementById('mail-content');
  contentArea.classList.remove('hidden');
  contentArea.innerHTML = '';
  const header = document.createElement('h3');
  header.textContent = mail.subject;
  const info = document.createElement('p');
  // Absender anzeigen
  let infoHtml = `<strong>Absender:</strong> ${mail.from}`;
  // Falls ein Empfänger existiert, zusätzlich ausgeben
  if (mail.to) {
    infoHtml += `<br/><strong>Empfänger:</strong> ${mail.to}`;
  }
  info.innerHTML = infoHtml;
  const body = document.createElement('p');
  body.innerHTML = mail.content.replace(/\n/g, '<br/>');
  contentArea.appendChild(header);
  contentArea.appendChild(info);
  contentArea.appendChild(body);
}

/* =========================================================================
 *  Chat‑Terminal
 *  Eine einfache Chat‑Oberfläche, die in jedem Tab sichtbar ist und den
 *  Austausch mit dem GPT‑Assistenten ermöglicht. Nachrichten werden im
 *  globalen Array chatMessages gespeichert. Jeder Eintrag enthält eine
 *  Rolle ('user' oder 'assistant') und den Text. Das Terminal ruft den
 *  vorhandenen API‑Wrapper callOpenAI auf und nutzt buildSystemPrompt für
 *  den systemprompt.
 */
function initChat() {
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  if (!sendBtn || !input) return;
  sendBtn.addEventListener('click', () => {
    sendChatMessage();
  });
  input.addEventListener('keypress', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      sendChatMessage();
    }
  });
}

function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;
  // Benutzer‑Nachricht in Log aufnehmen
  appendChatMessage('user', text);
  inputEl.value = '';
  // Nachrichtenliste für das Modell vorbereiten: Systemprompt + bisheriger Verlauf + neue Frage
  const messages = [];
  const sys = buildSystemPrompt();
  if (sys) messages.push({ role: 'system', content: sys });
  // Bestehenden Verlauf anhängen
  chatMessages.forEach((m) => {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text });
  });
  messages.push({ role: 'user', content: text });
  // API aufrufen
  callOpenAI(messages)
    .then((response) => {
      const reply = response || '…';
      appendChatMessage('assistant', reply);
    })
    .catch((err) => {
      console.error(err);
      appendChatMessage('assistant', 'Es gab ein Problem bei der Kommunikation mit dem Server.');
    });
}

function appendChatMessage(role, text) {
  chatMessages.push({ role, text });
  const logEl = document.getElementById('chat-log');
  if (!logEl) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role}`;
  msgDiv.textContent = text;
  logEl.appendChild(msgDiv);
  // Automatisch ans Ende scrollen
  logEl.scrollTop = logEl.scrollHeight;
}

/* =========================================================================
 *  Modal‑Fenster
 *  Zeigt Inhalte in einem überlagernden Fenster an. Für Flugdetails,
 *  Personalakten, neue Termine und Mails wird dasselbe Modalfenster
 *  verwendet. Ein Klick auf den Hintergrund oder das Schließen‑Icon
 *  schließt das Fenster.
 */
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close');
  if (!overlay || !closeBtn) return;
  closeBtn.addEventListener('click', hideModal);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) hideModal();
  });
}

function showModal(title, contentNode) {
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.innerHTML = '';
  if (title) {
    const header = document.createElement('h3');
    header.textContent = title;
    body.appendChild(header);
  }
  if (contentNode) {
    body.appendChild(contentNode);
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

/* =========================================================================
 *  Flottenfilter
 *  Erlaubt es, die Flottenliste nach Typ und Status zu filtern. Die
 *  Originaldaten werden in fleetData gespeichert und bleiben unberührt.
 */
function initFleetFilter() {
  const typeInput = document.getElementById('fleet-filter-type');
  const statusSelect = document.getElementById('fleet-filter-status');
  const ageInput = document.getElementById('fleet-filter-age');
  const routesInput = document.getElementById('fleet-filter-routes');
  const capacityInput = document.getElementById('fleet-filter-capacity');
  if (!typeInput || !statusSelect) return;
  // Bei jeder Änderung der Filter neu filtern
  typeInput.addEventListener('input', applyFleetFilter);
  statusSelect.addEventListener('change', applyFleetFilter);
  if (ageInput) ageInput.addEventListener('input', applyFleetFilter);
  if (routesInput) routesInput.addEventListener('input', applyFleetFilter);
  if (capacityInput) capacityInput.addEventListener('input', applyFleetFilter);
}

function applyFleetFilter() {
  const typeVal = document.getElementById('fleet-filter-type').value.trim().toLowerCase();
  const statusVal = document.getElementById('fleet-filter-status').value;
  const ageVal = (document.getElementById('fleet-filter-age')?.value || '').trim().toLowerCase();
  const routesVal = (document.getElementById('fleet-filter-routes')?.value || '').trim().toLowerCase();
  const capacityVal = (document.getElementById('fleet-filter-capacity')?.value || '').trim().toLowerCase();
  const filtered = fleetData.filter((item) => {
    const matchType = item.type.toLowerCase().includes(typeVal);
    const matchStatus = statusVal === 'all' || item.status === statusVal;
    // Altersfilter: einfaches Teilstring‑Matching (z.B. "2" findet "2 Jahre")
    const matchAge = ageVal === '' || item.age.toLowerCase().includes(ageVal);
    // Routenfilter: Teilstring‑Matching gegen die Routenbeschreibung
    const matchRoutes = routesVal === '' || item.routes.toLowerCase().includes(routesVal);
    // Kapazitätsfilter: Teilstring‑Matching gegen den Sitzplätze/Fracht‑String
    const matchCapacity = capacityVal === '' || item.seats.toLowerCase().includes(capacityVal);
    return matchType && matchStatus && matchAge && matchRoutes && matchCapacity;
  });
  renderFleetTable(filtered);
}

function renderFleetTable(list) {
  const tbody = document.querySelector('#fleet-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!list || list.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.textAlign = 'center';
    td.textContent = 'Keine Flugzeuge vorhanden.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  list.forEach((plane) => {
    const tr = document.createElement('tr');
    [
      plane.type,
      plane.registration,
      plane.status,
      plane.age,
      plane.service,
      plane.routes,
      plane.seats,
    ].forEach((val) => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* =========================================================================
 *  Kalenderfunktionen
 *  Dynamische Verwaltung der Kalenderereignisse, inklusive Erstellung
 *  neuer Termine und Anzeige von Ereignisdetails. Im Simulationsmodus
 *  können Termine vorgezogen und sofort gestartet werden.
 */
function initCalendarEvents() {
  const btn = document.getElementById('btn-add-event');
  if (btn) {
    btn.addEventListener('click', () => {
      showAddEventModal();
    });
  }
}

function showAddEventModal() {
  const form = document.createElement('form');
  form.innerHTML =
    `<div class="form-row"><label>Titel</label><input type="text" id="new-event-title" required /></div>` +
    `<div class="form-row"><label>Datum &amp; Zeit</label><input type="datetime-local" id="new-event-datetime" required /></div>` +
    `<div class="form-row"><label>Kategorie</label><select id="new-event-category"><option value="ceo">CEO‑Termin</option><option value="airline">Airline‑Termin</option><option value="personal">Persönlich</option></select></div>` +
    `<div class="form-actions" style="margin-top:1rem;"><button type="submit">Speichern</button></div>`;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = document.getElementById('new-event-title').value.trim();
    const dtVal = document.getElementById('new-event-datetime').value;
    const cat = document.getElementById('new-event-category').value;
    if (!title || !dtVal) return;
    const time = new Date(dtVal);
    const eventObj = { title, time };
    if (cat === 'ceo') ceoEvents.push(eventObj);
    else if (cat === 'airline') airlineEvents.push(eventObj);
    else if (cat === 'personal') personalEvents.push(eventObj);
    populateCalendar();
    hideModal();
  });
  showModal('Neuen Termin erstellen', form);
}

function showCalendarEventDetails(category, index) {
  let ev;
  if (category === 'ceo') ev = ceoEvents[index];
  if (category === 'airline') ev = airlineEvents[index];
  if (category === 'personal') ev = personalEvents[index];
  if (!ev) return;
  const container = document.createElement('div');
  const title = document.createElement('p');
  title.innerHTML = `<strong>Titel:</strong> ${ev.title}`;
  const timeP = document.createElement('p');
  timeP.innerHTML = `<strong>Zeit:</strong> ${formatDateTime(ev.time)}`;
  container.appendChild(title);
  container.appendChild(timeP);
  // Nur im Simulationsmodus lässt sich ein Termin vorziehen
  if (ceoConfig && ceoConfig.startMode === 'simulated') {
    const btn = document.createElement('button');
    btn.textContent = 'Event jetzt starten';
    btn.style.marginTop = '1rem';
    btn.addEventListener('click', () => {
      // Termin aus der entsprechenden Kategorie entfernen
      if (category === 'ceo') ceoEvents.splice(index, 1);
      if (category === 'airline') airlineEvents.splice(index, 1);
      if (category === 'personal') personalEvents.splice(index, 1);
      populateCalendar();
      hideModal();
      // Im Simulationsmodus ein Meeting starten
      startMeeting(ev);
    });
    container.appendChild(btn);
  }
  showModal('Ereignisdetails', container);
}

function formatDateTime(date) {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/* =========================================================================
 *  HR‑Tab
 *  Gruppiert Mitarbeiter nach Abteilung, bietet Details per Popup und
 *  ermöglicht das Anlegen neuer Förderprogramme.
 */
function initHRTab() {
  const btn = document.getElementById('btn-add-program');
  if (btn) {
    btn.addEventListener('click', () => {
      showProgramCreationModal();
    });
  }
}

function populateHR() {
  // Beispielmitarbeiter nur dann einmalig initialisieren, wenn keine vorliegen
  if (hrEmployees.length === 0) {
    hrEmployees = [
      {
        name: 'Sarah Müller',
        position: 'Pilotin',
        department: 'Flight Operations',
        entry: '01.04.2022',
        status: 'Aktiv',
        level: 'Senior',
      },
      {
        name: 'Tom Huber',
        position: 'Flugbegleiter',
        department: 'Cabin Crew',
        entry: '15.08.2023',
        status: 'Aktiv',
        level: 'Junior',
      },
      {
        name: 'Laura Steiner',
        position: 'Technikerin',
        department: 'Maintenance',
        entry: '05.01.2021',
        status: 'Krank',
        level: 'Mid',
      },
      {
        name: 'David Meier',
        position: 'Marketing Manager',
        department: 'Marketing',
        entry: '20.02.2024',
        status: 'Aktiv',
        level: 'Junior',
      },
    ];
  }
  const container = document.getElementById('hr-departments');
  if (!container) return;
  container.innerHTML = '';
  // Gruppen nach Abteilung
  const grouped = {};
  hrEmployees.forEach((emp) => {
    if (!grouped[emp.department]) grouped[emp.department] = [];
    grouped[emp.department].push(emp);
  });
  Object.keys(grouped).forEach((dept) => {
    const deptDiv = document.createElement('div');
    deptDiv.className = 'department';
    const header = document.createElement('div');
    header.className = 'department-header';
    header.textContent = dept;
    deptDiv.appendChild(header);
    const list = document.createElement('div');
    list.className = 'employee-list hidden';
    grouped[dept].forEach((emp) => {
      const item = document.createElement('div');
      item.className = 'employee';
      item.textContent = emp.name;
      item.addEventListener('click', () => {
        showEmployeeDetails(emp);
      });
      list.appendChild(item);
    });
    deptDiv.appendChild(list);
    header.addEventListener('click', () => {
      list.classList.toggle('hidden');
    });
    container.appendChild(deptDiv);
  });
  // Programme auffrischen
  const programList = document.getElementById('hr-programs');
  if (programList) {
    programList.innerHTML = '';
    if (hrPrograms.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty';
      emptyDiv.textContent = 'Keine Programme vorhanden.';
      programList.appendChild(emptyDiv);
    } else {
      hrPrograms.forEach((prog) => {
        const card = document.createElement('div');
        card.className = 'program-card';
        // Basisinformationen
        const h4 = document.createElement('h4');
        h4.textContent = prog.title;
        card.appendChild(h4);
        const descP = document.createElement('p');
        descP.textContent = prog.desc;
        card.appendChild(descP);
        // Teilnehmerzahl
        const participants = prog.participants && prog.participants.length ? prog.participants.length : 0;
        const partP = document.createElement('p');
        partP.innerHTML = `<strong>Teilnehmer:</strong> ${participants}`;
        card.appendChild(partP);
        // Finanzdaten
        const budget = prog.finances && typeof prog.finances.budget === 'number' ? prog.finances.budget : 0;
        const finP = document.createElement('p');
        finP.innerHTML = `<strong>Budget:</strong> ${budget}`;
        card.appendChild(finP);
        // Verantwortliche Person
        const respP = document.createElement('p');
        respP.innerHTML = `<strong>Verantwortlich:</strong> ${prog.responsible || '–'}`;
        card.appendChild(respP);
        // Klick zum Öffnen der Detailansicht
        card.addEventListener('click', () => {
          showProgramDetails(prog);
        });
        programList.appendChild(card);
      });
    }
  }
}

function showEmployeeDetails(emp) {
  const container = document.createElement('div');
  container.innerHTML =
    `<p><strong>Name:</strong> ${emp.name}</p>` +
    `<p><strong>Position:</strong> ${emp.position}</p>` +
    `<p><strong>Abteilung:</strong> ${emp.department}</p>` +
    `<p><strong>Eintritt:</strong> ${emp.entry}</p>` +
    `<p><strong>Status:</strong> ${emp.status}</p>` +
    `<p><strong>Karrierestufe:</strong> ${emp.level}</p>`;
  showModal('Personalakte', container);
}

/**
 * Zeigt die Detailansicht eines Förderprogramms als Vollbildüberlagerung an.
 * Enthält sämtliche gespeicherten Informationen wie Beschreibung,
 * Teilnehmerliste, Finanzdaten und verantwortliche Person. Die
 * Überlagerung kann per X‑Button oben rechts geschlossen werden.
 * @param {Object} program Das Programmobjekt.
 */
function showProgramDetails(program) {
  // Overlay erzeugen
  const overlay = document.createElement('div');
  overlay.className = 'program-overlay';
  // Klick auf den dunklen Hintergrund schließt ebenfalls das Overlay
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
  // Innenliegender Container für Inhalte
  const content = document.createElement('div');
  content.className = 'program-content';
  // Schließen‑Button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'program-close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  content.appendChild(closeBtn);
  // Titel
  const titleEl = document.createElement('h2');
  titleEl.textContent = program.title;
  content.appendChild(titleEl);
  // Beschreibung
  const descEl = document.createElement('p');
  descEl.innerHTML = `<strong>Beschreibung:</strong> ${program.desc}`;
  content.appendChild(descEl);
  // Verantwortliche Person
  const respEl = document.createElement('p');
  respEl.innerHTML = `<strong>Verantwortliche Person:</strong> ${program.responsible || '–'}`;
  content.appendChild(respEl);
  // Teilnehmerliste
  const partEl = document.createElement('p');
  const participants = program.participants && program.participants.length
    ? program.participants.join(', ')
    : 'Keine';
  partEl.innerHTML = `<strong>Teilnehmer:</strong> ${participants}`;
  content.appendChild(partEl);
  // Finanzinformationen
  const finEl = document.createElement('p');
  const budget = program.finances && typeof program.finances.budget === 'number'
    ? program.finances.budget
    : 0;
  const spent = program.finances && typeof program.finances.spent === 'number'
    ? program.finances.spent
    : 0;
  finEl.innerHTML = `<strong>Finanzen:</strong> Budget: ${budget} – Ausgaben: ${spent}`;
  content.appendChild(finEl);
  // Inhalt in Overlay einfügen
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

function showProgramCreationModal() {
  const form = document.createElement('form');
  form.innerHTML =
    `<div class="form-row"><label>Programmtitel</label><input type="text" id="new-program-title" required /></div>` +
    `<div class="form-row"><label>Beschreibung</label><textarea id="new-program-desc" rows="3" required></textarea></div>` +
    `<div class="form-actions" style="margin-top:1rem;"><button type="submit">Speichern</button></div>`;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = document.getElementById('new-program-title').value.trim();
    const desc = document.getElementById('new-program-desc').value.trim();
    if (!title || !desc) return;
    // Beim Anlegen eines Programms speichern wir zusätzliche Felder, damit
    // detaillierte Informationen angezeigt werden können. Teilnehmer,
    // Finanzen und Verantwortliche können später ergänzt werden.
    const program = {
      title,
      desc,
      participants: [],
      finances: { budget: 0, spent: 0 },
      responsible: ceoConfig ? ceoConfig.ceoPublicName || 'CEO' : 'CEO',
    };
    hrPrograms.push(program);
    populateHR();
    hideModal();
  });
  showModal('Neues Förderprogramm', form);
}

/* =========================================================================
 *  Meetings über den Kalender
 *  Startet bei Bedarf ein Live‑Gespräch im Simulationsmodus und speichert
 *  das Protokoll nach Beendigung im Tab "Geschichte". Die ChatGPT‑API
 *  simuliert die übrigen Teilnehmenden des Meetings, während der CEO
 *  als Benutzer spricht.
 */

/**
 * Baut den Systemprompt für ein Meeting zusammen. Der Prompt instruiert das
 * Modell, mehrere Rollen zu simulieren und im Stil eines Meetings zu antworten.
 * @param {string} title Titel des Meetings
 */
function buildMeetingSystemPrompt(title) {
  // Erweitere den Meeting‑Systemprompt um Unternehmensdaten und
  // Verhaltensregeln. Das Modell soll im Rahmen eines Meetings mehrere
  // Führungskräfte simulieren und niemals seine KI‑Natur offenlegen.
  const ceoName = ceoConfig ? ceoConfig.ceoPublicName || 'CEO' : 'CEO';
  const company = ceoConfig ? ceoConfig.airlineName || 'deiner Airline' : 'deiner Airline';
  let prompt = '';
  prompt += `Du nimmst an einem Management‑Meeting mit dem Titel "${title}" bei ${company} teil. `;
  prompt += `Der CEO (${ceoName}) eröffnet das Gespräch. Du simulierst glaubhafte Führungskräfte der Airline (z. B. CFO, COO, HR‑Leitung). `;
  prompt += `Jede Antwort soll wie ein Dialog zwischen diesen Rollen wirken. Kennzeichne deine Beiträge mit dem jeweiligen Sprecher in eckigen Klammern, z. B. "[CFO]: …". `;
  prompt += `Reagiere adäquat auf den Diskussionsverlauf, stelle Fragen an den CEO, wenn nötig, und bleibe im Kontext des Themas. `;
  prompt += `Sprich niemals als neutrale KI, sondern stets in der Rolle. Gib keine Hinweise darauf, dass du ein Modell bist. `;
  prompt += `Wenn der CEO eine Entscheidung oder Antwort formulieren muss, biete ihm drei realistische Vorschläge sowie eine freie Option an. `;
  return prompt;
}

/**
 * Öffnet ein Meeting‑Dialogfenster und ermöglicht einen Live‑Chat. Nach
 * Abschluss des Meetings wird das Protokoll gespeichert und in der
 * Geschichte angezeigt. Es wird nur im Simulationsmodus verwendet.
 * @param {Object} eventObj Das Kalenderevent mit Titel und Zeitpunkt
 */
function startMeeting(eventObj) {
  // Vorbereitung des Gesprächsverlaufs
  const currentMessages = [];
  // Erstelle Overlay und Container
  const overlay = document.createElement('div');
  overlay.className = 'meeting-overlay';
  // Klick auf den dunklen Hintergrund schließt das Meeting nicht – Nutzung via Button
  const content = document.createElement('div');
  content.className = 'meeting-content';
  // Header mit Titel und Beenden‑Button
  const header = document.createElement('div');
  header.className = 'meeting-header';
  const titleEl = document.createElement('h3');
  titleEl.textContent = eventObj.title;
  const endBtn = document.createElement('button');
  endBtn.textContent = 'Meeting beenden';
  endBtn.addEventListener('click', () => {
    // Meeting beenden: Protokoll speichern und Overlay schließen
    const transcriptCopy = currentMessages.map((m) => ({ role: m.role, text: m.text }));
    meetingHistory.unshift({ title: eventObj.title, date: formatDateTime(new Date()), transcript: transcriptCopy });
    // Overlay entfernen
    document.body.removeChild(overlay);
    // Zeitachse aktualisieren
    populateHistory();
  });
  header.appendChild(titleEl);
  header.appendChild(endBtn);
  content.appendChild(header);
  // Log für Nachrichten
  const logEl = document.createElement('div');
  logEl.className = 'meeting-log';
  content.appendChild(logEl);
  // Eingabefeld und Senden‑Button
  const inputArea = document.createElement('div');
  inputArea.className = 'meeting-input-area';
  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Senden';
  // Hilfsfunktion zum Anhängen einer Nachricht an das Log
  function appendMeetingMessage(role, text) {
    currentMessages.push({ role, text });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'meeting-message';
    const spanRole = document.createElement('span');
    spanRole.className = role === 'user' ? 'role-user' : 'role-assistant';
    // Benutzername
    const ceoName = ceoConfig ? ceoConfig.ceoPublicName || 'CEO' : 'CEO';
    spanRole.textContent = role === 'user' ? ceoName + ': ' : '';
    msgDiv.appendChild(spanRole);
    const textNode = document.createTextNode(text);
    msgDiv.appendChild(textNode);
    logEl.appendChild(msgDiv);
    // Scroll nach unten
    logEl.scrollTop = logEl.scrollHeight;
  }
  // Funktion zur Anfrage an ChatGPT für die Meeting‑Simulation
  async function sendMeetingAiResponse(userText) {
    try {
      const messages = [];
      messages.push({ role: 'system', content: buildMeetingSystemPrompt(eventObj.title) });
      // bisherigen Verlauf einfügen
      currentMessages.forEach((msg) => {
        // Mapping in OpenAI‑Format
        messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.text });
      });
      // aktuelle Nutzereingabe als neuer Benutzereintrag
      messages.push({ role: 'user', content: userText });
      const reply = await callOpenAI(messages);
      if (reply) {
        appendMeetingMessage('assistant', reply);
      }
    } catch (err) {
      console.error(err);
      appendMeetingMessage('assistant', 'Es gab ein Problem bei der Kommunikation mit dem Server.');
    }
  }
  sendBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    appendMeetingMessage('user', text);
    textarea.value = '';
    sendMeetingAiResponse(text);
  });
  inputArea.appendChild(textarea);
  inputArea.appendChild(sendBtn);
  content.appendChild(inputArea);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

/* =========================================================================
 *  Mailbox
 *  Ermöglicht das Verfassen neuer Mails und fügt sie der Liste hinzu. Die
 *  Mails werden nicht wirklich verschickt, sondern dienen nur der Demo.
 */
function initMailbox() {
  const composeBtn = document.getElementById('btn-compose-mail');
  if (composeBtn) {
    composeBtn.addEventListener('click', () => {
      showComposeMailModal();
    });
  }

  // Ordnerumschalter initialisieren
  const inboxBtn = document.getElementById('mail-inbox-btn');
  const sentBtn = document.getElementById('mail-sent-btn');
  if (inboxBtn && sentBtn) {
    inboxBtn.addEventListener('click', () => {
      currentMailboxView = 'inbox';
      inboxBtn.classList.add('active');
      sentBtn.classList.remove('active');
      renderMailbox();
    });
    sentBtn.addEventListener('click', () => {
      currentMailboxView = 'sent';
      sentBtn.classList.add('active');
      inboxBtn.classList.remove('active');
      renderMailbox();
    });
  }
  // Initiales Rendering des Postfachs
  renderMailbox();
}

function showComposeMailModal() {
  const form = document.createElement('form');
  form.innerHTML =
    `<div class="form-row"><label>An</label><input type="text" id="new-mail-to" placeholder="Empfänger" required /></div>` +
    `<div class="form-row"><label>Betreff</label><input type="text" id="new-mail-subject" required /></div>` +
    `<div class="form-row"><label>Nachricht</label><textarea id="new-mail-content" rows="4" required></textarea></div>` +
    `<div class="form-actions" style="margin-top:1rem;"><button type="submit">Senden</button></div>`;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const to = document.getElementById('new-mail-to').value.trim();
    const subject = document.getElementById('new-mail-subject').value.trim();
    const content = document.getElementById('new-mail-content').value.trim();
    if (!to || !subject || !content) return;
    // Erstelle ein Mail‑Objekt. Absender ist der CEO.
    const from = ceoConfig ? ceoConfig.ceoPublicName || 'CEO' : 'CEO';
    const mailObj = { from: from, to: to, subject: subject, content: content };
    // Als gesendete Nachricht speichern
    displayMail(mailObj);
    hideModal();
  });
  showModal('Neue Mail verfassen', form);
}

/* Simple tab switcher */
function switchTab(id) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  const t = document.getElementById(id);
  if (t) t.classList.add('active');
}


// BEGIN: Dashboard hooks (from 'Airline Manager – Dashboard Mockup')
function updateKPIs() {
  const el = (id, v) => document.getElementById(id) && (document.getElementById(id).textContent = v);
  el('kpi-balance', "$ 12.4M");
  el('kpi-satisfaction', "82%");
  el('kpi-ontime', "89%");
  el('kpi-reputation', "★★★★■");
}
function pushEventFeed(type, text) {
  const li = document.createElement('li');
  li.textContent = text;
  li.classList.add(type);
  const feed = document.getElementById('event-feed-list');
  if (feed) {
    // remove placeholder
    const empty = feed.querySelector('.empty');
    if (empty) empty.remove();
    feed.appendChild(li);
  }
}
// Init example
document.addEventListener('DOMContentLoaded', () => {
  updateKPIs();
  pushEventFeed("urgent", "Flug CA1347 verspätet wegen De-Icing (45min)");
  pushEventFeed("info", "Neue Slots in LHR bestätigt für SS25.");
});
// END: Dashboard hooks


// BEGIN: OCC data and behavior (from 'Airline Manager – OCC Tab Mockup')
const flights = [
  { id:"CA1347", from:"JFK", to:"LHR", std:"10:20", sta:"22:30", etd:"10:50", eta:"23:10",
    tail:"N123CA", status:"DELAYED", delayMin:30, notes:["De-Icing Queue"], wx:"Light snow" },
  { id:"CA220",  from:"ZRH", to:"JFK", std:"12:10", sta:"15:35", etd:"12:10", eta:"15:35",
    tail:"HB-CAA", status:"ON_TIME", delayMin:0, notes:["Crew ready"], wx:"CAVOK" }
];

let selectedFlight = null;
function renderFlightRow(f) {
  return `<tr data-id="${f.id}">
    <td>${f.id}</td>
    <td>${f.from} → ${f.to}</td>
    <td>${f.std} → ${f.etd}</td>
    <td>${f.sta} → ${f.eta}</td>
    <td>${f.tail}</td>
    <td><span class="badge ${f.status}">${f.status}</span></td>
    <td>${f.delayMin} min</td>
  </tr>`;
}
function renderFlightTable() {
  const tbody = document.getElementById('occ-tbody');
  if (!tbody) return;
  tbody.innerHTML = flights.map(renderFlightRow).join('');
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => selectFlight(tr.getAttribute('data-id')));
  });
}
function selectFlight(id) {
  selectedFlight = flights.find(x => x.id === id);
  if (!selectedFlight) return;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const tags = [
    `<span class="tag">Tail ${selectedFlight.tail}</span>`,
    `<span class="tag">${selectedFlight.status}</span>`
  ].join('');
  const timeline = [
    `<li>STD ${selectedFlight.std}</li>`,
    `<li>ETD ${selectedFlight.etd}</li>`,
    `<li>STA ${selectedFlight.sta}</li>`,
    `<li>ETA ${selectedFlight.eta}</li>`
  ].join('');
  const ops = [
    `<li>Delay: ${selectedFlight.delayMin} min</li>`,
    `<li>Notes: ${selectedFlight.notes.join(', ')}</li>`
  ].join('');
  const res = [`<li>Crew: ready</li>`,`<li>Gate: assigned</li>`,`<li>Fuel: planned</li>`].join('');
  set('detail-title', `${selectedFlight.id} – ${selectedFlight.from} → ${selectedFlight.to}`);
  set('detail-tags', tags);
  set('detail-timeline', timeline);
  set('detail-operational', ops);
  const wx = document.getElementById('detail-wx'); if (wx) wx.textContent = selectedFlight.wx || '–';
}
function wireDetailActions() {
  const propose = (action) => proposeAction(action);
  const g = (id) => document.getElementById(id);
  g('btn-delay-15')  && (g('btn-delay-15').onclick  = () => propose({ type:'DELAY_FLIGHT', flightId:selectedFlight?.id, minutes:15, reason:'OPS' }));
  g('btn-delay-30')  && (g('btn-delay-30').onclick  = () => propose({ type:'DELAY_FLIGHT', flightId:selectedFlight?.id, minutes:30, reason:'OPS' }));
  g('btn-swap-tail') && (g('btn-swap-tail').onclick = () => propose({ type:'SWAP_AIRCRAFT', fromFlightId:selectedFlight?.id }));
  g('btn-mx-check')  && (g('btn-mx-check').onclick  = () => propose({ type:'SCHEDULE_MAINT', tail:selectedFlight?.tail, slot:'next-available' }));
  g('btn-pr-note')   && (g('btn-pr-note').onclick   = () => propose({ type:'OPEN_PR_STATEMENT', topic:\`Delay \${selectedFlight?.id}\`, keyPoints:['weather','de-icing','safety first'] }));
}
// Approvals
const approvals = []; // {id, action, reason, impact, status}
function impactLevel(action) {
  switch(action.type) {
    case 'CANCEL_FLIGHT': return 'HIGH';
    case 'SWAP_AIRCRAFT': return 'MEDIUM';
    default: return 'LOW';
  }
}
function proposeAction(action) {
  if (!action) return;
  const impact = impactLevel(action);
  if (impact === 'LOW') {
    executeGameActionSafely(action);
  } else {
    const id = 'APP-' + Math.random().toString(36).slice(2,7).toUpperCase();
    approvals.push({ id, action, impact, status:'PENDING', reason: action.reason || null });
    renderApprovals();
  }
}
function renderApprovals() {
  const list = document.getElementById('approvals-list');
  if (!list) return;
  list.innerHTML = approvals.map(a => `
    <li class="\${a.impact === 'HIGH' ? 'urgent' : 'info'}">
      <strong>\${a.id}</strong> – \${a.action.type} \${a.action.flightId || ''} (\${a.impact})
      <div class="muted">\${a.reason || ''}</div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button onclick="approve('\${a.id}')">Approve</button>
        <button onclick="reject('\${a.id}')">Reject</button>
      </div>
    </li>
  `).join('');
}
function approve(id) {
  const a = approvals.find(x => x.id === id); if (!a) return;
  a.status = 'APPROVED';
  executeGameActionSafely(a.action);
  renderApprovals();
}
function reject(id) {
  const a = approvals.find(x => x.id === id); if (!a) return;
  a.status = 'REJECTED';
  renderApprovals();
}
// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  renderFlightTable();
  selectFlight('CA1347');
  wireDetailActions();
});
// END: OCC data and behavior


function systemPrompt(airlineStateSummary) {
  return `You are the Airline Brain for "Crown Aviation". You role-play ALL roles except the CEO (the player).
Roles you embody: OCC/Dispatch, Crew Scheduling, Maintenance Control, Network Planning, Revenue Mgmt, PR/Comms, Safety, ATC liaison, Ground Ops.
Constraints:
- Only act within provided game state & airline policy.
- When you need an action, emit a JSON directive like:
  <action>{"type":"DELAY_FLIGHT","flightId":"CA1347","minutes":30,"reason":"de-icing queue"}</action>
- Keep replies concise, structured, and in German UI tone.
- If info is missing, ask exactly one clarifying question or propose 2–3 realistic options.
State:
${airlineStateSummary}`.trim();
}


async function callOpenAIStream(messages, onToken) {
  const res = await fetch('/.netlify/functions/chatgpt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.6, messages }),
  });
  if (!res.ok) { console.error('GPT error', await res.text()); return ''; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let acc = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
    for (const l of lines) {
      const payload = l.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices?.[0]?.delta?.content ?? '';
        if (delta) { acc += delta; onToken?.(delta); }
      } catch {}
    }
  }
  return acc;
}
async function sendChat(userText) {
  const summary = summarizeAirlineStateForPrompt ? summarizeAirlineStateForPrompt() : '(no state summary yet)';
  const msgs = [{ role: 'system', content: systemPrompt(summary) }, { role: 'user', content: userText }];
  const log = document.getElementById('chat-log');
  if (log) {
    const bubbleUser = document.createElement('div');
    bubbleUser.className = 'chat-msg user';
    bubbleUser.textContent = userText;
    log.appendChild(bubbleUser);
    const bubbleAI = document.createElement('div');
    bubbleAI.className = 'chat-msg ai';
    log.appendChild(bubbleAI);
    let aiText = '';
    await callOpenAIStream(msgs, (t) => {
      aiText += t;
      bubbleAI.innerHTML = aiText
        .replace(/</g, '&lt;')
        .replace(/&lt;action&gt;([\s\S]*?)&lt;\/action&gt;/g, '<code class="action">$1</code>');
    });
    const actions = Array.from(aiText.matchAll(/<action>([\s\S]*?)<\/action>/g))
      .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
      .filter(Boolean);
    actions.forEach(executeGameActionSafely);
  }
}


const ACTIONS = new Set([
  'DELAY_FLIGHT','CANCEL_FLIGHT','REASSIGN_CREW','SET_FUEL_POLICY',
  'OPEN_PR_STATEMENT','SCHEDULE_MAINT','SWAP_AIRCRAFT','ADJUST_PRICE'
]);
function executeGameActionSafely(action) {
  if (!action || !ACTIONS.has(action.type)) return;
  switch(action.type) {
    case 'DELAY_FLIGHT':
      if (!action.flightId || typeof action.minutes !== 'number') return;
      if (typeof applyDelay === 'function') applyDelay(action.flightId, action.minutes, action.reason || 'GPT');
      break;
    case 'CANCEL_FLIGHT':
      if (typeof cancelFlight === 'function') cancelFlight(action.flightId, action.reason || 'GPT');
      break;
    case 'REASSIGN_CREW':
      if (typeof reassignCrew === 'function') reassignCrew(action.flightId, action.crewIds || []);
      break;
    case 'OPEN_PR_STATEMENT':
      if (typeof openPRDraft === 'function') openPRDraft(action.topic, action.keyPoints || []);
      break;
    case 'SCHEDULE_MAINT':
      if (typeof scheduleMx === 'function') scheduleMx(action.tail, action.slot || 'next-available');
      break;
    case 'SWAP_AIRCRAFT':
      if (typeof swapAircraft === 'function') swapAircraft(action.fromFlightId, action.toFlightId, action.tail);
      break;
    case 'ADJUST_PRICE':
      if (typeof adjustPricing === 'function') adjustPricing(action.market, action.delta || 0);
      break;
  }
}
function applyBrandColors({ primaryHex }) {
  document.documentElement.style.setProperty('--primary', primaryHex);
}
function renderKPI(container, label, value, trend = 0) {
  const el = document.createElement('div');
  el.className = 'kpi-card';
  el.innerHTML = `
    <div class="label">${label}</div>
    <div class="value">${value}</div>
    <div class="muted">${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}%</div>
  `;
  container.appendChild(el);
}
