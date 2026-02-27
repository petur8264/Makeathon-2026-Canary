(function() {
    // === CONFIGURATION ===
    const API_URL = 'http://water.local:8080/api/today';
    const API_HISTORY = 'http://water.local:8080/api/history';
    
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
    const barChart = document.getElementById('historyChart');
    const chartRecords = document.getElementById('chartRecords');

    // === DARK MODE TOGGLE ===
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            if (themeIcon) themeIcon.textContent = '☀️';
        } else {
            if (themeIcon) themeIcon.textContent = '🌙';
        }
    }

    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            if (themeIcon) themeIcon.textContent = '☀️';
        } else {
            localStorage.setItem('theme', 'light');
            if (themeIcon) themeIcon.textContent = '🌙';
        }
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    initTheme();

    // === UPDATE TIMESTAMP ===
    function updateTimestamp() {
        if (!timestampEl) return;
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

    // === FETCH TODAY'S DATA ===
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
            
            console.log('✅ Today data received:', data);
            
            if (typeof data.total_activations === 'number' && typeof data.total_liters === 'number') {
                return { success: true, data };
            }
            
            throw new Error('Invalid data format');

        } catch (error) {
            console.warn('❌ Fetch error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // === FETCH HISTORY DATA ===
    async function fetchHistoryData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(API_HISTORY, {
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
            
            console.log('✅ History data received:', data);
            
            if (Array.isArray(data) && data.length > 0) {
                updateChart(data);
                return { success: true, data };
            }
            
            throw new Error('Invalid history data format');

        } catch (error) {
            console.warn('❌ History fetch error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // === UPDATE CHART WITH REAL DATA ===
    function updateChart(data) {
        if (!barChart) {
            console.warn('⚠️ Chart element not found');
            return;
        }
        
        if (!data || data.length === 0) {
            console.warn('⚠️ No history data to display');
            return;
        }

        // Agrupar por fecha (sumar múltiples entradas del mismo día)
        const groupedData = {};
        data.forEach(item => {
            if (!groupedData[item.usage_date]) {
                groupedData[item.usage_date] = {
                    usage_date: item.usage_date,
                    total_activations: item.total_activations,
                    total_liters: item.total_liters
                };
            } else {
                groupedData[item.usage_date].total_activations += item.total_activations;
                groupedData[item.usage_date].total_liters += item.total_liters;
            }
        });

        // Convertir a array y ordenar por fecha (más reciente primero)
        let sortedData = Object.values(groupedData).sort((a, b) => 
            new Date(b.usage_date) - new Date(a.usage_date)
        );

        // Tomar los últimos 7 registros (los 7 más recientes)
        const last7Records = sortedData.slice(0, 7);
        
        if (last7Records.length === 0) return;

        // Actualizar el subtítulo
        if (chartRecords) {
            chartRecords.textContent = `last ${last7Records.length} records`;
        }

        // Encontrar el valor máximo para escalar las barras
        const maxActivations = Math.max(...last7Records.map(d => d.total_activations));
        
        // Limpiar el chart
        barChart.innerHTML = '';

        // Crear nuevas barras
        last7Records.forEach((item, index) => {
            // Calcular altura de la barra (mínimo 15% para visibilidad)
            const height = maxActivations > 0 ? (item.total_activations / maxActivations) * 100 : 20;
            
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = `${Math.max(18, height)}%`;
            
            // Tooltip con información detallada
            const tooltip = `📅 ${item.usage_date}\n⚡ ${item.total_activations} activations\n💧 ${item.total_liters.toFixed(1)}L`;
            bar.setAttribute('data-tooltip', tooltip);
            
            // Número de registro (1-7)
            const span = document.createElement('span');
            span.textContent = `#${index + 1}`;
            bar.appendChild(span);
            
            barChart.appendChild(bar);
        });

        console.log('✅ Historical chart updated with', last7Records.length, 'records');
    }

    // === UPDATE INTERFACE ===
    function updateUI(result) {
        updateTimestamp();

        if (result.success) {
            const data = result.data;
            
            lastValidData.activations = data.total_activations;
            lastValidData.liters = data.total_liters;

            if (activationsEl) activationsEl.textContent = data.total_activations.toLocaleString();
            if (litersEl) litersEl.textContent = data.total_liters.toFixed(1);

            consecutiveErrors = 0;
            
            if (connectionLed) connectionLed.className = 'led';
            if (connectionStatus) connectionStatus.textContent = 'connected';
            
            syncCount++;
            if (syncCounterEl) syncCounterEl.textContent = `sync ${syncCount}`;
            if (deviceIndicator) deviceIndicator.textContent = 'handwash · online';
            
        } else {
            consecutiveErrors++;

            if (activationsEl) activationsEl.textContent = lastValidData.activations.toLocaleString();
            if (litersEl) litersEl.textContent = lastValidData.liters.toFixed(1);

            if (consecutiveErrors >= 3) {
                if (connectionLed) connectionLed.className = 'led error';
                if (connectionStatus) connectionStatus.textContent = 'connection error';
                if (deviceIndicator) deviceIndicator.textContent = 'sensor · offline';
            } else {
                if (connectionLed) connectionLed.className = 'led warning';
                if (connectionStatus) connectionStatus.textContent = 'retrying...';
                if (deviceIndicator) deviceIndicator.textContent = 'handwash · reconnecting';
            }
        }
    }

    // === MAIN UPDATE FUNCTION ===
    async function refresh() {
        const result = await fetchWaterData();
        updateUI(result);
        await fetchHistoryData();
    }

    // === INITIALIZATION ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            refresh();
            setInterval(refresh, 30000);
        });
    } else {
        refresh();
        setInterval(refresh, 30000);
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refresh();
    });

})();
