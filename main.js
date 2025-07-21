// --- Constants and State ---
const VISIBLE_ITEMS = 3;
let charts = [];
let allSessions = [];
let tracks = [];
let riders = [];

// --- Global Settings State ---
let globalSettings = {
    unselectedAlpha: parseFloat(localStorage.getItem('unselectedAlpha')) || 0.18,
    lineThickness: 2, // fixed value, not user-configurable
    fontSize: 14,     // fixed value, not user-configurable
    showBestTimes: localStorage.getItem('showBestTimes') !== "false" // default true
};

// --- Utility Functions ---
function getColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 80%, 40%)`;
}

function saveSelections() {
    const selectedTracks = getCheckedValues('#track-list');
    const selectedRiders = getCheckedValues('#rider-list');
    localStorage.setItem('selectedTracks', JSON.stringify(selectedTracks));
    localStorage.setItem('selectedRiders', JSON.stringify(selectedRiders));
    saveChartSettings();
}

function saveChartSettings() {
    // Save chart settings for each track
    const settings = {};
    document.querySelectorAll('.chart-section').forEach(section => {
        const h2 = section.querySelector('h2');
        if (!h2) return;
        const track = h2.textContent;
        settings[track] = {};
        section.querySelectorAll('.chart-toggle').forEach(toggle => {
            const opt = toggle.getAttribute('data-option');
            settings[track][opt] = toggle.checked;
        });
    });
    localStorage.setItem('chartSettings', JSON.stringify(settings));
}

function loadChartSettings(track) {
    const settings = JSON.parse(localStorage.getItem('chartSettings') || '{}');
    return settings[track] || {};
}

function getCheckedValues(selector) {
    return Array.from(document.querySelectorAll(`${selector} input:checked`)).map(cb => cb.value);
}

function clearCharts() {
    charts.forEach(chart => chart.destroy());
    charts = [];
}

// --- UI Population ---
function populateList(listId, items, prefix, visibleCount) {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    items.forEach((item, idx) => {
        const li = document.createElement('li');
        if (idx >= visibleCount) li.classList.add('hidden');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item;
        checkbox.id = `${prefix}-${item.replace(/\s/g, '-')}`;
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = item;
        li.appendChild(checkbox);
        li.appendChild(label);
        list.appendChild(li);
        checkbox.addEventListener('change', onSelectionChange);
    });
}

function setupToggle(buttonId, listId, label, enable) {
    const button = document.getElementById(buttonId);
    button.disabled = !enable;
    if (!enable) return;
    button.addEventListener('click', () => {
        const expanded = button.textContent.includes('More');
        toggleList(listId, expanded);
        button.textContent = expanded ? `Show Less` : `Show More`;
    });
}

function toggleList(listId, expand) {
    const items = Array.from(document.getElementById(listId).children);
    items.forEach((li, idx) => {
        if (idx >= VISIBLE_ITEMS) li.classList.toggle('hidden', !expand);
    });
}

function applySavedSelections(items, prefix, saved) {
    items.forEach(item => {
        const cb = document.getElementById(`${prefix}-${item.replace(/\s/g, '-')}`);
        if (cb) cb.checked = saved.includes(item);
    });
}

function onSelectionChange(e) {
    saveSelections();
    updateCharts();
}

function selectAllInList(listId, prefix, items, select) {
    items.forEach(item => {
        const cb = document.getElementById(`${prefix}-${item.replace(/\s/g, '-')}`);
        if (cb) cb.checked = select;
    });
    saveSelections();
    updateCharts();
}

// --- Global Settings UI ---
function setupGlobalSettings() {
    const alphaInput = document.getElementById('unselected-alpha');
    const alphaValue = document.getElementById('unselected-alpha-value');
    alphaInput.value = globalSettings.unselectedAlpha;
    alphaValue.textContent = globalSettings.unselectedAlpha;
    alphaInput.oninput = e => {
        globalSettings.unselectedAlpha = parseFloat(e.target.value);
        alphaValue.textContent = e.target.value;
        localStorage.setItem('unselectedAlpha', e.target.value);
        updateCharts();
    };

    const showBestTimesInput = document.getElementById('show-best-times');
    showBestTimesInput.checked = globalSettings.showBestTimes;
    showBestTimesInput.oninput = e => {
        globalSettings.showBestTimes = e.target.checked;
        localStorage.setItem('showBestTimes', e.target.checked);
        updateCharts();
    };
}

// --- Chart Logic ---
function updateCharts() {
    const selectedTracks = getCheckedValues('#track-list').sort();
    const selectedRiders = getCheckedValues('#rider-list');
    const chartsContainer = document.getElementById('charts-container');
    clearCharts();
    chartsContainer.innerHTML = '';

    // If no tracks or no riders selected, show nothing
    if (!selectedTracks.length || !selectedRiders.length) {
        return;
    }

    selectedTracks.forEach(track => {
        const section = document.createElement('div');
        section.className = 'chart-section';
        section.innerHTML = `
            <h2>${track}</h2>
            <div class="chart-options">
                <label><input type="checkbox" class="chart-toggle" data-track="${track.replace(/\s/g, '-')}" data-option="spacing"> Equally Spaced Sessions</label>
                <label><input type="checkbox" class="chart-toggle" data-track="${track.replace(/\s/g, '-')}" data-option="invert-y"> Invert Y-Axis (Lower Better)</label>
                <label><input type="checkbox" class="chart-toggle" data-track="${track.replace(/\s/g, '-')}" data-option="show-points"> Show Points</label>
                <label><input type="checkbox" class="chart-toggle" data-track="${track.replace(/\s/g, '-')}" data-option="show-grid"> Show Grid</label>
            </div>
            <div class="chart-container"><canvas id="chart-${track.replace(/\s/g, '-')}"></canvas></div>
        `;
        chartsContainer.appendChild(section);

        // Restore chart settings from cache or use defaults
        const settings = loadChartSettings(track);
        section.querySelectorAll('.chart-toggle').forEach(toggle => {
            const opt = toggle.getAttribute('data-option');
            // Defaults: spacing, show-points, show-grid = true; invert-y = false
            let defaultVal = (opt === 'invert-y') ? false : true;
            toggle.checked = settings.hasOwnProperty(opt) ? settings[opt] : defaultVal;
            toggle.addEventListener('change', () => {
                saveChartSettings();
                updateChartForTrack(track, selectedRiders);
            });
        });

        // Only show selected riders that have results for this track
        const trackRiders = new Set();
        allSessions.filter(s => s.track === track).forEach(s => Object.keys(s.results).forEach(r => trackRiders.add(r)));
        const ridersToShow = selectedRiders.filter(r => trackRiders.has(r));
        updateChartForTrack(track, ridersToShow);
    });
}

function updateChartForTrack(track, selectedRiders) {
    const canvasId = `chart-${track.replace(/\s/g, '-')}`;
    const oldChartIdx = charts.findIndex(c => c.canvas && c.canvas.id === canvasId);
    if (oldChartIdx !== -1) {
        charts[oldChartIdx].destroy();
        charts.splice(oldChartIdx, 1);
    }

    let trackSessions = allSessions
        .filter(s => s.track === track)
        .sort((a, b) => {
            const da = new Date(a.date), db = new Date(b.date);
            return da - db || a._index - b._index;
        });

    const allTrackRiders = Array.from(new Set(
        trackSessions.flatMap(s => Object.keys(s.results))
    )).sort();

    // Prepare session labels and times
    const sessionsByDate = {};
    trackSessions.forEach(session => {
        if (!sessionsByDate[session.date]) sessionsByDate[session.date] = [];
        sessionsByDate[session.date].push(session);
    });

    const sessionLabels = [], sessionTimes = [];
    Object.keys(sessionsByDate).sort().forEach(date => {
        const daySessions = sessionsByDate[date];
        daySessions.forEach((session, idx) => {
            const name = session.session_name || `Session ${idx + 1}`;
            const label = `${date} ${name}`;
            session._label = label;
            sessionLabels.push(label);
            const baseTime = new Date(date + 'T00:00:00Z').getTime();
            const msPerSlot = daySessions.length > 1 ? (24 * 60 * 60 * 1000) / daySessions.length : 0;
            session._time = baseTime + idx * msPerSlot;
            sessionTimes.push(session._time);
        });
    });

    // Chart options
    const getOpt = opt => document.querySelector(`.chart-toggle[data-track="${track.replace(/\s/g, '-')}"][data-option="${opt}"]`)?.checked;
    const isEqualSpaced = getOpt('spacing');
    const invertY = getOpt('invert-y');
    const showPoints = getOpt('show-points');
    const showGrid = getOpt('show-grid');

    const datasets = allTrackRiders.map(riderName => {
        const data = trackSessions.map(session => ({
            x: isEqualSpaced ? session._label : session._time,
            y: session.results[riderName] || null
        }));
        // Find best (lowest) non-null time for this rider on this track
        const bestTime = data
            .map(d => d.y)
            .filter(y => typeof y === 'number')
            .reduce((min, y) => (min === null || y < min ? y : min), null);

        const color = getColor(riderName);
        const isSelected = selectedRiders.includes(riderName);
        const alpha = isSelected ? 1 : globalSettings.unselectedAlpha;
        const colorAlpha = color.replace('hsl(', 'hsla(').replace(')', `,${alpha})`);
        // Add best time to label if enabled
        const label = (globalSettings.showBestTimes && bestTime !== null)
            ? `${riderName} (${bestTime.toFixed(3)}s)`
            : riderName;

        return {
            label,
            data,
            borderColor: colorAlpha,
            backgroundColor: colorAlpha,
            pointBackgroundColor: colorAlpha,
            pointBorderColor: colorAlpha,
            fill: false,
            tension: 0.1,
            spanGaps: true,
            borderWidth: globalSettings.lineThickness,
            pointRadius: showPoints ? (isSelected ? 3 : 2) : 0,
            pointHoverRadius: showPoints ? (isSelected ? 5 : 2) : 0
        };
    }).filter(ds => ds.data.some(point => point.y !== null));

    const ctx = document.getElementById(canvasId).getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: isEqualSpaced ? sessionLabels : sessionTimes,
            datasets
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: isEqualSpaced ? 'category' : 'time',
                    time: isEqualSpaced ? undefined : { unit: 'day' },
                    title: { display: true, text: 'Sessions', color: '#212121', font: { size: globalSettings.fontSize } },
                    ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: globalSettings.fontSize } }
                },
                y: {
                    title: { display: true, text: 'Best Lap Time (seconds)', color: '#212121', font: { size: globalSettings.fontSize } },
                    beginAtZero: false,
                    reverse: invertY,
                    grid: { display: showGrid },
                    ticks: { font: { size: globalSettings.fontSize } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    offset: 10,
                    clip: false,
                    color: ctx => ctx.dataset.borderColor,
                    formatter: (value, ctx) => ctx.dataIndex === ctx.dataset.data.reduce((maxIdx, pt, idx) => pt.y !== null ? idx : maxIdx, -1) ? ctx.dataset.label : '',
                    font: { weight: 'bold', size: globalSettings.fontSize }
                }
            },
            interaction: { mode: 'index', intersect: false },
            elements: { point: { radius: showPoints ? 3 : 0 } },
            layout: { padding: { right: 200 } }
        },
        plugins: [ChartDataLabels]
    });
    charts.push(chart);
}

// --- Download Data ---
document.getElementById('download-data').addEventListener('click', () => {
    fetch('data.json')
        .then(r => r.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'data.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
});

// --- Initialization ---
async function initializeApp() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();
        allSessions = data.sessions;
        allSessions.forEach((session, idx) => session._index = idx);

        // Collect unique tracks and riders
        const trackSet = new Set(), riderSet = new Set();
        allSessions.forEach(session => {
            trackSet.add(session.track);
            Object.keys(session.results).forEach(rider => riderSet.add(rider));
        });
        tracks = Array.from(trackSet).sort();
        riders = Array.from(riderSet).sort();

        populateList('track-list', tracks, 'track', VISIBLE_ITEMS);
        populateList('rider-list', riders, 'rider', VISIBLE_ITEMS);

        setupToggle('toggle-tracks', 'track-list', 'Tracks', tracks.length > VISIBLE_ITEMS);
        setupToggle('toggle-riders', 'rider-list', 'Riders', riders.length > VISIBLE_ITEMS);

        // Select All buttons
        document.getElementById('select-all-tracks').onclick = () => {
            const allChecked = tracks.every(item => document.getElementById(`track-${item.replace(/\s/g, '-')}`).checked);
            selectAllInList('track-list', 'track', tracks, !allChecked);
        };
        document.getElementById('select-all-riders').onclick = () => {
            const allChecked = riders.every(item => document.getElementById(`rider-${item.replace(/\s/g, '-')}`).checked);
            selectAllInList('rider-list', 'rider', riders, !allChecked);
        };

        const savedTracks = JSON.parse(localStorage.getItem('selectedTracks')) || tracks;
        const savedRiders = JSON.parse(localStorage.getItem('selectedRiders')) || riders;
        applySavedSelections(tracks, 'track', savedTracks);
        applySavedSelections(riders, 'rider', savedRiders);

        setupGlobalSettings();

        updateCharts();
    } catch (err) {
        console.error("Failed to load data.json:", err);
        document.getElementById('charts-container').innerHTML = '<div style="color:#c62828;text-align:center;padding:40px;">Failed to load data.</div>';
    }
}

// --- Start ---
initializeApp();