(function() {
    // === CONFIGURATION ===
    const API_URL = 'http://water.local:8080/api/today';
    
    let syncCount = 0;
    let consecutiveErrors = 0;
    let lastValidData = { activations: 0, liters: 0 };

    // === DOM ELEMENTS ===
    const activationsEl = document.getElementById('activationsValue');
    const litersEl = document.getElementById('litersValue');
    const connectionLed = document.getElementById('connectionLed');
    const connectionStatus = document.getElementById('connectionStatus');
    const timestampEl = document.getElementById('timestamp');
    const syncCounterEl = document.getElementById('syncCounter');
    const deviceIndicator = document.getElementById('deviceIndicator');
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.querySelector('.theme-icon');

    // === DARK MODE TOGGLE ===
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeIcon.textContent = '☀️';
        } else {
            themeIcon.textContent = '🌙';
        }
    }

    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            themeIcon.textContent = '☀️';
        } else {
            localStorage.setItem('theme', 'light');
            themeIcon.textContent = '🌙';
        }
    }

    themeToggle.addEventListener('click', toggleTheme);
    initTheme();

    // === UPDATE TIMESTAMP ===
    function updateTimestamp() {
        const now = new Date();
        timestampEl.textContent = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false 
        });
    }
    setInterval(updateTimestamp, 1000);
    updateTimestamp();

    // === FETCH DATA FROM API ===
    async function fetchWaterData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(API_URL, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            console.log('✅ Data received:', data);
            
            if (typeof data.total_activations === 'number' && typeof data.total_liters === 'number') {
                return { success: true, data };
            }
            
            throw new Error('Invalid data format');

        } catch (error) {
            console.warn('❌ Fetch error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // === UPDATE INTERFACE ===
    function updateUI(result) {
        updateTimestamp();

        if (result.success) {
            const data = result.data;
            
            lastValidData.activations = data.total_activations;
            lastValidData.liters = data.total_liters;

            activationsEl.textContent = data.total_activations.toLocaleString();
            litersEl.textContent = data.total_liters.toFixed(1);

            consecutiveErrors = 0;
            
            connectionLed.className = 'led';
            connectionStatus.textContent = 'connected';
            
            syncCount++;
            syncCounterEl.textContent = `sync ${syncCount}`;
            deviceIndicator.textContent = 'handwash · online';
            
        } else {
            consecutiveErrors++;

            activationsEl.textContent = lastValidData.activations.toLocaleString();
            litersEl.textContent = lastValidData.liters.toFixed(1);

            if (consecutiveErrors >= 3) {
                connectionLed.className = 'led error';
                connectionStatus.textContent = 'connection error';
                deviceIndicator.textContent = 'sensor · offline';
            } else {
                connectionLed.className = 'led warning';
                connectionStatus.textContent = 'retrying...';
                deviceIndicator.textContent = 'handwash · reconnecting';
            }
        }
    }

    // === MAIN UPDATE FUNCTION ===
    async function refresh() {
        const result = await fetchWaterData();
        updateUI(result);
    }

    // === INITIALIZATION ===
    refresh();
    setInterval(refresh, 5000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
    });

})();