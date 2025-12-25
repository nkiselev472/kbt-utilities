// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ====================
let state = {
    currentMode: 'transfer', // 'transfer' или 'generic'
    transferData: [], // Массив для 10-значных чисел
    qrCodes: [] // Массив для объектов: { text: '...', timestamp: ... }
};

let transferScannerInstance = null;
let genericScannerInstance = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('KBT Utilities загружается...');
    
    // Загружаем сохраненные данные
    loadFromLocalStorage();
    
    // Инициализируем все компоненты
    initTheme();
    initModeSwitcher();
    initTransferScanner();
    initGenericScanner();
    initExportButton();
    
    // Рендерим существующие данные
    renderTransferHistory();
    renderQRCodesGallery();
    
    console.log('Приложение готово к работе!');
});

// ==================== ТЕМНАЯ/СВЕТЛАЯ ТЕМА ====================
function initTheme() {
    const toggleBtn = document.getElementById('themeToggle');
    
    // Проверяем сохраненную тему или системные настройки
    const savedTheme = localStorage.getItem('kbt_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', initialTheme);
    updateThemeButton(initialTheme, toggleBtn);
    
    // Обработчик переключения темы
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('kbt_theme', newTheme);
        updateThemeButton(newTheme, toggleBtn);
    });
}

function updateThemeButton(theme, button) {
    button.textContent = theme === 'dark' ? '☀️' : '🌙';
    button.title = theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на темную тему';
}

// ==================== ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ СКАНЕРА ====================
function initModeSwitcher() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    const panels = document.querySelectorAll('.scanner-panel');
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const mode = this.dataset.mode;
            
            // Останавливаем текущий сканер
            stopAllScanners();
            
            // Обновляем активные кнопки
            modeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Переключаем панели
            panels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${mode}-scanner`).classList.add('active');
            
            // Обновляем состояние
            state.currentMode = mode;
            
            console.log(`Переключен режим: ${mode === 'transfer' ? 'Сканер передач' : 'Сканер шк'}`);
        });
    });
}

// ==================== РЕЖИМ "СКАНЕР ПЕРЕДАЧ" ====================
function initTransferScanner() {
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    if (!startBtn || !stopBtn || !readerDiv) {
        console.error('Не найдены элементы сканера передач');
        return;
    }
    
    startBtn.addEventListener('click', startTransferScanning);
    stopBtn.addEventListener('click', stopTransferScanning);
}

function startTransferScanning() {
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    // Конфигурация сканера
    const config = {
        fps: 10,
        qrbox: { 
            width: 250, 
            height: 250,
            widthFromConfig: true
        },
        aspectRatio: 1.0,
        disableFlip: false
    };
    
    // Создаем экземпляр сканера, если еще не создан
    if (!transferScannerInstance) {
        transferScannerInstance = new Html5Qrcode("transfer-reader");
    }
    
    // Запускаем сканирование с задней камеры
    transferScannerInstance.start(
        { 
            facingMode: "environment" 
        }, 
        config,
        onTransferScanSuccess,
        onTransferScanError
    ).then(() => {
        // Успешный запуск
        startBtn.disabled = true;
        stopBtn.disabled = false;
        readerDiv.style.border = "2px solid #4CAF50";
        console.log('Сканер передач запущен');
    }).catch(err => {
        console.error('Ошибка запуска сканера:', err);
        alert('Не удалось запустить камеру. Проверьте разрешения.');
    });
}

function stopTransferScanning() {
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    if (transferScannerInstance && transferScannerInstance.isScanning) {
        transferScannerInstance.stop().then(() => {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            readerDiv.style.border = "";
            console.log('Сканер передач остановлен');
        }).catch(err => {
            console.error('Ошибка остановки сканера:', err);
        });
    }
}

function onTransferScanSuccess(decodedText) {
    console.log('Отсканировано (передачи):', decodedText);
    
    // Ищем 10-значное число по шаблону $1:1:XXXXXXXXXX:
    const pattern = /\$1:1:(\d{10}):/;
    const match = decodedText.match(pattern);
    
    if (!match) {
        showNotification(`Неверный формат QR. Ожидается $1:1:XXXXXXXXXX:`, 'error');
        return;
    }
    
    const tenDigitNumber = match[1];
    
    // Проверяем дубликаты
    if (state.transferData.includes(tenDigitNumber)) {
        showNotification(`Номер ${tenDigitNumber} уже был отсканирован`, 'warning');
        return;
    }
    
    // Добавляем в состояние
    state.transferData.push(tenDigitNumber);
    saveToLocalStorage();
    
    // Обновляем интерфейс
    renderTransferHistory();
    
    // Визуальная обратная связь
    showNotification(`Успешно отсканировано: ${tenDigitNumber}`, 'success');
    playSuccessSound();
    
    // Мигание рамки
    const readerDiv = document.getElementById('transfer-reader');
    readerDiv.style.border = "3px solid #4CAF50";
    setTimeout(() => {
        if (transferScannerInstance && transferScannerInstance.isScanning) {
            readerDiv.style.border = "2px solid #4CAF50";
        }
    }, 300);
}

function onTransferScanError(errorMessage) {
    // Игнорируем обычные ошибки сканирования (они происходят постоянно)
    if (!errorMessage.includes('NotFoundException')) {
        console.log('Ошибка сканирования:', errorMessage);
    }
}

// ==================== РЕЖИМ "СКАНЕР ШК" ====================
function initGenericScanner() {
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    
    if (!startBtn || !stopBtn) {
        console.error('Не найдены элементы сканера шк');
        return;
    }
    
    startBtn.addEventListener('click', startGenericScanning);
    stopBtn.addEventListener('click', stopGenericScanning);
}

function startGenericScanning() {
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    const config = {
        fps: 10,
        qrbox: { 
            width: 250, 
            height: 250 
        },
        aspectRatio: 1.0
    };
    
    // Создаем экземпляр сканера, если еще не создан
    if (!genericScannerInstance) {
        genericScannerInstance = new Html5Qrcode("generic-reader");
    }
    
    genericScannerInstance.start(
        { facingMode: "environment" },
        config,
        onGenericScanSuccess,
        onGenericScanError
    ).then(() => {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        readerDiv.style.border = "2px solid #2196F3";
        console.log('Сканер шк запущен');
    }).catch(err => {
        console.error('Ошибка запуска сканера:', err);
        alert('Не удалось запустить камеру. Проверьте разрешения.');
    });
}

function stopGenericScanning() {
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    if (genericScannerInstance && genericScannerInstance.isScanning) {
        genericScannerInstance.stop().then(() => {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            readerDiv.style.border = "";
            console.log('Сканер шк остановлен');
        }).catch(err => {
            console.error('Ошибка остановки сканера:', err);
        });
    }
}

function onGenericScanSuccess(decodedText) {
    console.log('Отсканировано (шк):', decodedText);
    
    // Создаем объект с данными QR
    const qrObject = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        text: decodedText,
        timestamp: new Date().toISOString(),
        dateDisplay: new Date().toLocaleString('ru-RU')
    };
    
    // Добавляем в состояние
    state.qrCodes.unshift(qrObject); // Добавляем в начало
    saveToLocalStorage();
    
    // Генерируем и отображаем QR код
    generateQRCodeImage(qrObject);
    
    // Визуальная обратная связь
    showNotification('QR-код сохранен', 'success');
    playSuccessSound();
    
    // Мигание рамки
    const readerDiv = document.getElementById('generic-reader');
    readerDiv.style.border = "3px solid #2196F3";
    setTimeout(() => {
        if (genericScannerInstance && genericScannerInstance.isScanning) {
            readerDiv.style.border = "2px solid #2196F3";
        }
    }, 300);
}

function onGenericScanError(errorMessage) {
    if (!errorMessage.includes('NotFoundException')) {
        console.log('Ошибка сканирования (шк):', errorMessage);
    }
}

// ==================== ГЕНЕРАЦИЯ И ОТОБРАЖЕНИЕ QR КОДОВ ====================
function generateQRCodeImage(qrObject) {
    const gallery = document.getElementById('qrcode-gallery');
    
    // Создаем контейнер для карточки
    const card = document.createElement('div');
    card.className = 'qr-card';
    card.dataset.id = qrObject.id;
    
    // Создаем canvas для генерации QR
    const canvas = document.createElement('canvas');
    
    // Используем библиотеку QRCode для генерации
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
            return;
        }
        
        // Создаем элементы карточки
        const img = document.createElement('img');
        img.src = canvas.toDataURL();
        img.alt = 'QR Code';
        img.title = 'Нажмите для просмотра текста';
        
        const textContainer = document.createElement('div');
        textContainer.className = 'qr-text';
        
        const textPreview = document.createElement('p');
        textPreview.textContent = truncateText(qrObject.text, 20);
        textPreview.title = qrObject.text;
        
        const dateInfo = document.createElement('small');
        dateInfo.textContent = qrObject.dateDisplay;
        dateInfo.style.color = 'var(--text-secondary)';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-qr-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Удалить QR-код';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteQRCode(qrObject.id);
        };
        
        // Обработчик для просмотра полного текста
        card.addEventListener('click', () => {
            showQRDetail(qrObject);
        });
        
        // Собираем карточку
        textContainer.appendChild(textPreview);
        textContainer.appendChild(dateInfo);
        
        card.appendChild(deleteBtn);
        card.appendChild(img);
        card.appendChild(textContainer);
        
        // Добавляем в начало галереи
        gallery.prepend(card);
    });
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showQRDetail(qrObject) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: var(--bg-secondary);
        padding: 2rem;
        border-radius: 12px;
        max-width: 90%;
        max-height: 90%;
        overflow: auto;
        text-align: center;
    `;
    
    const qrCanvas = document.createElement('canvas');
    QRCode.toCanvas(qrCanvas, qrObject.text, {
        width: 200,
        margin: 2,
        color: {
            dark: document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000',
            light: '#00000000'
        }
    }, function() {
        const textArea = document.createElement('textarea');
        textArea.value = qrObject.text;
        textArea.readOnly = true;
        textArea.style.cssText = `
            width: 100%;
            margin: 1rem 0;
            padding: 0.5rem;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-primary);
            color: var(--text-primary);
            resize: none;
        `;
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Закрыть';
        closeBtn.onclick = () => document.body.removeChild(modal);
        
        modalContent.appendChild(qrCanvas);
        modalContent.appendChild(document.createElement('br'));
        modalContent.appendChild(textArea);
        modalContent.appendChild(document.createElement('br'));
        modalContent.appendChild(closeBtn);
    });
    
    modal.appendChild(modalContent);
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
    
    document.body.appendChild(modal);
}

// ==================== УДАЛЕНИЕ QR КОДОВ ====================
function deleteQRCode(id) {
    if (!confirm('Удалить этот QR-код из истории?')) return;
    
    // Удаляем из состояния
    state.qrCodes = state.qrCodes.filter(qr => qr.id !== id);
    saveToLocalStorage();
    
    // Удаляем из DOM
    const card = document.querySelector(`.qr-card[data-id="${id}"]`);
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        setTimeout(() => card.remove(), 300);
    }
    
    showNotification('QR-код удален', 'info');
}

// ==================== ЭКСПОРТ ДАННЫХ В CSV ====================
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
    
    // Создаем CSV содержимое
    let csvContent = 'ID,Номер передачи,Дата сканирования\n';
    
    state.transferData.forEach((number, index) => {
        const date = new Date().toLocaleString('ru-RU');
        csvContent += `${index + 1},${number},${date}\n`;
    });
    
    // Создаем Blob и ссылку для скачивания
    const blob = new Blob(['\ufeff' + csvContent], { 
        type: 'text/csv;charset=utf-8;' 
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.download = `kbt_transfers_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification(`Экспортировано ${state.transferData.length} записей`, 'success');
}

// ==================== РЕНДЕРИНГ ДАННЫХ ====================
function renderTransferHistory() {
    const list = document.getElementById('transfer-history');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (state.transferData.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: var(--text-secondary);">Нет отсканированных данных</li>';
        return;
    }
    
    // Отображаем в обратном порядке (последние сверху)
    [...state.transferData].reverse().forEach((number, index) => {
        const realIndex = state.transferData.length - index;
        const li = document.createElement('li');
        
        li.innerHTML = `
            <span class="number">${realIndex}. ${number}</span>
            <span class="time">${new Date().toLocaleTimeString('ru-RU', { 
                hour: '2-digit', 
                minute: '2-digit' 
            })}</span>
        `;
        
        // Добавляем возможность копирования по клику
        li.addEventListener('click', () => {
            navigator.clipboard.writeText(number).then(() => {
                showNotification('Номер скопирован в буфер', 'info');
            });
        });
        
        li.title = 'Кликните для копирования номера';
        list.appendChild(li);
    });
}

function renderQRCodesGallery() {
    const gallery = document.getElementById('qrcode-gallery');
    if (!gallery) return;
    
    gallery.innerHTML = '';
    
    if (state.qrCodes.length === 0) {
        gallery.innerHTML = '<div style="text-align: center; color: var(--text-secondary); grid-column: 1 / -1;">Нет сохраненных QR-кодов</div>';
        return;
    }
    
    // Отображаем все QR коды (уже в правильном порядке)
    state.qrCodes.forEach(qr => generateQRCodeImage(qr));
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
        
        console.log('Данные загружены из localStorage');
    } catch (error) {
        console.error('Ошибка загрузки из localStorage:', error);
        // Если данные повреждены, сбрасываем
        state.transferData = [];
        state.qrCodes = [];
        saveToLocalStorage();
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('kbt_transfers', JSON.stringify(state.transferData));
        localStorage.setItem('kbt_qrcodes', JSON.stringify(state.qrCodes));
    } catch (error) {
        console.error('Ошибка сохранения в localStorage:', error);
        showNotification('Ошибка сохранения данных', 'error');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function stopAllScanners() {
    if (transferScannerInstance && transferScannerInstance.isScanning) {
        transferScannerInstance.stop().catch(console.error);
        const startBtn = document.getElementById('startTransferScan');
        const stopBtn = document.getElementById('stopTransferScan');
        const readerDiv = document.getElementById('transfer-reader');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) readerDiv.style.border = "";
    }
    
    if (genericScannerInstance && genericScannerInstance.isScanning) {
        genericScannerInstance.stop().catch(console.error);
        const startBtn = document.getElementById('startGenericScan');
        const stopBtn = document.getElementById('stopGenericScan');
        const readerDiv = document.getElementById('generic-reader');
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) readerDiv.style.border = "";
    }
}

function showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 1001;
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    
    // Цвета в зависимости от типа
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        warning: '#ff9800',
        info: '#2196F3'
    };
    
    notification.style.background = colors[type] || colors.info;
    
    document.body.appendChild(notification);
    
    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
    
    // Добавляем CSS анимации, если их еще нет
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

function playSuccessSound() {
    try {
        // Простой звук через Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Звук недоступен:', error);
    }
}

// ==================== ОБРАБОТЧИКИ ОШИБОК ====================
window.addEventListener('error', function(event) {
    console.error('Глобальная ошибка:', event.error);
    showNotification('Произошла ошибка в приложении', 'error');
});

// Очистка при закрытии страницы
window.addEventListener('beforeunload', function() {
    stopAllScanners();
});

// ==================== ИНИЦИАЛИЗАЦИЯ СЕРВИСА ====================
// Проверяем поддержку необходимых API
if (!('localStorage' in window)) {
    alert('Внимание: Ваш браузер не поддерживает localStorage. Данные не будут сохраняться.');
}

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Внимание: Ваш браузер не поддерживает доступ к камере. Сканирование QR-кодов недоступно.');
}

console.log('KBT Utilities инициализирован');