// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ====================
let state = {
    currentMode: 'transfer',
    transferData: [],
    qrCodes: []
};

let activeScanner = null;
let isScanning = false;
let appLog = [];

// ==================== СИСТЕМА ЛОГГИРОВАНИЯ ====================
function addLog(message, type = 'info', data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        message,
        type,
        data,
        mode: state.currentMode,
        userAgent: navigator.userAgent
    };
    
    appLog.push(logEntry);
    console[type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log'](
        `[${new Date(timestamp).toLocaleTimeString('ru-RU')}] ${type.toUpperCase()}: ${message}`,
        data || ''
    );
    
    // Сохраняем логи в localStorage (макс 1000 записей)
    if (appLog.length > 1000) {
        appLog = appLog.slice(-500);
    }
    localStorage.setItem('kbt_app_log', JSON.stringify(appLog.slice(-200)));
}

function downloadAppLog() {
    const logData = {
        app: 'KBT Utilities',
        version: '1.2',
        exportDate: new Date().toISOString(),
        stats: {
            transfers: state.transferData.length,
            qrCodes: state.qrCodes.length,
            logEntries: appLog.length
        },
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        logs: appLog,
        state: state
    };
    
    const dataStr = JSON.stringify(logData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `kbt_log_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('Лог скачан', 'success');
    addLog('Лог приложения скачан', 'info');
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    addLog('Приложение загружается...', 'info');
    
    // Проверяем библиотеки
    checkLibraries();
    
    // Загружаем данные и логи
    loadAppLog();
    loadFromLocalStorage();
    
    // Инициализация компонентов
    initTheme();
    initModeSwitcher();
    initExportButtons();
    initImportExport();
    initClearButtons();
    
    // Проверяем и инициализируем сканеры
    if (typeof Html5Qrcode !== 'undefined') {
        initTransferScanner();
        initGenericScanner();
        addLog('Сканеры инициализированы', 'info');
    } else {
        addLog('Библиотека Html5Qrcode не найдена', 'error');
        showNotification('Библиотека сканера не загружена', 'error');
    }
    
    renderTransferHistory();
    renderQRCodesGallery();
    
    addLog('Приложение готово', 'info', {
        transfers: state.transferData.length,
        qrCodes: state.qrCodes.length,
        theme: localStorage.getItem('kbt_theme') || 'system'
    });
});

function checkLibraries() {
    const html5Status = document.getElementById('libHtml5Qrcode');
    const qrcodeStatus = document.getElementById('libQRCode');
    
    if (typeof Html5Qrcode !== 'undefined') {
        html5Status.textContent = 'Html5Qrcode: ✅ Загружена';
        html5Status.style.color = 'green';
    } else {
        html5Status.textContent = 'Html5Qrcode: ❌ Не загружена';
        html5Status.style.color = 'red';
    }
    
    if (typeof QRCode !== 'undefined') {
        qrcodeStatus.textContent = 'QRCode: ✅ Загружена';
        qrcodeStatus.style.color = 'green';
    } else {
        qrcodeStatus.textContent = 'QRCode: ❌ Не загружена';
        qrcodeStatus.style.color = 'red';
    }
}

function loadAppLog() {
    try {
        const savedLog = localStorage.getItem('kbt_app_log');
        if (savedLog) {
            appLog = JSON.parse(savedLog);
            addLog('Лог загружен из истории', 'info', { entries: appLog.length });
        }
    } catch (error) {
        addLog('Ошибка загрузки лога', 'error', { error: error.message });
    }
}

// ==================== ТЕМНАЯ/СВЕТЛАЯ ТЕМА ====================
function initTheme() {
    const toggleBtn = document.getElementById('themeToggle');
    
    const savedTheme = localStorage.getItem('kbt_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', initialTheme);
    updateThemeButton(initialTheme, toggleBtn);
    
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('kbt_theme', newTheme);
        updateThemeButton(newTheme, toggleBtn);
        
        addLog('Тема изменена', 'info', { from: currentTheme, to: newTheme });
        
        // Перерисовываем QR коды с новой темой
        renderQRCodesGallery();
    });
}

function updateThemeButton(theme, button) {
    button.textContent = theme === 'dark' ? '☀️' : '🌙';
    button.title = theme === 'dark' ? 'Светлая тема' : 'Темная тема';
}

// ==================== ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ ====================
function initModeSwitcher() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const mode = this.dataset.mode;
            
            // Останавливаем сканирование при переключении
            if (isScanning) {
                stopActiveScanner();
            }
            
            // Обновляем кнопки
            modeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Переключаем панели
            document.querySelectorAll('.scanner-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById(`${mode}-scanner`).classList.add('active');
            
            state.currentMode = mode;
            
            addLog('Режим изменен', 'info', { mode: mode });
            
            console.log(`Режим: ${mode === 'transfer' ? 'Сканер передач' : 'Сканер шк'}`);
        });
    });
}

// ==================== СКАНЕР ПЕРЕДАЧ (ИСПРАВЛЕННЫЙ) ====================
function initTransferScanner() {
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    
    if (!startBtn || !stopBtn) {
        addLog('Не найдены элементы сканера передач', 'error');
        return;
    }
    
    startBtn.addEventListener('click', startTransferScanning);
    stopBtn.addEventListener('click', stopTransferScanning);
}

function startTransferScanning() {
    if (isScanning) {
        addLog('Сканер уже запущен', 'warning');
        return;
    }
    
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    if (!readerDiv) {
        addLog('Не найден контейнер сканера передач', 'error');
        return;
    }
    
    // Очищаем контейнер
    readerDiv.innerHTML = '';
    
    try {
        addLog('Запуск сканера передач...', 'info');
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false
        };
        
        // Создаем экземпляр сканера
        activeScanner = new Html5Qrcode("transfer-reader");
        
        // Запускаем сканирование
        activeScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                onTransferScanSuccess(decodedText);
            },
            (errorMessage) => {
                onTransferScanError(errorMessage);
            }
        ).then(() => {
            // Успешный запуск
            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            readerDiv.style.border = "3px solid #4CAF50";
            
            addLog('Сканер передач успешно запущен', 'success');
            showNotification('Сканер запущен', 'success');
            
        }).catch(err => {
            console.error('Ошибка запуска сканера передач:', err);
            addLog('Ошибка запуска сканера передач', 'error', { error: err.message || err });
            
            let errorMsg = 'Не удалось запустить камеру';
            if (err.message && err.message.includes('Permission')) {
                errorMsg = 'Нет разрешения на использование камеры';
            } else if (err.message && err.message.includes('NotFound')) {
                errorMsg = 'Камера не найдена';
            }
            
            showNotification(errorMsg, 'error');
            activeScanner = null;
            
            // Восстанавливаем плейсхолдер
            readerDiv.innerHTML = `
                <div class="scanner-placeholder">
                    <div class="scanner-icon">📷</div>
                    <p>${errorMsg}</p>
                </div>
            `;
        });
        
    } catch (error) {
        console.error('Ошибка создания сканера передач:', error);
        addLog('Ошибка создания сканера передач', 'error', { error: error.message });
        showNotification('Ошибка создания сканера', 'error');
    }
}

function stopTransferScanning() {
    if (!activeScanner || !isScanning) {
        addLog('Сканер не запущен или уже остановлен', 'warning');
        return;
    }
    
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    addLog('Остановка сканера передач...', 'info');
    
    activeScanner.stop().then(() => {
        isScanning = false;
        activeScanner = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) {
            readerDiv.style.border = "";
            readerDiv.innerHTML = `
                <div class="scanner-placeholder">
                    <div class="scanner-icon">📷</div>
                    <p>Нажмите "Начать сканирование"</p>
                </div>
            `;
        }
        
        addLog('Сканер передач остановлен', 'info');
        showNotification('Сканер остановлен', 'info');
        
    }).catch(err => {
        console.error('Ошибка остановки сканера:', err);
        addLog('Ошибка остановки сканера передач', 'error', { error: err.message });
        isScanning = false;
        activeScanner = null;
    });
}

function onTransferScanSuccess(decodedText) {
    addLog('QR-код отсканирован (передачи)', 'info', { text: decodedText });
    
    const pattern = /\$1:1:(\d{10}):/;
    const match = decodedText.match(pattern);
    
    if (!match) {
        addLog('Неверный формат QR-кода', 'warning', { received: decodedText });
        showNotification('Неверный формат. Ожидается: $1:1:XXXXXXXXXX:', 'warning');
        playErrorSound();
        return;
    }
    
    const tenDigitNumber = match[1];
    const timestamp = new Date().toISOString();
    const dateDisplay = new Date().toLocaleString('ru-RU');
    
    // Проверяем дубликаты
    const isDuplicate = state.transferData.some(item => item.number === tenDigitNumber);
    if (isDuplicate) {
        addLog('Дубликат номера передачи', 'warning', { number: tenDigitNumber });
        showNotification(`Номер ${tenDigitNumber} уже отсканирован`, 'warning');
        return;
    }
    
    // Добавляем объект с датой
    const transferItem = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        number: tenDigitNumber,
        timestamp: timestamp,
        dateDisplay: dateDisplay,
        date: new Date()
    };
    
    state.transferData.push(transferItem);
    saveToLocalStorage();
    
    // Сортируем по дате (новые сверху)
    sortTransferData();
    renderTransferHistory();
    
    addLog('Номер передачи сохранен', 'success', { number: tenDigitNumber });
    showNotification(`Добавлено: ${tenDigitNumber}`, 'success');
    playSuccessSound();
    
    // Мигание для обратной связи
    const readerDiv = document.getElementById('transfer-reader');
    if (readerDiv) {
        readerDiv.style.border = "3px solid #00FF00";
        setTimeout(() => {
            if (isScanning) readerDiv.style.border = "3px solid #4CAF50";
        }, 300);
    }
}

function onTransferScanError(errorMessage) {
    // Игнорируем обычные ошибки сканирования
    if (!errorMessage.includes('NotFoundException') && 
        !errorMessage.includes('No QR code')) {
        addLog('Ошибка сканирования (передачи)', 'warning', { error: errorMessage });
    }
}

// ==================== СКАНЕР ШК (ИСПРАВЛЕННЫЙ) ====================
function initGenericScanner() {
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    
    if (!startBtn || !stopBtn) {
        addLog('Не найдены элементы сканера шк', 'error');
        return;
    }
    
    startBtn.addEventListener('click', startGenericScanning);
    stopBtn.addEventListener('click', stopGenericScanning);
}

function startGenericScanning() {
    if (isScanning) {
        addLog('Сканер уже запущен', 'warning');
        return;
    }
    
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    if (!readerDiv) {
        addLog('Не найден контейнер сканера шк', 'error');
        return;
    }
    
    // Очищаем контейнер
    readerDiv.innerHTML = '';
    
    try {
        addLog('Запуск сканера шк...', 'info');
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false
        };
        
        // Создаем экземпляр сканера
        activeScanner = new Html5Qrcode("generic-reader");
        
        // Запускаем сканирование
        activeScanner.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
                onGenericScanSuccess(decodedText);
            },
            (errorMessage) => {
                onGenericScanError(errorMessage);
            }
        ).then(() => {
            // Успешный запуск
            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            readerDiv.style.border = "3px solid #2196F3";
            
            addLog('Сканер шк успешно запущен', 'success');
            showNotification('Сканер запущен', 'success');
            
        }).catch(err => {
            console.error('Ошибка запуска сканера шк:', err);
            addLog('Ошибка запуска сканера шк', 'error', { error: err.message || err });
            
            let errorMsg = 'Не удалось запустить камеру';
            if (err.message && err.message.includes('Permission')) {
                errorMsg = 'Нет разрешения на использование камеры';
            } else if (err.message && err.message.includes('NotFound')) {
                errorMsg = 'Камера не найдена';
            }
            
            showNotification(errorMsg, 'error');
            activeScanner = null;
            
            // Восстанавливаем плейсхолдер
            readerDiv.innerHTML = `
                <div class="scanner-placeholder">
                    <div class="scanner-icon">📷</div>
                    <p>${errorMsg}</p>
                </div>
            `;
        });
        
    } catch (error) {
        console.error('Ошибка создания сканера шк:', error);
        addLog('Ошибка создания сканера шк', 'error', { error: error.message });
        showNotification('Ошибка создания сканера', 'error');
    }
}

function stopGenericScanning() {
    if (!activeScanner || !isScanning) {
        addLog('Сканер не запущен или уже остановлен', 'warning');
        return;
    }
    
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    addLog('Остановка сканера шк...', 'info');
    
    activeScanner.stop().then(() => {
        isScanning = false;
        activeScanner = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) {
            readerDiv.style.border = "";
            readerDiv.innerHTML = `
                <div class="scanner-placeholder">
                    <div class="scanner-icon">📷</div>
                    <p>Нажмите "Начать сканирование"</p>
                </div>
            `;
        }
        
        addLog('Сканер шк остановлен', 'info');
        showNotification('Сканер остановлен', 'info');
        
    }).catch(err => {
        console.error('Ошибка остановки сканера:', err);
        addLog('Ошибка остановки сканера шк', 'error', { error: err.message });
        isScanning = false;
        activeScanner = null;
    });
}

function onGenericScanSuccess(decodedText) {
    addLog('QR-код отсканирован (шк)', 'info', { text: decodedText });
    
    // Проверяем дубликаты
    const existingIndex = state.qrCodes.findIndex(qr => qr.text === decodedText);
    if (existingIndex !== -1) {
        addLog('Дубликат QR-кода', 'warning', { text: decodedText });
        showNotification('Этот QR-код уже отсканирован', 'warning');
        playErrorSound();
        return;
    }
    
    const qrObject = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        text: decodedText,
        timestamp: new Date().toISOString(),
        dateDisplay: new Date().toLocaleString('ru-RU')
    };
    
    state.qrCodes.unshift(qrObject);
    saveToLocalStorage();
    
    // Генерируем и отображаем QR-код
    generateRealQRCode(qrObject);
    
    addLog('QR-код сохранен', 'success', { id: qrObject.id });
    showNotification('QR-код сохранен', 'success');
    playSuccessSound();
    
    // Мигание для обратной связи
    const readerDiv = document.getElementById('generic-reader');
    if (readerDiv) {
        readerDiv.style.border = "3px solid #00FF00";
        setTimeout(() => {
            if (isScanning) readerDiv.style.border = "3px solid #2196F3";
        }, 300);
    }
}

function onGenericScanError(errorMessage) {
    // Игнорируем обычные ошибки сканирования
    if (!errorMessage.includes('NotFoundException') && 
        !errorMessage.includes('No QR code')) {
        addLog('Ошибка сканирования (шк)', 'warning', { error: errorMessage });
    }
}

// ==================== ГЕНЕРАЦИЯ QR-КОДОВ ====================
function generateRealQRCode(qrObject) {
    const gallery = document.getElementById('qrcode-gallery');
    if (!gallery) return;
    
    // Создаем карточку
    const card = document.createElement('div');
    card.className = 'qr-card';
    card.dataset.id = qrObject.id;
    
    // Создаем canvas для QR-кода
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    canvas.className = 'qr-canvas';
    
    // Проверяем доступность библиотеки QRCode
    if (typeof QRCode === 'undefined') {
        createFallbackQR(canvas, qrObject.text);
        addLog('Библиотека QRCode недоступна, используем fallback', 'warning');
    } else {
        try {
            // Генерируем настоящий QR-код
            QRCode.toCanvas(canvas, qrObject.text, {
                width: 120,
                margin: 1,
                color: {
                    dark: document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000',
                    light: '#00000000'
                }
            }, function(error) {
                if (error) {
                    console.error('Ошибка генерации QR:', error);
                    addLog('Ошибка генерации QR-кода', 'error', { error: error.message });
                    createFallbackQR(canvas, qrObject.text);
                }
            });
        } catch (error) {
            console.error('Ошибка генерации QR:', error);
            addLog('Ошибка генерации QR-кода', 'error', { error: error.message });
            createFallbackQR(canvas, qrObject.text);
        }
    }
    
    // Создаем элементы карточки
    const img = document.createElement('img');
    img.src = canvas.toDataURL();
    img.alt = 'QR Code';
    img.className = 'qr-image';
    
    const textContainer = document.createElement('div');
    textContainer.className = 'qr-text';
    
    const textPreview = document.createElement('p');
    textPreview.textContent = truncateText(qrObject.text, 20);
    textPreview.title = qrObject.text;
    
    const dateInfo = document.createElement('small');
    dateInfo.textContent = qrObject.dateDisplay.split(',')[0];
    dateInfo.className = 'qr-date';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-qr-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Удалить QR-код';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteQRCode(qrObject.id);
    };
    
    // Клик по карточке для просмотра деталей
    card.addEventListener('click', () => {
        showQRDetails(qrObject);
    });
    
    // Собираем карточку
    textContainer.appendChild(textPreview);
    textContainer.appendChild(dateInfo);
    
    card.appendChild(deleteBtn);
    card.appendChild(img);
    card.appendChild(textContainer);
    
    // Добавляем с анимацией
    card.style.opacity = '0';
    card.style.transform = 'scale(0.8)';
    gallery.prepend(card);
    
    setTimeout(() => {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
    }, 10);
}

function createFallbackQR(canvas, text) {
    const ctx = canvas.getContext('2d');
    
    // Фон
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d2d2d' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Простой QR-паттерн
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
    
    // Угловые маркеры
    ctx.fillRect(10, 10, 25, 25);
    ctx.fillRect(canvas.width - 35, 10, 25, 25);
    ctx.fillRect(10, canvas.height - 35, 25, 25);
    
    // Текст
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('QR', canvas.width/2, canvas.height/2);
    ctx.font = '8px Arial';
    ctx.fillText('код', canvas.width/2, canvas.height/2 + 10);
}

// ==================== ОСТАВШИЕСЯ ФУНКЦИИ (сохранены из предыдущего кода) ====================
// [Все остальные функции остаются без изменений: initImportExport, exportAllData, handleImportFile,
//  sortTransferData, renderTransferHistory, renderQRCodesGallery, deleteTransfer, deleteQRCode,
//  initExportButtons, exportToCSV, initClearButtons, clearTransferData, clearQRCodeData,
//  loadFromLocalStorage, saveToLocalStorage, stopActiveScanner, showNotification,
//  playSuccessSound, playErrorSound, initStyles, и обработчики ошибок]

// Из-за ограничения длины, показываю только измененные функции.
// Полный код можно получить, объединив этот исправленный код с предыдущими функциями.

// ==================== ФУНКЦИИ ДЛЯ ОТЛАДКИ ====================
function testScanner() {
    addLog('Тест сканера запущен', 'info');
    
    // Создаем тестовый QR-код
    const testQRCode = `$1:1:${Math.floor(1000000000 + Math.random() * 9000000000)}:${Math.floor(100000 + Math.random() * 900000)}`;
    
    // Имитируем сканирование
    if (state.currentMode === 'transfer') {
        onTransferScanSuccess(testQRCode);
    } else {
        onGenericScanSuccess(testQRCode);
    }
    
    showNotification('Тестовое сканирование выполнено', 'success');
}

function clearAllData() {
    if (confirm('ВНИМАНИЕ: Это удалит ВСЕ данные (передачи, QR-коды, настройки). Продолжить?')) {
        localStorage.clear();
        state.transferData = [];
        state.qrCodes = [];
        appLog = [];
        
        renderTransferHistory();
        renderQRCodesGallery();
        
        addLog('Все данные очищены', 'warning');
        showNotification('Все данные очищены', 'warning');
        
        // Перезагружаем страницу
        setTimeout(() => location.reload(), 1000);
    }
}

// Добавляем обработчики для кнопок отладки
document.addEventListener('DOMContentLoaded', function() {
    // Кнопка скачивания лога уже добавлена в HTML
    // Добавляем обработчики для других кнопок отладки
    const testBtn = document.querySelector('.debug-controls button[onclick="testScanner()"]');
    const clearBtn = document.querySelector('.debug-controls button[onclick="clearAllData()"]');
    
    if (testBtn) {
        testBtn.addEventListener('click', testScanner);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllData);
    }
});

// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ПРИ ОШИБКАХ ====================
function updateScannerUI(mode, status, message = '') {
    const readerDiv = document.getElementById(`${mode}-reader`);
    if (!readerDiv) return;
    
    if (status === 'error') {
        readerDiv.innerHTML = `
            <div class="scanner-placeholder error">
                <div class="scanner-icon">❌</div>
                <p>${message || 'Ошибка сканера'}</p>
                <button onclick="retryScanner('${mode}')" style="margin-top: 10px;">Повторить</button>
            </div>
        `;
    } else if (status === 'loading') {
        readerDiv.innerHTML = `
            <div class="scanner-placeholder loading">
                <div class="scanner-icon">⏳</div>
                <p>Загрузка сканера...</p>
            </div>
        `;
    }
}

function retryScanner(mode) {
    addLog('Повторная попытка запуска сканера', 'info', { mode: mode });
    
    if (mode === 'transfer') {
        startTransferScanning();
    } else {
        startGenericScanning();
    }
}

// ==================== ПРОВЕРКА РАЗРЕШЕНИЙ КАМЕРЫ ====================
async function checkCameraPermissions() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        addLog('Разрешение камеры получено', 'success');
        return true;
    } catch (error) {
        addLog('Ошибка доступа к камере', 'error', { error: error.message });
        
        let errorMsg = 'Доступ к камере запрещен';
        if (error.name === 'NotFoundError') {
            errorMsg = 'Камера не найдена';
        } else if (error.name === 'NotAllowedError') {
            errorMsg = 'Доступ к камере запрещен. Разрешите доступ в настройках браузера';
        }
        
        showNotification(errorMsg, 'error');
        return false;
    }
}

// Проверяем разрешения при загрузке
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        checkCameraPermissions();
    }, 1000);
});

console.log('KBT Utilities v1.2 загружен');
