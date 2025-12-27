// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ====================
let state = {
    currentMode: 'transfer',
    transferData: [],
    qrCodes: []
};

let activeScanner = null;
let isScanning = false;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('KBT Utilities загружается...');
    
    loadFromLocalStorage();
    initTheme();
    initModeSwitcher();
    initExportButton();
    initClearButtons();
    
    // Загружаем библиотеку для сканирования динамически
    loadScannerLibrary().then(() => {
        console.log('Библиотека сканера загружена');
        initTransferScanner();
        initGenericScanner();
    }).catch(err => {
        console.error('Ошибка загрузки библиотеки:', err);
        alert('Не удалось загрузить сканер QR-кодов. Проверьте подключение к интернету.');
    });
    
    renderTransferHistory();
    renderQRCodesGallery();
});

// Динамическая загрузка библиотеки сканирования
function loadScannerLibrary() {
    return new Promise((resolve, reject) => {
        if (typeof Html5Qrcode !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
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
            
            // Сбрасываем состояние кнопок
            resetScannerButtons(mode);
            
            console.log(`Режим: ${mode === 'transfer' ? 'Сканер передач' : 'Сканер шк'}`);
        });
    });
}

function resetScannerButtons(mode) {
    const transferStart = document.getElementById('startTransferScan');
    const transferStop = document.getElementById('stopTransferScan');
    const genericStart = document.getElementById('startGenericScan');
    const genericStop = document.getElementById('stopGenericScan');
    
    if (mode === 'transfer') {
        if (transferStart) transferStart.disabled = false;
        if (transferStop) transferStop.disabled = true;
        if (genericStart) genericStart.disabled = true;
        if (genericStop) genericStop.disabled = true;
    } else {
        if (transferStart) transferStart.disabled = true;
        if (transferStop) transferStop.disabled = true;
        if (genericStart) genericStart.disabled = false;
        if (genericStop) genericStop.disabled = true;
    }
}

// ==================== СКАНЕР ПЕРЕДАЧ ====================
function initTransferScanner() {
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    
    if (!startBtn || !stopBtn) return;
    
    startBtn.addEventListener('click', startTransferScanning);
    stopBtn.addEventListener('click', stopTransferScanning);
}

function startTransferScanning() {
    if (isScanning) return;
    
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    if (!readerDiv) return;
    
    // Очищаем предыдущий сканер
    readerDiv.innerHTML = '';
    
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false
    };
    
    try {
        activeScanner = new Html5Qrcode("transfer-reader");
        
        activeScanner.start(
            { facingMode: "environment" },
            config,
            onTransferScanSuccess,
            onTransferScanError
        ).then(() => {
            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            readerDiv.style.border = "3px solid #4CAF50";
            console.log('Сканер передач запущен');
        }).catch(err => {
            console.error('Ошибка запуска сканера передач:', err);
            showNotification('Не удалось запустить камеру', 'error');
            activeScanner = null;
        });
        
    } catch (error) {
        console.error('Ошибка создания сканера:', error);
        showNotification('Ошибка инициализации сканера', 'error');
    }
}

function stopTransferScanning() {
    if (!activeScanner || !isScanning) return;
    
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    activeScanner.stop().then(() => {
        isScanning = false;
        activeScanner = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) readerDiv.style.border = "";
        
        console.log('Сканер передач остановлен');
    }).catch(err => {
        console.error('Ошибка остановки сканера:', err);
        isScanning = false;
        activeScanner = null;
    });
}

function onTransferScanSuccess(decodedText) {
    console.log('Отсканировано:', decodedText);
    
    const pattern = /\$1:1:(\d{10}):/;
    const match = decodedText.match(pattern);
    
    if (!match) {
        showNotification('Неверный формат QR-кода', 'warning');
        playErrorSound();
        return;
    }
    
    const tenDigitNumber = match[1];
    
    if (state.transferData.includes(tenDigitNumber)) {
        showNotification(`Номер ${tenDigitNumber} уже отсканирован`, 'warning');
        return;
    }
    
    state.transferData.push(tenDigitNumber);
    saveToLocalStorage();
    renderTransferHistory();
    
    showNotification(`Добавлено: ${tenDigitNumber}`, 'success');
    playSuccessSound();
    
    // Мигание для визуальной обратной связи
    const readerDiv = document.getElementById('transfer-reader');
    if (readerDiv) {
        readerDiv.style.border = "3px solid #00FF00";
        setTimeout(() => {
            if (isScanning) readerDiv.style.border = "3px solid #4CAF50";
        }, 300);
    }
}

function onTransferScanError(error) {
    // Игнорируем ошибки поиска кода (они нормальны)
    if (!error.includes('NotFoundException')) {
        console.log('Ошибка сканирования:', error);
    }
}

// ==================== СКАНЕР ШК ====================
function initGenericScanner() {
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    
    if (!startBtn || !stopBtn) return;
    
    startBtn.addEventListener('click', startGenericScanning);
    stopBtn.addEventListener('click', stopGenericScanning);
}

function startGenericScanning() {
    if (isScanning) return;
    
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    if (!readerDiv) return;
    
    // Очищаем предыдущий сканер
    readerDiv.innerHTML = '';
    
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false
    };
    
    try {
        activeScanner = new Html5Qrcode("generic-reader");
        
        activeScanner.start(
            { facingMode: "environment" },
            config,
            onGenericScanSuccess,
            onGenericScanError
        ).then(() => {
            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            readerDiv.style.border = "3px solid #2196F3";
            console.log('Сканер шк запущен');
        }).catch(err => {
            console.error('Ошибка запуска сканера шк:', err);
            showNotification('Не удалось запустить камеру', 'error');
            activeScanner = null;
        });
        
    } catch (error) {
        console.error('Ошибка создания сканера:', error);
        showNotification('Ошибка инициализации сканера', 'error');
    }
}

function stopGenericScanning() {
    if (!activeScanner || !isScanning) return;
    
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    activeScanner.stop().then(() => {
        isScanning = false;
        activeScanner = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) readerDiv.style.border = "";
        
        console.log('Сканер шк остановлен');
    }).catch(err => {
        console.error('Ошибка остановки сканера:', err);
        isScanning = false;
        activeScanner = null;
    });
}

function onGenericScanSuccess(decodedText) {
    console.log('Отсканировано (шк):', decodedText);
    
    // Проверяем, не сканировали ли уже этот код
    const existingIndex = state.qrCodes.findIndex(qr => qr.text === decodedText);
    if (existingIndex !== -1) {
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
    
    // Генерируем изображение QR-кода
    generateQRCodeImage(qrObject);
    
    showNotification('QR-код сохранен', 'success');
    playSuccessSound();
    
    // Мигание для визуальной обратной связи
    const readerDiv = document.getElementById('generic-reader');
    if (readerDiv) {
        readerDiv.style.border = "3px solid #00FF00";
        setTimeout(() => {
            if (isScanning) readerDiv.style.border = "3px solid #2196F3";
        }, 300);
    }
}

function onGenericScanError(error) {
    if (!error.includes('NotFoundException')) {
        console.log('Ошибка сканирования (шк):', error);
    }
}

// ==================== ГЕНЕРАЦИЯ QR-КОДОВ ====================
function generateQRCodeImage(qrObject) {
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
    
    // Простая генерация QR-кода без библиотеки (базовый вариант)
    // Для продакшена лучше использовать библиотеку, но для простоты оставим так
    const ctx = canvas.getContext('2d');
    
    // Заполняем белым фоном
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d2d2d' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем простой узор (заглушка вместо настоящего QR)
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
    
    // Три квадрата как в QR-коде
    ctx.fillRect(10, 10, 30, 30);
    ctx.fillRect(canvas.width - 40, 10, 30, 30);
    ctx.fillRect(10, canvas.height - 40, 30, 30);
    
    // Добавляем текст "QR"
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('QR', canvas.width/2, canvas.height/2 + 5);
    
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
    dateInfo.textContent = qrObject.dateDisplay.split(',')[0]; // Только дата
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
    
    // Добавляем в начало галереи с анимацией
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    gallery.prepend(card);
    
    // Анимация появления
    setTimeout(() => {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    }, 10);
}

function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function showQRDetails(qrObject) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        animation: fadeIn 0.3s;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
        background: var(--bg-secondary);
        padding: 2rem;
        border-radius: 12px;
        max-width: 90%;
        max-height: 90%;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        animation: slideUp 0.3s;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Детали QR-кода';
    title.style.marginBottom = '1rem';
    
    const date = document.createElement('p');
    date.textContent = `Дата: ${qrObject.dateDisplay}`;
    date.style.color = 'var(--text-secondary)';
    date.style.marginBottom = '1rem';
    
    const textArea = document.createElement('textarea');
    textArea.value = qrObject.text;
    textArea.readOnly = true;
    textArea.style.cssText = `
        width: 100%;
        min-height: 100px;
        padding: 1rem;
        margin: 1rem 0;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-primary);
        color: var(--text-primary);
        resize: vertical;
        font-family: monospace;
    `;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
    `;
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Копировать';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(qrObject.text).then(() => {
            showNotification('Текст скопирован', 'success');
        });
    };
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Закрыть';
    closeBtn.onclick = () => document.body.removeChild(modal);
    
    buttonContainer.appendChild(copyBtn);
    buttonContainer.appendChild(closeBtn);
    
    modalContent.appendChild(title);
    modalContent.appendChild(date);
    modalContent.appendChild(textArea);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    
    // Закрытие по клику на оверлей
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
}

// ==================== УДАЛЕНИЕ QR-КОДОВ ====================
function deleteQRCode(id) {
    if (!confirm('Удалить этот QR-код?')) return;
    
    const card = document.querySelector(`.qr-card[data-id="${id}"]`);
    if (card) {
        card.style.transform = 'scale(0.8)';
        card.style.opacity = '0';
        
        setTimeout(() => {
            state.qrCodes = state.qrCodes.filter(qr => qr.id !== id);
            saveToLocalStorage();
            
            if (card.parentNode) {
                card.parentNode.removeChild(card);
            }
            
            showNotification('QR-код удален', 'info');
        }, 300);
    }
}

// ==================== РЕНДЕРИНГ ДАННЫХ ====================
function renderTransferHistory() {
    const list = document.getElementById('transfer-history');
    if (!list) return;
    
    if (state.transferData.length === 0) {
        list.innerHTML = '<li style="text-align: center; padding: 2rem; color: var(--text-secondary);">Нет отсканированных данных</li>';
        return;
    }
    
    list.innerHTML = '';
    
    state.transferData.forEach((number, index) => {
        const li = document.createElement('li');
        
        const numberSpan = document.createElement('span');
        numberSpan.className = 'transfer-number';
        numberSpan.textContent = `${index + 1}. ${number}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'transfer-time';
        timeSpan.textContent = new Date().toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        li.appendChild(numberSpan);
        li.appendChild(timeSpan);
        
        // Копирование по клику
        li.addEventListener('click', () => {
            navigator.clipboard.writeText(number).then(() => {
                showNotification('Номер скопирован', 'info');
            });
        });
        
        li.title = 'Кликните для копирования';
        list.appendChild(li);
    });
}

function renderQRCodesGallery() {
    const gallery = document.getElementById('qrcode-gallery');
    if (!gallery) return;
    
    gallery.innerHTML = '';
    
    if (state.qrCodes.length === 0) {
        gallery.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                text-align: center;
                padding: 3rem 1rem;
                color: var(--text-secondary);
            ">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📷</div>
                <p>Нет сохраненных QR-кодов</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">Отсканируйте QR-коды в режиме "Сканер шк"</p>
            </div>
        `;
        return;
    }
    
    // Рендерим все QR коды
    state.qrCodes.forEach(qr => {
        generateQRCodeImage(qr);
    });
}

// ==================== ЭКСПОРТ CSV ====================
function initExportButton() {
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
}

function exportToCSV() {
    if (state.transferData.length === 0) {
        showNotification('Нет данных для экспорта', 'warning');
        return;
    }
    
    let csvContent = 'Номер,ID передачи,Дата сканирования\n';
    
    state.transferData.forEach((number, index) => {
        const date = new Date().toLocaleString('ru-RU');
        csvContent += `${index + 1},${number},${date}\n`;
    });
    
    const blob = new Blob(['\ufeff' + csvContent], {
        type: 'text/csv;charset=utf-8;'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `kbt_transfers_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification(`Экспортировано ${state.transferData.length} записей`, 'success');
}

// ==================== КНОПКИ ОЧИСТКИ ====================
function initClearButtons() {
    const clearTransfersBtn = document.getElementById('clearTransfersBtn');
    const clearQRCodesBtn = document.getElementById('clearQRCodesBtn');
    
    if (clearTransfersBtn) {
        clearTransfersBtn.addEventListener('click', clearTransferData);
    }
    
    if (clearQRCodesBtn) {
        clearQRCodesBtn.addEventListener('click', clearQRCodeData);
    }
}

function clearTransferData() {
    if (state.transferData.length === 0) {
        showNotification('Нет данных для очистки', 'warning');
        return;
    }
    
    if (confirm(`Очистить все отсканированные передачи (${state.transferData.length} записей)?`)) {
        state.transferData = [];
        saveToLocalStorage();
        renderTransferHistory();
        showNotification('Данные передач очищены', 'success');
    }
}

function clearQRCodeData() {
    if (state.qrCodes.length === 0) {
        showNotification('Нет QR-кодов для очистки', 'warning');
        return;
    }
    
    if (confirm(`Удалить все сохраненные QR-коды (${state.qrCodes.length} шт.)?`)) {
        state.qrCodes = [];
        saveToLocalStorage();
        renderQRCodesGallery();
        showNotification('QR-коды очищены', 'success');
    }
}

// ==================== LOCALSTORAGE ====================
function loadFromLocalStorage() {
    try {
        const savedTransfers = localStorage.getItem('kbt_transfers');
        const savedQRCodes = localStorage.getItem('kbt_qrcodes');
        
        if (savedTransfers) {
            state.transferData = JSON.parse(savedTransfers);
        }
        
        if (savedQRCodes) {
            state.qrCodes = JSON.parse(savedQRCodes);
        }
        
        console.log('Данные загружены');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        state.transferData = [];
        state.qrCodes = [];
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('kbt_transfers', JSON.stringify(state.transferData));
        localStorage.setItem('kbt_qrcodes', JSON.stringify(state.qrCodes));
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка сохранения данных', 'error');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function stopActiveScanner() {
    if (activeScanner && isScanning) {
        activeScanner.stop().then(() => {
            isScanning = false;
            activeScanner = null;
            console.log('Сканер остановлен');
        }).catch(err => {
            console.error('Ошибка остановки сканера:', err);
            isScanning = false;
            activeScanner = null;
        });
    }
}

function showNotification(message, type = 'info') {
    // Удаляем старые уведомления
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Автоудаление через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function playSuccessSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        // Игнорируем ошибки звука
    }
}

function playErrorSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 400;
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        // Игнорируем ошибки звука
    }
}

// Добавляем CSS для уведомлений
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 300px;
    }
    
    .notification.success {
        background: linear-gradient(135deg, #4CAF50, #45a049);
    }
    
    .notification.error {
        background: linear-gradient(135deg, #f44336, #d32f2f);
    }
    
    .notification.warning {
        background: linear-gradient(135deg, #ff9800, #f57c00);
    }
    
    .notification.info {
        background: linear-gradient(135deg, #2196F3, #1976D2);
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes slideUp {
        from {
            transform: translateY(50px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    .modal-overlay {
        animation: fadeIn 0.3s;
    }
    
    .modal-content {
        animation: slideUp 0.3s;
    }
`;
document.head.appendChild(notificationStyles);

// ==================== ОБРАБОТЧИКИ ОШИБОК ====================
window.addEventListener('error', function(event) {
    console.error('Глобальная ошибка:', event.error);
});

window.addEventListener('beforeunload', function() {
    stopActiveScanner();
});

console.log('KBT Utilities инициализирован');
