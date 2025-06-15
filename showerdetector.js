// Constants
const FS = 48000; // Hz
const FRAME_MS = 200; // analysis window
const HPF_CUTOFF = 1000; // Hz
const INIT_DB_THRESH = -55.0; // dBFS
const INIT_FLAT_THRESH = 0.40; // ratio
const DEBOUNCE_MS = 1000;
const L_PER_MIN = 9; // litres/min
const MAX_HISTORY = 900; // points shown on chart
const EPS = 1e-10;
const PHASE_DURATION = 10; // seconds per phase

// Global state
let listening = false;
let audioCtx = null;
let analyser = null;
let kCut, mBins = 0;

// Rolling history arrays
let rmsHist = [];
let flatHist = [];
let timeHist = [];

let showerState = false;
let stableTimeMs = 0;
let usageSeconds = 0;
let dbThresh = INIT_DB_THRESH;
let flatThresh = INIT_FLAT_THRESH;
let lastUiRefresh = Date.now();

// Timer state
let timerInterval = null;
let phaseStartTime = null;
let currentPhase = 0; // 0: waiting, 1: shower noise, 2: non-shower sounds

// Chart instances
let rmsChart = null;
let flatChart = null;

function updateTimer() {
    const timer = document.getElementById('timer');
    const timerLabel = document.getElementById('timer-label');

    if (!listening || !phaseStartTime) {
        timer.textContent = '00:00';
        timerLabel.textContent = 'Waiting to start...';
        return;
    }

    const elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
    const remaining = Math.max(0, PHASE_DURATION - elapsed);

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    if (currentPhase === 1) {
        timerLabel.textContent = 'Phase 1: Play shower noise';
    } else if (currentPhase === 2) {
        timerLabel.textContent = 'Phase 2: Play non-shower sounds';
    }

    if (remaining === 0) {
        if (currentPhase === 1) {
            currentPhase = 2;
            phaseStartTime = Date.now();
        } else if (currentPhase === 2) {
            clearInterval(timerInterval);
            timerLabel.textContent = 'Calibration complete!';
            proposeNewThresholds();
        }
    }
}

function updateVariablesTable() {
    document.getElementById('db-thresh').textContent = dbThresh.toFixed(1);
    document.getElementById('flat-thresh').textContent = flatThresh.toFixed(2);
    document.getElementById('k-cut').textContent = kCut || '-';
    document.getElementById('m-bins').textContent = mBins || '-';
    document.getElementById('frame-ms').textContent = FRAME_MS;
}

async function startListening() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        audioCtx = new AudioContext({ sampleRate: FS });
        const source = audioCtx.createMediaStreamSource(stream);

        // Create high-pass filter
        const hpf = audioCtx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = HPF_CUTOFF;

        // Create analyzer
        const fftSize = Math.pow(2, Math.ceil(Math.log2(FRAME_MS * FS / 1000)));
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = fftSize;

        // Connect nodes
        source.connect(hpf);
        hpf.connect(analyser);

        // Calculate frequency bin parameters
        kCut = Math.ceil(HPF_CUTOFF * analyser.fftSize / audioCtx.sampleRate);
        mBins = analyser.frequencyBinCount - kCut;

        listening = true;
        currentPhase = 1;
        phaseStartTime = Date.now();
        timerInterval = setInterval(updateTimer, 100);

        document.getElementById('listenBtn').textContent = 'Stop Listening';
        updateVariablesTable();
        requestAnimationFrame(loop);
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Error accessing microphone. Please ensure you have granted permission.');
    }
}

function stopListening() {
    listening = false;
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    analyser = null;

    // Reset arrays
    rmsHist = [];
    flatHist = [];
    timeHist = [];

    // Reset state
    showerState = false;
    stableTimeMs = 0;
    usageSeconds = 0;
    currentPhase = 0;
    phaseStartTime = null;

    // Clear timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Update UI
    document.getElementById('listenBtn').textContent = 'Start Listening';
    document.getElementById('status').textContent = '🚿 OFF';
    document.getElementById('usage').textContent = '0 min (0 L)';
    updateTimer();

    // Clear charts
    if (rmsChart) rmsChart.destroy();
    if (flatChart) flatChart.destroy();
    rmsChart = null;
    flatChart = null;
}

function analyzeFrame(freqData) {
    let sumLin = 0;
    let sumLog = 0;

    for (let k = kCut; k < freqData.length; k++) {
        const pLin = Math.pow(10, freqData[k] / 10);
        sumLin += pLin;
        sumLog += Math.log(pLin + EPS);
    }

    const arithMean = sumLin / mBins;
    const geoMean = Math.exp(sumLog / mBins);
    const flatness = geoMean / (arithMean + EPS);
    const rmsLin = Math.sqrt(arithMean);
    const loudnessDb = 20 * Math.log10(rmsLin + EPS);

    const decisionBool = (loudnessDb > dbThresh) && (flatness > flatThresh);

    return {
        timestamp: Date.now(),
        metrics: {
            loudnessDb,
            flatness,
            decisionBool
        }
    };
}

function updateHistoryLists(timestamp, metrics) {
    rmsHist.push(metrics.loudnessDb);
    flatHist.push(metrics.flatness);
    timeHist.push(timestamp);

    // Keep only last MAX_HISTORY points
    if (rmsHist.length > MAX_HISTORY) {
        rmsHist.shift();
        flatHist.shift();
        timeHist.shift();
    }
}

function debouncedUpdate(decisionBool) {
    if (decisionBool === showerState) {
        stableTimeMs = 0;
    } else {
        stableTimeMs += FRAME_MS;
        if (stableTimeMs >= DEBOUNCE_MS) {
            showerState = decisionBool;
            stableTimeMs = 0;
        }
    }
}

function accumulateUsageIfOn() {
    if (showerState) {
        usageSeconds += FRAME_MS / 1000;
    }
}

function refreshChartsEvery1s() {
    const now = Date.now();
    if (now - lastUiRefresh >= 1000) {
        updateCharts();
        updateUI();
        lastUiRefresh = now;
    }
}

function updateCharts() {
    const timeLabels = timeHist.map(t => new Date(t).toLocaleTimeString());

    // Update or create RMS chart
    if (!rmsChart) {
        const rmsCtx = document.getElementById('rmsChart').getContext('2d');
        rmsChart = new Chart(rmsCtx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: 'RMS Level (dBFS)',
                    data: rmsHist,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        min: -80,
                        max: 0
                    }
                }
            }
        });
    } else {
        rmsChart.data.labels = timeLabels;
        rmsChart.data.datasets[0].data = rmsHist;
        rmsChart.update();
    }

    // Update or create Flatness chart
    if (!flatChart) {
        const flatCtx = document.getElementById('flatChart').getContext('2d');
        flatChart = new Chart(flatCtx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: 'Spectral Flatness',
                    data: flatHist,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        min: 0,
                        max: 1
                    }
                }
            }
        });
    } else {
        flatChart.data.labels = timeLabels;
        flatChart.data.datasets[0].data = flatHist;
        flatChart.update();
    }
}

function updateUI() {
    const status = document.getElementById('status');
    const usage = document.getElementById('usage');

    status.textContent = showerState ? '🚿 ON' : '🚿 OFF';
    status.style.color = showerState ? 'green' : 'red';

    const minutes = Math.floor(usageSeconds / 60);
    const liters = Math.round(minutes * L_PER_MIN);
    usage.textContent = `${minutes} min (${liters} L)`;
}

function proposeNewThresholds() {
    if (rmsHist.length < 150) return;

    const positiveIdx = rmsHist.map((rms, i) =>
        (rms > dbThresh && flatHist[i] > flatThresh) ? i : -1
    ).filter(i => i !== -1);

    if (positiveIdx.length < 20) return;

    const loudPos = positiveIdx.map(i => rmsHist[i]);
    const flatPos = positiveIdx.map(i => flatHist[i]);

    const candDb = percentile(loudPos, 10) - 1.0;
    const candFlat = percentile(flatPos, 10) - 0.02;

    showSuggestion(candDb, candFlat);
}

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p / 100;
    const base = Math.floor(pos);
    const rest = pos - base;

    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
}

function showSuggestion(candDb, candFlat) {
    const suggestion = document.getElementById('suggestion');
    suggestion.innerHTML = `Try > ${candDb.toFixed(1)} dBFS && > ${candFlat.toFixed(2)} flatness`;
    suggestion.style.display = 'block';
    suggestion.onclick = () => applyNewThresholds(candDb, candFlat);
}

function applyNewThresholds(candDb, candFlat) {
    dbThresh = candDb;
    flatThresh = candFlat;
    document.getElementById('suggestion').style.display = 'none';
    updateVariablesTable();
}

function loop() {
    if (!listening) return;

    const freqData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(freqData);

    const { timestamp, metrics } = analyzeFrame(freqData);
    updateHistoryLists(timestamp, metrics);
    debouncedUpdate(metrics.decisionBool);
    accumulateUsageIfOn();
    refreshChartsEvery1s();
    proposeNewThresholds();

    requestAnimationFrame(loop);
}

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    const listenBtn = document.getElementById('listenBtn');
    listenBtn.onclick = () => {
        if (listening) {
            stopListening();
        } else {
            startListening();
        }
    };
    updateVariablesTable();
});